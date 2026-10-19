'use strict';

/**
 * 从央视网取最新一期《新闻联播》并结构化
 * 解析逻辑与小程序共用同一份代码，保证两端条目一致。
 */
const parseMod = require('../../xwlb-miniprogram/utils/parse.js');

const COLUMN_ID = 'TOPC1451528971114112';
const API = 'https://api.cntv.cn/NewVideo/getVideoListByColumn';

function weekdayOf(dateStr) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return weekdays[new Date(y, m - 1, d).getDay()] || '';
}

async function fetchLatest(attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const url = `${API}?id=${COLUMN_ID}&n=20&sort=desc&p=1&mode=0&serviceId=tvcctv`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Referer: 'https://tv.cctv.com/lm/xwlb/'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = json?.data?.list || [];
      if (!list.length) throw new Error('返回列表为空');

      // 同一天有 19:00 / 21:00 两条，取第一条
      const raw = list[0];
      const date = String(raw.time || '').slice(0, 10);
      const items = parseMod.parseBrief(raw.brief);
      if (!items.length) throw new Error('条目解析为空');
      const grouped = parseMod.groupItems(items);

      return {
        date,
        weekday: weekdayOf(date),
        items,
        mains: grouped.mains,
        flashes: grouped.flashes,
        pointCount: parseMod.countPoints(items),
        videoUrl: raw.url || ''
      };
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`抓取新闻联播失败：${lastError && lastError.message}`);
}

/**
 * 推送文案
 *
 * 微信订阅消息的 thing 类字段最多 20 个字，所以这里刻意做短：
 * 通知的职责是「提醒你去看」，细节留给点开之后。
 */
function buildDigestText(edition) {
  const [, m, d] = edition.date.split('-');
  const first = edition.mains[0] ? edition.mains[0].title.replace(/——.*$/, '') : '昨日要闻已更新';
  const tops = edition.mains.slice(0, 3).map((item) => {
    const t = item.title.replace(/——.*$/, '').replace(/[，。；、]$/, '');
    return t.length > 18 ? `${t.slice(0, 18)}…` : t;
  });

  return {
    title: `${Number(m)}月${Number(d)}日联播 ${edition.pointCount} 条要点`,
    summary: first.length > 18 ? `${first.slice(0, 18)}…` : first,
    fullSummary: `${tops.join('；')}。`
  };
}

module.exports = { fetchLatest, buildDigestText };
