/**
 * 视图层格式化：把结构化条目转成 WXML 可直接绑定的字段
 * （WXML 表达式不支持方法调用，所以统一在 JS 里算好）
 */

const TAG_STYLES = {
  总书记: 'tag--top',
  总理: 'tag--top',
  专题: 'tag--domestic',
  评论: 'tag--flash',
  国内: 'tag--domestic',
  国际: 'tag--international',
  快讯: 'tag--flash'
};

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function tagOf(item) {
  const title = item.title || '';
  if (/习近平|总书记/.test(title)) return '总书记';
  if (/李强|总理/.test(title)) return '总理';
  if (/央视快评|本台评论|短评/.test(title)) return '评论';
  if (/【/.test(title)) return '专题';
  if (/快讯/.test(title)) return '快讯';
  if (item.region === 'international') return '国际';
  return '国内';
}

function decorateItem(item, index) {
  const tag = tagOf(item);
  return {
    key: `${index}-${item.n}`,
    index: pad2(index + 1),
    title: item.title,
    tag,
    tagClass: TAG_STYLES[tag] || 'tag--domestic',
    children: (item.children || []).map((c, i) => ({
      key: `${index}-${i}`,
      index: String(i + 1),
      title: c.title
    }))
  };
}

function decorateEdition(edition) {
  if (!edition) return null;
  return {
    date: edition.date,
    displayDate: edition.displayDate || edition.date,
    weekday: edition.weekday || '',
    pointCount: edition.pointCount || 0,
    videoUrl: edition.videoUrl || '',
    mains: (edition.mains || []).map(decorateItem),
    flashes: (edition.flashes || []).map(decorateItem),
    mainCount: (edition.mains || []).length
  };
}

/** 归档列表用：只保留摘要信息 */
function decorateArchiveItem(edition) {
  const mains = edition.mains || [];
  const lead = mains.length ? mains[0].title : '';
  return {
    date: edition.date,
    displayDate: edition.displayDate || edition.date,
    day: String(Number(edition.date.slice(8, 10))),
    weekday: edition.weekday || '',
    pointCount: edition.pointCount || 0,
    lead: lead.length > 42 ? `${lead.slice(0, 42)}…` : lead
  };
}

module.exports = { decorateEdition, decorateArchiveItem, pad2, tagOf, TAG_STYLES };
