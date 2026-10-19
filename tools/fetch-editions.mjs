/**
 * 抓取新闻联播近若干期并结构化为 editions.json
 *
 * 用法：node tools/fetch-editions.mjs --days 120
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const COLUMN_ID = 'TOPC1451528971114112';
const API = 'https://api.cntv.cn/NewVideo/getVideoListByColumn';

// 复用小程序里的解析模块（CommonJS）
const parseMod = (await import('../xwlb-miniprogram/utils/parse.js')).default;
const { parseBrief, groupItems, countPoints, deriveTag } = parseMod;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  return WEEKDAYS[d.getUTCDay() === 0 ? 0 : d.getDay()] || '';
}

function fmtTitle(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

async function fetchPage(p) {
  const url = `${API}?id=${COLUMN_ID}&n=20&sort=desc&p=${p}&mode=0&serviceId=tvcctv`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Referer: 'https://tv.cctv.com/lm/xwlb/'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${p}`);
  const json = await res.json();
  return (json?.data?.list) || [];
}

function dateFromTime(time) {
  // "2026-10-17 21:00:00"
  return String(time || '').slice(0, 10);
}

function buildEdition(raw) {
  const date = dateFromTime(raw.time);
  if (!date) return null;
  const items = parseBrief(raw.brief);
  if (!items.length) return null;
  const grouped = groupItems(items);
  return {
    date,
    displayDate: fmtTitle(date),
    weekday: weekdayOf(date),
    brief: raw.brief,
    items,
    mains: grouped.mains,
    flashes: grouped.flashes,
    pointCount: countPoints(items),
    videoUrl: raw.url || '',
    cover: raw.image || '',
    duration: raw.length || '',
    sourceTime: raw.time || ''
  };
}

async function main() {
  const argDays = process.argv.indexOf('--days');
  const wantDays = argDays > -1 ? Number(process.argv[argDays + 1]) || 120 : 120;

  const byDate = new Map();
  let page = 1;
  let guard = 0;

  while (byDate.size < wantDays && guard < 40) {
    guard += 1;
    let list;
    try {
      list = await fetchPage(page);
    } catch (err) {
      console.warn(`page ${page} 抓取失败：${err.message}`);
      break;
    }
    if (!list.length) break;

    for (const raw of list) {
      const date = dateFromTime(raw.time);
      if (!date) continue;
      if (byDate.has(date)) continue; // 同日 19:00 / 21:00 只保留先出现的
      const edition = buildEdition(raw);
      if (edition) byDate.set(date, edition);
    }
    console.log(`page ${page} → 累计 ${byDate.size} 天`);
    page += 1;
    await new Promise((r) => setTimeout(r, 250)); // 温和限速
  }

  const editions = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const outFile = path.join(ROOT, 'tools', 'editions.json');
  fs.writeFileSync(outFile, JSON.stringify(editions, null, 2), 'utf8');

  console.log(`\n完成：${editions.length} 期 → ${outFile}`);
  for (const e of editions.slice(0, 3)) {
    console.log(`  ${e.date} ${e.weekday} 要点 ${e.pointCount} 条 / 主新闻 ${e.mains.length} 条 / 快讯组 ${e.flashes.length}`);
  }
  console.log('\n首条样例：');
  console.log(JSON.stringify(editions[0].mains.slice(0, 3), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
