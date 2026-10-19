/**
 * 把 tools/editions.json 里最近若干期压成小程序包内快照
 * 用法：node tools/build-snapshot.mjs --days 10
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argIdx = process.argv.indexOf('--days');
const wantDays = argIdx > -1 ? Number(process.argv[argIdx + 1]) || 10 : 10;

const editions = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'editions.json'), 'utf8'));
const picked = editions.slice(0, wantDays).map((e) => ({
  date: e.date,
  displayDate: e.displayDate.replace(/^\d+年/, ''),
  weekday: e.weekday,
  items: e.items,
  mains: e.mains,
  flashes: e.flashes,
  pointCount: e.pointCount,
  videoUrl: e.videoUrl,
  cover: e.cover,
  duration: e.duration
}));

const body = `/**
 * 包内兜底数据（最近 ${picked.length} 期）
 * 由 tools/build-snapshot.mjs 自动生成，请勿手动修改。
 * 作用：源站不可达或首次冷启动时，仍然有内容可展示。
 */
module.exports = ${JSON.stringify(picked, null, 2)};
`;

fs.mkdirSync(path.join(ROOT, 'xwlb-miniprogram', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'xwlb-miniprogram', 'data', 'snapshot.js'), body, 'utf8');

console.log(`快照已生成：${picked.length} 期，${(body.length / 1024).toFixed(1)} KB`);
console.log(`区间：${picked[0].date} ~ ${picked[picked.length - 1].date}`);
