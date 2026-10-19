/**
 * 一句话摘要
 *
 * 三级取用，越靠前越省：
 *   1. 本地缓存（同一天不重复生成）
 *   2. 云端共享缓存（所有用户共用一份，只生成一次）
 *   3. 调用云端大模型生成 → 回写云端缓存
 * 全部失败时用规则拼一句，保证页面不空。
 */
const { cloud, pickModel } = require('./cloud');

const LOCAL_PREFIX = 'xwlb:digest:';

const SYSTEM_PROMPT =
  '你是《新闻联播》的编辑。任务是把当天全部条目浓缩成一句导语，供读者在早上快速了解昨天发生了什么。' +
  '要求：只输出导语本身，40 到 60 个汉字；抓住最重要的两三件事，按重要性排序；' +
  '语言平实客观，不用「本期节目」「主要内容如下」这类套话，不用引号、书名号以外的符号，不加结尾点评。';

function localGet(date) {
  try {
    return wx.getStorageSync(LOCAL_PREFIX + date) || '';
  } catch (e) {
    return '';
  }
}

function localSet(date, text) {
  try {
    wx.setStorageSync(LOCAL_PREFIX + date, text);
  } catch (e) {
    /* 忽略 */
  }
}

/** 规则兜底：取前三条主新闻，各截 20 字 */
function fallbackDigest(edition) {
  const top = (edition.mains || []).slice(0, 3).map((item) => {
    const t = item.title.replace(/——.*$/, '').replace(/[，。；、]$/, '');
    return t.length > 20 ? `${t.slice(0, 20)}…` : t;
  });
  if (!top.length) return '本期内容暂无法生成摘要。';
  return `${top.join('；')}。另有多条国内国际快讯。`;
}

/** 把当天的条目压成给模型的输入 */
function buildPrompt(edition) {
  const lines = [];
  for (const item of edition.mains || []) {
    lines.push(`${item.n}. ${item.title}`);
  }
  for (const group of edition.flashes || []) {
    const kids = (group.children || []).map((c) => c.title).join('；');
    lines.push(`${group.n}. ${group.title}：${kids}`);
  }
  return `日期：${edition.date}\n条目：\n${lines.join('\n')}`;
}

async function readCloud(date) {
  const { data, error } = await cloud.database
    .from('daily_digest')
    .select('summary')
    .eq('date', date)
    .maybeSingle();
  if (error || !data) return '';
  return data.summary || '';
}

async function writeCloud(date, summary, model) {
  const { error } = await cloud.database
    .from('daily_digest')
    .insert({ date, summary, model });
  // 23505 = 主键冲突，说明别人刚写好了，属于正常情况
  if (error && error.code !== '23505') {
    console.warn('[digest] 云端缓存写入失败', error.code || error.message);
  }
}

async function generate(edition) {
  const model = await pickModel();
  if (!model) throw new Error('当前没有可用模型');

  let text = '';
  const stream = cloud.llm.chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(edition) }
    ],
    stream: true,
    temperature: 0.6,
    max_tokens: 200
  });

  for await (const chunk of stream) {
    const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (delta && delta.content) text += delta.content;
  }

  text = text.replace(/^["「『]|["」』]$/g, '').replace(/\s+/g, '').trim();
  if (text.length < 10) throw new Error('模型返回内容过短');
  return { summary: text.slice(0, 200), modelId: model.id };
}

/**
 * @param {object} edition
 * @param {{force?:boolean}} options
 * @returns {Promise<{summary:string, source:'local'|'cloud'|'model'|'fallback'}>}
 */
async function getDigest(edition, options) {
  const opts = options || {};
  if (!edition || !edition.date) return { summary: '', source: 'fallback' };

  if (!opts.force) {
    const cached = localGet(edition.date);
    if (cached) return { summary: cached, source: 'local' };
  }

  try {
    const remote = await readCloud(edition.date);
    if (remote) {
      localSet(edition.date, remote);
      return { summary: remote, source: 'cloud' };
    }
  } catch (err) {
    console.warn('[digest] 读取云端缓存失败', err && err.message);
  }

  try {
    const result = await generate(edition);
    localSet(edition.date, result.summary);
    writeCloud(edition.date, result.summary, result.modelId).catch(() => {});
    return { summary: result.summary, source: 'model' };
  } catch (err) {
    console.warn('[digest] 生成失败', err && err.message);
  }

  const fallback = fallbackDigest(edition);
  localSet(edition.date, fallback);
  return { summary: fallback, source: 'fallback' };
}

module.exports = { getDigest, fallbackDigest };
