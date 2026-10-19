'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** 订阅名单：本地 JSON，写入用临时文件替换，避免中途崩溃写坏 */
class SubscriberStore {
  constructor(file) {
    this.file = file;
    this.cache = null;
  }

  load() {
    if (this.cache) return this.cache;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.cache = raw && typeof raw === 'object' ? raw : {};
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  list() {
    return Object.entries(this.load()).map(([openid, meta]) => ({ openid, ...meta }));
  }

  count() {
    return Object.keys(this.load()).length;
  }

  add(openid, meta = {}) {
    const db = this.load();
    const now = new Date().toISOString();
    db[openid] = {
      subscribedAt: db[openid]?.subscribedAt || now,
      updatedAt: now,
      ...db[openid],
      ...meta
    };
    this.save();
    return db[openid];
  }

  markSent(openid) {
    const db = this.load();
    if (!db[openid]) return;
    db[openid].lastSentAt = new Date().toISOString();
    db[openid].lastError = null;
    this.save();
  }

  markError(openid, message) {
    const db = this.load();
    if (!db[openid]) return;
    db[openid].lastError = String(message).slice(0, 200);
    this.save();
  }

  remove(openid) {
    const db = this.load();
    delete db[openid];
    this.save();
  }
}

/** 记录最近一次成功推送的日期，防止重复推送 */
class RunState {
  constructor(file) {
    this.file = file;
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  write(patch) {
    const next = { ...this.read(), ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2), 'utf8');
  }
}

module.exports = { SubscriberStore, RunState };
