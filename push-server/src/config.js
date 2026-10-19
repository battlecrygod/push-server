'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/**
 * 配置来源优先级：环境变量 > config.json > 默认值
 *
 * 环境变量的意义在于 GitHub Actions 这类场景：仓库里不提交含密钥的 config.json，
 * 改用 Secrets 注入；本地开发仍然用 config.json。
 */
function load() {
  const file = path.join(ROOT, 'config.json');
  let raw = {};

  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`config.json 解析失败：${err.message}`);
    }
  }

  const env = process.env;

  const config = {
    appId: env.XWLB_APP_ID || raw.appId || '',
    appSecret: env.XWLB_APP_SECRET || raw.appSecret || '',
    templateId: env.XWLB_TEMPLATE_ID || raw.templateId || '',
    page: env.XWLB_PAGE || raw.page || 'pages/index/index',
    pushTime: raw.pushTime || '07:30',
    port: Number(raw.port) || 8787,
    clientToken: env.XWLB_CLIENT_TOKEN || raw.clientToken || '',
    miniprogramState: env.XWLB_MINIPROGRAM_STATE || raw.miniprogramState || 'formal',
    subscriberFile: path.resolve(ROOT, raw.subscriberFile || './data/subscribers.json'),
    // 模板字段映射，键是模板里的字段名，值是占位符
    templateData: raw.templateData || {
      thing1: '{title}',
      thing2: '{summary20}',
      date3: '{date}'
    }
  };

  const missing = [];
  if (!config.appId) missing.push('appId');
  if (!config.appSecret) missing.push('appSecret');
  if (!config.templateId) missing.push('templateId');

  return { config, missing, dryrunnable: missing.length === 0 };
}

module.exports = { load, ROOT };
