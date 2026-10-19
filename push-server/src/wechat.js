'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';

/**
 * access_token 每天有刷新上限，这里落盘缓存，跨进程重启复用。
 */
class TokenStore {
  constructor(file) {
    this.file = file;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }

  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data), 'utf8');
  }

  async get(appId, appSecret, force = false) {
    const cached = this.read();
    // 提前 5 分钟过期，避免临界失败
    if (!force && cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
      return cached.token;
    }
    const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(
      appId
    )}&secret=${encodeURIComponent(appSecret)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    if (!json.access_token) {
      throw new Error(`获取 access_token 失败：${json.errcode} ${json.errmsg}`);
    }
    this.write({
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 7200) * 1000
    });
    return json.access_token;
  }

  invalidate() {
    try {
      fs.unlinkSync(this.file);
    } catch {
      /* 文件不存在即视为已失效 */
    }
  }
}

/** code 换 openid */
async function code2openid(appId, appSecret, code) {
  const url = `${SESSION_URL}?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(
    appSecret
  )}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  if (!json.openid) {
    throw new Error(`换取 openid 失败：${json.errcode} ${json.errmsg}`);
  }
  return json.openid;
}

const LIMITS = { thing: 20, phrase: 5, character_string: 32, name: 10 };

/** 按微信字段类型截断，超长会被服务端整条拒收 */
function normalizeValue(key, value) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const prefix = key.replace(/[0-9]+$/, '');
  const limit = LIMITS[prefix];
  if (!limit) return text;
  if (text.length <= limit) return text;
  return prefix === 'thing' ? `${text.slice(0, limit - 1)}…` : text.slice(0, limit);
}

/**
 * 发送一条订阅消息
 * @returns {Promise<{ok:boolean, code?:number, message?:string, expired?:boolean}>}
 */
async function sendSubscribe({ token, openid, templateId, page, data, state }) {
  const payload = {
    touser: openid,
    template_id: templateId,
    page,
    miniprogram_state: state,
    lang: 'zh_CN'
  };

  if (data && Object.keys(data).length) {
    payload.data = {};
    for (const [key, value] of Object.entries(data)) {
      payload.data[key] = { value: normalizeValue(key, value) };
    }
  }

  const res = await fetch(`${SEND_URL}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const json = await res.json();

  if (json.errcode === 0) return { ok: true };

  // 43101：用户拒收或没有可用的订阅次数
  const expired = json.errcode === 43101;
  return { ok: false, code: json.errcode, message: json.errmsg, expired };
}

module.exports = { TokenStore, code2openid, sendSubscribe, normalizeValue };
