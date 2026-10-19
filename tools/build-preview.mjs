/**
 * 生成界面预览页：把真实数据注入 HTML 模板
 * 用法：node tools/build-preview.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 演示用的「一句话看懂」：依据当期条目人工提炼，小程序内由大模型实时生成
const SUMMARIES = {
  '2026-10-17':
    '习近平内蒙古考察重要讲话引发热烈反响，李强出席世界传统医药大会并出访乌兹别克斯坦；服务贸易稳增，广交会AI新品成外贸新动能。',
  '2026-10-16':
    '习近平在内蒙古考察，强调统筹高质量发展与高水平保护、走生态优先绿色发展之路；李强主持国务院常务会议，养老服务价格进一步规范。',
  '2026-10-15':
    '习近平总书记重要讲话激励卫生健康工作者推进健康中国建设；李强出席中朝新鸭绿江大桥开通仪式，并将出访中亚、出席上合总理会议。',
  '2026-10-14':
    '习近平致信祝贺第140届广交会开幕，李强出席并发表主旨演讲；卫生与健康大会精神持续引发反响，多项民生与开放举措集中发布。',
  '2026-10-13':
    '习近平在全国卫生与健康大会上强调走中国特色卫生与健康发展道路；会见博茨瓦纳总统与多哥部长会议主席，多项对外交往安排同日发布。'
};

const editions = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'editions.json'), 'utf8'));

const picked = editions.slice(0, 5).map((e) => ({
  date: e.date,
  displayDate: e.displayDate.replace(/^\d+年/, ''),
  weekday: e.weekday,
  pointCount: e.pointCount,
  summary: SUMMARIES[e.date] || '昨日要闻已更新。',
  mains: e.mains.map((m) => ({
    title: m.title,
    region: m.region,
    children: (m.children || []).map((c) => ({ title: c.title }))
  })),
  flashes: e.flashes.map((f) => ({
    title: f.title,
    children: (f.children || []).map((c) => ({ title: c.title }))
  }))
}));

const template = fs.readFileSync(path.join(ROOT, 'tools', 'preview-template.html'), 'utf8');
const payload = JSON.stringify({ editions: picked }, null, 2);
const html = template.replace('/*__DATA__*/', payload);

const outFile = path.join(ROOT, 'xwlb-preview.html');
fs.writeFileSync(outFile, html, 'utf8');

console.log(`预览页已生成：${outFile}`);
console.log(`共 ${picked.length} 期，${(html.length / 1024).toFixed(1)} KB`);
console.log(`区间：${picked[0].date} ~ ${picked[picked.length - 1].date}`);
