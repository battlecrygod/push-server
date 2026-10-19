'use strict';

/**
 * 推送服务入口
 *
 *   node src/index.js            启动服务 + 每日定时推送（需要一台常驻机器）
 *   node src/index.js --once     只推送一次就退出（给 GitHub Actions / crontab 用）
 *   node src/index.js --dry-run  只演练今天的推送内容，不发送、不启动服务
 */
const { load } = require('./config');
const { createServer, startScheduler } = require('./server');
const { runPush } = require('./push');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const once = args.includes('--once');

async function main() {
  const { config, missing } = load();

  if (dryRun) {
    await runPush({ dryRun: true });
    return;
  }

  if (missing.length) {
    console.error(`\n配置不完整，缺少：${missing.join('、')}`);
    console.error('本地运行：编辑 push-server/config.json');
    console.error('GitHub Actions：检查仓库 Secrets（XWLB_APP_ID / XWLB_APP_SECRET / XWLB_TEMPLATE_ID）');
    console.error('想先看看推送内容，可以运行：node src/index.js --dry-run\n');
    process.exit(1);
  }

  if (once) {
    const result = await runPush({});
    // 有失败就让这次运行标红，方便在 Actions 里一眼看到
    process.exit(result.failed > 0 ? 1 : 0);
  }

  startScheduler(config);

  const server = createServer(config);
  server.listen(config.port, () => {
    console.log(`订阅接收服务：http://localhost:${config.port}/api/subscribe`);
    console.log(`健康检查：http://localhost:${config.port}/health`);
  });
}

main().catch((err) => {
  console.error('运行失败：', err);
  process.exit(1);
});
