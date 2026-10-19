/**
 * 数据层：从央视网拉取新闻联播各期内容并结构化
 *
 * 两个接口配合使用：
 *   mode=0 → 每期的「本期节目主要内容」清单（含条目与快讯子项的结构）
 *   mode=1 → 每期拆开后的单条视频列表（含每条自己的页面地址）
 *
 * 后者用于给每个条目挂上详情页链接，这样点开某一条就能看它的完整正文。
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
const CACHE_KEY = 'xwlb_cache_v2';
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 小时
const ITEM_PAGES = 2; // 分条列表抓 2 页，约覆盖 16 天

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(dateStr) {
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return WEEKDAYS[d.getDay()] || '';
}

/** 标题归一化，用于把分条视频和条目对上 */
function normalizeTitle(text) {
  return String(text || '')
    .replace(/^\[视频\]/, '')
    .replace(/[\s\u3000·・、，,。.；;：:！!？?“”"'（）()【】\[\]—\-]/g, '')
    .trim();
}

function requestPage(page, mode, n) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API}?id=${COLUMN_ID}&n=${n}&sort=desc&p=${page}&mode=${mode}&serviceId=tvcctv`,
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

/**
 * 抓分条视频列表，返回 date → (归一化标题 → 页面地址)
 * 一页 100 条大约覆盖 8 天，两页约 16 天。
 */
async function fetchItemIndex() {
  const index = new Map();

  for (let page = 1; page <= ITEM_PAGES; page++) {
    let list;
    try {
      list = await requestPage(page, 1, 100);
    } catch (err) {
      break;
    }
    if (!list.length) break;

    for (const item of list) {
      const date = String(item.time || '').slice(0, 10);
      if (!date) continue;
      const key = normalizeTitle(item.title);
      if (!key) continue;
      if (!index.has(date)) index.set(date, new Map());
      const day = index.get(date);
      if (!day.has(key)) day.set(key, item.url || '');
    }
  }

  return index;
}

/**
 * 在某天的分条映射里找条目对应的页面地址。
 * 先精确匹配；超长标题在分条列表里常被截断，所以再用前缀匹配兜底。
 */
function lookupItemUrl(day, title) {
  if (!day) return '';
  const key = normalizeTitle(title);
  if (!key) return '';
  if (day.has(key)) return day.get(key);

  for (const [candidate, url] of day) {
    if (candidate.length < 12) continue;
    if (key.startsWith(candidate) || candidate.startsWith(key)) return url;
  }
  return '';
}

/** 把分条链接挂到对应条目上 */
function attachVideoUrls(editions, index) {
  if (!index || !index.size) return;
  for (const edition of editions) {
    const day = index.get(edition.date);
    if (!day) continue;
    for (const item of edition.mains) {
      const url = lookupItemUrl(day, item.title);
      if (url) item.videoUrl = url;
    }
    for (const group of edition.flashes) {
      const url = lookupItemUrl(day, group.title);
      if (url) group.videoUrl = url;
    }
  }
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

  // 整期清单和分条列表并行抓，后者失败不影响前者
  const itemPromise = fetchItemIndex().catch(() => null);

  for (let page = 1; page <= wantPages; page++) {
    try {
      const list = await requestPage(page, 0, 20);
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
    await itemPromise;
    // 完全失败：优先用过期缓存，其次用包内快照
    if (cache && cache.editions.length) {
      return { editions: cache.editions, fromCache: true, degraded: true, error: lastError };
    }
    return { editions: snapshot, fromCache: false, degraded: true, error: lastError };
  }

  const editions = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const itemIndex = await itemPromise;
  attachVideoUrls(editions, itemIndex);

  writeCache(editions, pagesDone);
  return { editions, fromCache: false, degraded: false, error: '' };
}

/** 同步读取包内快照，用于首屏立即渲染 */
function getSnapshot() {
  const cached = readCache();
  if (cached && cached.editions && cached.editions.length) return cached.editions;
  return snapshot;
}

module.exports = { loadEditions, getSnapshot, weekdayOf, normalizeTitle, lookupItemUrl };
