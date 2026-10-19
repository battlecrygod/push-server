/**
 * 新闻联播文稿解析
 *
 * 央视网接口返回的 brief 形如：
 *   本期节目主要内容：
 *   1.厚植绿色根基 因地制宜推动高质量发展；
 *   2.李强出席2026世界传统医药大会开幕式并致辞；
 *   ...
 *   9.国内联播快讯：
 *   （1）《世界职业技术教育标准框架》发布；
 *   （2）粤港澳大湾区首个知识型综保区正式封关运作；
 *   ...
 *   （《新闻联播》 20261017 21:00）
 *
 * 本模块把它拆成结构化条目，纯函数，无副作用，小程序与 Node 共用。
 */

var HEADER_RE = /^本期节目主要内容[：:]\s*$/;
var FOOTER_RE = /^[（(]\s*《新闻联播》.*[）)]\s*$/;
var MAIN_RE = /^(\d{1,2})[.．、]\s*(.+)$/;
var SUB_RE = /^[（(]\s*(\d{1,2})\s*[）)]\s*(.+)$/;

/** 去掉句末标点与多余空白 */
function tidy(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[；;。，,、]+$/g, '')
    .trim();
}

/** 按中文分号切成候选行，同时保留「快讯：」这类换行结构 */
function splitLines(brief) {
  if (!brief) return [];
  var text = String(brief).replace(/\r\n?/g, '\n');
  var out = [];
  var rawLines = text.split('\n');
  for (var i = 0; i < rawLines.length; i++) {
    var line = rawLines[i].replace(/^\s+|\s+$/g, '');
    if (!line) continue;
    out.push(line);
  }
  return out;
}

/**
 * 判断一级条目是否属于「快讯」分组
 */
function isFlashGroup(title) {
  return /联播快讯/.test(title);
}

/** 粗略判断分区，用于配色：国内 / 国际 */
function guessRegion(title, index, total) {
  if (/国际|联合国|美国|俄罗斯|俄方|乌克兰|欧盟|日本|韩国|朝鲜|伊朗|以色列|沙特|也门|胡塞|英国|法国|德国|加沙|巴以|北约|非盟|东盟/.test(title)) {
    return 'international';
  }
  // 靠后的条目更可能是国际新闻
  if (total > 8 && index >= total - 2) return 'international';
  return 'domestic';
}

/**
 * @param {string} brief 接口的 brief 字段
 * @returns {Array<{n:number,title:string,type:string,region:string,children:Array<{n:number,title:string}>}>}
 */
function parseBrief(brief) {
  var lines = splitLines(brief);
  var items = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (HEADER_RE.test(line) || FOOTER_RE.test(line)) continue;

    var subMatch = line.match(SUB_RE);
    if (subMatch && current) {
      current.children.push({ n: Number(subMatch[1]), title: tidy(subMatch[2]) });
      continue;
    }

    var mainMatch = line.match(MAIN_RE);
    if (mainMatch) {
      current = {
        n: Number(mainMatch[1]),
        title: tidy(mainMatch[2]),
        type: 'main',
        region: 'domestic',
        children: []
      };
      // 形如「9.国内联播快讯：」——标题后的冒号说明它是一个分组
      if (isFlashGroup(current.title)) {
        current.type = 'flash';
        current.title = current.title.replace(/[：:]\s*$/, '');
      }
      items.push(current);
      continue;
    }

    // 没有编号但属于上一条的续行（长标题被换行截断）
    if (current && current.children.length === 0) {
      current.title = tidy(current.title + ' ' + line);
    }
  }

  // 分区标注
  var total = items.length;
  for (var j = 0; j < items.length; j++) {
    if (items[j].type === 'flash') {
      items[j].region = /国际/.test(items[j].title) ? 'international' : 'domestic';
    } else {
      items[j].region = guessRegion(items[j].title, j, total);
    }
  }

  return items;
}

/**
 * 把条目拆成「主新闻」和「快讯分组」，便于首页分组展示
 */
function groupItems(items) {
  var mains = [];
  var flashes = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type === 'flash') flashes.push(items[i]);
    else mains.push(items[i]);
  }
  return { mains: mains, flashes: flashes };
}

/** 统计要点数量（一级条目 + 快讯子项） */
function countPoints(items) {
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    n += 1 + (items[i].children ? items[i].children.length : 0);
  }
  return n;
}

/** 从标题推导一个短标签，用于卡片上的分类角标 */
function deriveTag(item) {
  var t = item.title || '';
  if (/习近平|总书记/.test(t)) return '总书记';
  if (/李强|总理/.test(t)) return '总理';
  if (/快讯/.test(t)) return '快讯';
  if (/【/.test(t)) return '专题';
  if (item.region === 'international') return '国际';
  return '国内';
}

module.exports = {
  parseBrief: parseBrief,
  groupItems: groupItems,
  countPoints: countPoints,
  deriveTag: deriveTag,
  tidy: tidy
};
