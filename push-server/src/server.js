'use strict';

const http = require('node:http');
const path = require('node:path');
const { load } = require('./config');
const { code2openid } = require('./wechat');
const { SubscriberStore } = require('./store');
const { runPush } = require('./push');

const MAX_BODY = 8 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createServer(config) {
  const store = new SubscriberStore(config.subscriberFile);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, subscribers: store.count(), time: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/subscribe') {
      // 简单口令，防止别人刷你的订阅名单
      if (config.clientToken) {
        const token = req.headers['x-client-token'];
        if (token !== config.clientToken) {
          json(res, 401, { ok: false, error: 'unauthorized' });
          return;
        }
      }

      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        if (!body.code) {
          json(res, 400, { ok: false, error: 'missing code' });
          return;
        }
        const openid = await code2openid(config.appId, config.appSecret, body.code);
        store.add(openid, { source: 'miniprogram' });
        json(res, 200, { ok: true, total: store.count() });
      } catch (err) {
        console.error('[subscribe]', err.message);
        json(res, 500, { ok: false, error: 'server error' });
      }
      return;
    }

    json(res, 404, { ok: false, error: 'not found' });
  });
}

function startScheduler(config) {
  const stateFile = path.resolve(__dirname, '..', 'data', 'state.json');
  const { RunState } = require('./store');
  const state = new RunState(stateFile);
  const [targetHour, targetMinute] = config.pushTime.split(':').map(Number);

  let running = false;

  setInterval(async () => {
    const now = new Date();
    if (now.getHours() !== targetHour || now.getMinutes() !== targetMinute) return;

    const today = todayKey(now);
    if (state.read().scheduledFor === today) return;
    if (running) return;

    running = true;
    try {
      console.log(`\n[${now.toLocaleString('zh-CN')}] 开始每日推送`);
      await runPush({});
      state.write({ scheduledFor: today });
    } catch (err) {
      console.error('推送失败：', err.message);
    } finally {
      running = false;
    }
  }, 60 * 1000);

  console.log(`定时任务已启动：每天 ${config.pushTime} 推送`);
}

module.exports = { createServer, startScheduler, todayKey };
