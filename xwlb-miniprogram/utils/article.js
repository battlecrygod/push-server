/**
 * 单条新闻正文
 *
 * 央视网每条新闻都有自己的页面（形如 tv.cctv.com/2026/10/18/VIDExxx.shtml），
 * 页面里 `#content_area` 就是这条新闻的完整文字稿。
 * 这里负责抓取、解析，并按条目缓存到本地，避免重复请求。
 */

const CACHE_PREFIX = 'xwlb:art:';

const ENTITIES = {
  '&mdash;': '—',
  '&ndash;': '–',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&hellip;': '…',
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'"
};

function decode(text) {
  let out = String(text || '');
  for (const key of Object.keys(ENTITIES)) {
    out = out.split(key).join(ENTITIES[key]);
  }
  // 处理数字实体
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return out;
}

/**
 * 从页面 HTML 中提取正文段落
 * @returns {string[]} 段落数组
 */
function extractParagraphs(html) {
  if (!html) return [];

  const anchor = html.indexOf('content_area');
  if (anchor === -1) return [];

  const open = html.indexOf('>', anchor);
  if (open === -1) return [];
  const close = html.indexOf('</div>', open);
  if (close === -1) return [];

  const block = html.slice(open + 1, close);
  const paras = block.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [];

  return paras
    .map((p) => decode(p.replace(/<[^>]+>/g, '')).replace(/[ \t\u3000]+/g, ' ').trim())
    .filter((text) => text.length > 0);
}

function cacheKey(date, title) {
  // 标题里可能有特殊字符，用简单哈希保证 key 稳定且短
  let hash = 0;
  const seed = `${date}|${title}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 2147483647;
  }
  return `${CACHE_PREFIX}${date}:${hash}`;
}

function readCache(date, title) {
  try {
    const hit = wx.getStorageSync(cacheKey(date, title));
    return Array.isArray(hit) && hit.length ? hit : null;
  } catch (e) {
    return null;
  }
}

function writeCache(date, title, paragraphs) {
  try {
    wx.setStorageSync(cacheKey(date, title), paragraphs);
  } catch (e) {
    /* 存储超限忽略 */
  }
}

function requestHtml(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      dataType: 'text',
      responseType: 'text',
      timeout: 15000,
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(String(res.data || ''));
      },
      fail(err) {
        const message = (err && err.errMsg) || '网络请求失败';
        const error = new Error(message);
        error.raw = message;
        reject(error);
      }
    });
  });
}

/**
 * 获取某条新闻的正文
 * @param {{url:string, date:string, title:string}} target
 * @returns {Promise<{paragraphs:string[], source:'cache'|'network'}>}
 */
async function loadArticle(target) {
  const { url, date, title } = target || {};

  const cached = readCache(date, title);
  if (cached) return { paragraphs: cached, source: 'cache' };

  if (!url) throw new Error('NO_URL');

  const html = await requestHtml(url);
  const paragraphs = extractParagraphs(html);
  if (!paragraphs.length) throw new Error('NO_CONTENT');

  writeCache(date, title, paragraphs);
  return { paragraphs, source: 'network' };
}

module.exports = { loadArticle, extractParagraphs };
