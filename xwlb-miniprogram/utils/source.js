/**
 * 数据层：从央视网拉取新闻联播各期内容并结构化
 *
 * 设计取舍：
 * - 直连节目源，所以「每天自动最新」，不依赖任何定时任务；
 * - 抓取结果按天缓存在本地，同一天内重复打开不再请求；
 * - 源站不可用时回退到包内快照（data/snapshot.js），保证永远有内容可看。
 */
const { parseBrief, groupItems, countPoints } = require('./parse');
const snapshot = require('../data/snapshot');

const COLUMN_ID = 'TOPC1451528971114112';
const API = 'https://api.cntv.cn/NewVideo/getVideoListByColumn';
const CACHE_KEY = 'xwlb_cache_v1';
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 小时

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(dateStr) {
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return WEEKDAYS[d.getDay()] || '';
}

function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD */
function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildEdition(raw) {
  const date = String(raw.time || '').slice(0, 10);
  if (!date) return null;
  const items = parseBrief(raw.brief);
  if (!items.length) return null;
  const grouped = groupItems(items);
  const [, m, d] = date.split('-');
  return {
    date,
    displayDate: `${Number(m)}月${Number(d)}日`,
    weekday: weekdayOf(date),
    items,
    mains: grouped.mains,
    flashes: grouped.flashes,
    pointCount: countPoints(items),
    videoUrl: raw.url || '',
    cover: raw.image || '',
    duration: raw.length || ''
  };
}

function requestPage(page) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API}?id=${COLUMN_ID}&n=20&sort=desc&p=${page}&mode=0&serviceId=tvcctv`,
      method: 'GET',
      dataType: 'json',
      header: { Referer: 'https://tv.cctv.com/lm/xwlb/' },
      timeout: 12000,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const list = (res.data && res.data.data && res.data.data.list) || [];
        resolve(list);
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

function readCache() {
  try {
    const cache = wx.getStorageSync(CACHE_KEY);
    if (!cache || !cache.editions || !cache.editions.length) return null;
    return cache;
  } catch (e) {
    return null;
  }
}

function writeCache(editions, pages) {
  try {
    wx.setStorageSync(CACHE_KEY, { fetchedAt: Date.now(), editions, pages });
  } catch (e) {
    // 存储超限时忽略，不影响页面
  }
}

function mergeEditions(target, list) {
  for (let i = 0; i < list.length; i++) {
    const edition = buildEdition(list[i]);
    if (!edition) continue;
    if (target.has(edition.date)) continue; // 19:00 / 21:00 两版只留一条
    target.set(edition.date, edition);
  }
}

/**
 * 拉取最近若干期
 * @param {{pages?:number, force?:boolean}} options
 * @returns {Promise<{editions:Array, fromCache:boolean, degraded:boolean, error:string}>}
 */
async function loadEditions(options) {
  const opts = options || {};
  const wantPages = Math.max(1, Math.min(6, opts.pages || 3));

  const cache = readCache();
  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL && cache.pages >= wantPages;
  if (cache && fresh && !opts.force) {
    return { editions: cache.editions, fromCache: true, degraded: false, error: '' };
  }

  const byDate = new Map();
  let pagesDone = 0;
  let lastError = '';

  for (let page = 1; page <= wantPages; page++) {
    try {
      const list = await requestPage(page);
      if (!list.length) break;
      mergeEditions(byDate, list);
      pagesDone = page;
      if (byDate.size >= wantPages * 11) break;
    } catch (err) {
      lastError = err.message || '网络异常';
      break;
    }
  }

  if (byDate.size === 0) {
    // 完全失败：优先用过期缓存，其次用包内快照
    if (cache && cache.editions.length) {
      return { editions: cache.editions, fromCache: true, degraded: true, error: lastError };
    }
    return { editions: snapshot, fromCache: false, degraded: true, error: lastError };
  }

  const editions = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  writeCache(editions, pagesDone);
  return { editions, fromCache: false, degraded: false, error: '' };
}

/** 同步读取包内快照，用于首屏立即渲染 */
function getSnapshot() {
  const cached = readCache();
  if (cached && cached.editions && cached.editions.length) return cached.editions;
  return snapshot;
}

module.exports = { loadEditions, getSnapshot, toDateKey, weekdayOf };
