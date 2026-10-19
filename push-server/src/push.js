'use strict';

const path = require('node:path');
const { load } = require('./config');
const { fetchLatest, buildDigestText } = require('./cctv');
const { TokenStore, sendSubscribe } = require('./wechat');
const { SubscriberStore, RunState } = require('./store');

function fillTemplate(mapping, vars) {
  const out = {};
  for (const [field, template] of Object.entries(mapping)) {
    out[field] = String(template).replace(/\{(\w+)\}/g, (_, key) =>
      vars[key] !== undefined ? vars[key] : ''
    );
  }
  return out;
}

/**
 * 执行一次推送
 * @param {{dryRun?:boolean, date?:string}} options
 */
async function runPush(options = {}) {
  const { config, missing } = load();
  const store = new SubscriberStore(config.subscriberFile);
  const state = new RunState(path.resolve(__dirname, '..', 'data', 'state.json'));

  const edition = await fetchLatest();
  const digest = buildDigestText(edition);

  const [, m, d] = edition.date.split('-');
  const vars = {
    title: digest.title,
    summary: digest.fullSummary,
    summary20: digest.summary,
    date: `${Number(m)}月${Number(d)}日`,
    dateFull: `${edition.date}`,
    count: edition.pointCount,
    weekday: edition.weekday
  };

  const data = fillTemplate(config.templateData, vars);

  console.log('\n— 本次内容 —');
  console.log(`日期：${edition.date} ${edition.weekday}`);
  console.log(`要点：${edition.pointCount} 条（主新闻 ${edition.mains.length}，快讯组 ${edition.flashes.length}）`);
  console.log(`标题：${vars.title}`);
  console.log(`摘要：${vars.summary20}`);
  edition.mains.slice(0, 5).forEach((item, i) => console.log(`  ${i + 1}. ${item.title}`));

  if (options.dryRun || missing.length) {
    if (missing.length) {
      console.log(`\n⚠ 配置未完成（缺 ${missing.join('、')}），本次只演练，不会真正发送。`);
    }
    console.log('\n— 将下发的模板字段 —');
    console.log(JSON.stringify(data, null, 2));
    return { dryRun: true, edition, sent: 0, failed: 0 };
  }

  const subscribers = store.list();
  if (!subscribers.length) {
    console.log('\n订阅名单为空，没有可发送的对象。');
    return { dryRun: false, edition, sent: 0, failed: 0 };
  }

  const tokens = new TokenStore(path.resolve(__dirname, '..', 'data', 'token.json'));
  let token = await tokens.get(config.appId, config.appSecret);

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    let result = await sendSubscribe({
      token,
      openid: sub.openid,
      templateId: config.templateId,
      page: config.page,
      data,
      state: config.miniprogramState
    });

    // access_token 失效时刷新一次再重试
    if (!result.ok && (result.code === 40001 || result.code === 42001)) {
      tokens.invalidate();
      token = await tokens.get(config.appId, config.appSecret, true);
      result = await sendSubscribe({
        token,
        openid: sub.openid,
        templateId: config.templateId,
        page: config.page,
        data,
        state: config.miniprogramState
      });
    }

    if (result.ok) {
      sent += 1;
      store.markSent(sub.openid);
    } else {
      failed += 1;
      store.markError(sub.openid, `${result.code} ${result.message}`);
      // 43101：用户已退订或次数用尽，从名单移除
      if (result.expired) store.remove(sub.openid);
      console.warn(`  × ${sub.openid.slice(0, 8)}… ${result.code} ${result.message}`);
    }
  }

  state.write({ lastPushDate: edition.date, lastPushAt: new Date().toISOString(), sent, failed });
  console.log(`\n推送完成：成功 ${sent}，失败 ${failed}`);
  return { dryRun: false, edition, sent, failed };
}

module.exports = { runPush };
