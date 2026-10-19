/**
 * 小程序项目静态自检
 * 覆盖：JSON 合法性、pages 完整性、tabBar 引用、lazyCodeLoading、
 *       require 路径、WXML 事件绑定是否有对应方法。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'xwlb-miniprogram');

let errors = 0;
let checked = 0;

function fail(msg) {
  console.log(`  ✗ ${msg}`);
  errors += 1;
}

function pass(msg) {
  checked += 1;
  if (process.env.VERBOSE) console.log(`  ✓ ${msg}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${path.relative(ROOT, file)} JSON 解析失败：${err.message}`);
    return null;
  }
}

console.log('\n[1] 项目配置');
const projectConfig = readJson(path.join(ROOT, 'project.config.json'));
const appJson = readJson(path.join(ROOT, 'app.json'));
readJson(path.join(ROOT, 'sitemap.json'));

if (projectConfig && appJson) {
  const root = projectConfig.miniprogramRoot || './';
  const appJsonPath = path.resolve(ROOT, root, 'app.json');
  if (fs.existsSync(appJsonPath)) pass(`miniprogramRoot 指向 ${root}，app.json 存在`);
  else fail(`miniprogramRoot ${root} 下没有 app.json`);

  if (appJson.lazyCodeLoading === 'requiredComponents') pass('lazyCodeLoading 已开启');
  else fail('app.json 缺少 lazyCodeLoading: "requiredComponents"');
}

console.log('\n[2] 页面完整性');
const pages = (appJson && appJson.pages) || [];
for (const page of pages) {
  for (const ext of ['.wxml', '.js']) {
    const f = path.join(ROOT, `${page}${ext}`);
    if (fs.existsSync(f)) pass(`${page}${ext}`);
    else fail(`缺文件 ${page}${ext}`);
  }
  const jsonPath = path.join(ROOT, `${page}.json`);
  if (fs.existsSync(jsonPath)) readJson(jsonPath);
}

console.log('\n[3] tabBar 引用');
const tabList = (appJson && appJson.tabBar && appJson.tabBar.list) || [];
for (const tab of tabList) {
  if (pages.includes(tab.pagePath)) pass(`tab ${tab.text} → ${tab.pagePath}`);
  else fail(`tabBar 指向未注册页面 ${tab.pagePath}`);
  if (tab.iconPath && !fs.existsSync(path.join(ROOT, tab.iconPath))) {
    fail(`tabBar 图标不存在 ${tab.iconPath}`);
  }
}

console.log('\n[4] require 路径');
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /require\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      pass(`${path.relative(ROOT, file)} → ${spec}（npm 包）`);
      continue;
    }
    const base = spec.startsWith('/') ? path.join(ROOT, spec) : path.resolve(path.dirname(file), spec);
    const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
    if (candidates.some((c) => fs.existsSync(c))) pass(`${path.relative(ROOT, file)} → ${spec}`);
    else fail(`${path.relative(ROOT, file)} 引用了不存在的模块 ${spec}`);
  }
}

console.log('\n[5] WXML 事件绑定');
for (const page of pages) {
  const wxmlPath = path.join(ROOT, `${page}.wxml`);
  const jsPath = path.join(ROOT, `${page}.js`);
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const re = /(?:bind|catch)(?:tap|input|change|submit|confirm|longpress)="([^"{}]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(wxml)) !== null) {
    const handler = m[1].trim();
    if (seen.has(handler)) continue;
    seen.add(handler);
    const hasMethod = new RegExp(`(?:^|\\s)(?:async\\s+)?${handler}\\s*\\(`).test(js);
    if (hasMethod) pass(`${page}: ${handler}`);
    else fail(`${page}.wxml 绑定了 ${handler}，但 ${page}.js 里没有这个方法`);
  }
}

console.log('\n[6] 分包体积');
let total = 0;
for (const file of walk(ROOT)) {
  total += fs.statSync(file).size;
}
const kb = total / 1024;
if (kb < 2048) pass(`源码 ${kb.toFixed(0)} KB（主包上限 2048 KB）`);
else fail(`源码 ${kb.toFixed(0)} KB，超过主包上限`);

console.log(`\n结果：${checked} 项通过，${errors} 项失败\n`);
process.exit(errors ? 1 : 0);
