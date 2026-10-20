const app = getApp();
const config = require('../../utils/config');
const { getQuota, requestSubscribe, registerToServer } = require('../../utils/subscribe');

const CACHE_KEY = 'xwlb_cache_v1';

Page({
  data: {
    quota: 0,
    configured: false,
    cachedCount: 0,
    latestDate: '',
    version: '1.0.1',
    testing: false,
    testRows: [],
    testOk: false
  },

  onShow() {
    const editions = app.globalData.editions || [];
    this.setData({
      quota: getQuota(),
      configured: !!(config.templateIds && config.templateIds.length),
      cachedCount: editions.length,
      latestDate: editions.length ? editions[0].date : ''
    });
  },

  onSubscribe() {
    requestSubscribe()
      .then((res) => {
        this.setData({ quota: res.quota });
        if (!res.accepted) {
          wx.showToast({ title: '未开启', icon: 'none' });
          return;
        }
        registerToServer();
        wx.showToast({ title: '已开启', icon: 'success' });
      })
      .catch((err) => {
        if (err.code === 'NO_TEMPLATE') {
          wx.showModal({
            title: '还没配置推送模板',
            content:
              '去微信公众平台「订阅消息」申请一个每日摘要类模板，把模板 ID 填进 utils/config.js 的 templateIds，这个按钮就能用了。',
            showCancel: false
          });
          return;
        }
        wx.showToast({ title: '开启失败，稍后再试', icon: 'none' });
      });
  },

  /**
   * 检测两个必需的域名是否都能连通。
   * 首页显示旧内容 = 节目清单域名不通；正文加载失败 = 正文域名不通。
   * 真机上最常见的原因是没配进 request 合法域名。
   */
  onTestSource() {
    if (this.data.testing) return;
    this.setData({ testing: true, testRows: [] });

    const editions = app.globalData.editions || [];
    const firstItem = editions[0] && editions[0].mains && editions[0].mains[0];
    const videoUrl =
      (firstItem && firstItem.videoUrl) ||
      'https://tv.cctv.com/2026/10/18/VIDEIswMFtT0ODGVWFJ2DDVb261018.shtml';

    const targets = [
      {
        name: '节目清单 api.cntv.cn',
        url:
          'https://api.cntv.cn/NewVideo/getVideoListByColumn?id=TOPC1451528971114112&n=2&sort=desc&p=1&mode=0&serviceId=tvcctv',
        expect: 'list'
      },
      { name: '新闻正文 tv.cctv.com', url: videoUrl, expect: 'html' }
    ];

    const runs = targets.map((t) => this.probe(t));

    Promise.all(runs).then((rows) => {
      this.setData({
        testing: false,
        testRows: rows,
        testOk: rows.every((r) => r.ok)
      });
    });
  },

  probe(target) {
    return new Promise((resolve) => {
      wx.request({
        url: target.url,
        timeout: 10000,
        dataType: target.expect === 'html' ? 'text' : 'json',
        success: (res) => {
          if (res.statusCode !== 200) {
            resolve({ name: target.name, ok: false, detail: `源站返回 HTTP ${res.statusCode}` });
            return;
          }
          if (target.expect === 'list') {
            const list = (res.data && res.data.data && res.data.data.list) || [];
            if (!list.length) {
              resolve({ name: target.name, ok: false, detail: '连通了，但没取到内容' });
              return;
            }
            const latest = String(list[0].time || '').slice(0, 10);
            resolve({ name: target.name, ok: true, detail: `正常，源站最新 ${latest}` });
            return;
          }
          const html = String(res.data || '');
          resolve({
            name: target.name,
            ok: html.indexOf('content_area') > -1,
            detail: html.indexOf('content_area') > -1 ? '正常，能取到正文' : '页面结构和预期不符'
          });
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '未知错误';
          let detail = msg;
          if (/domain list/i.test(msg)) {
            detail = `域名未加入白名单：把 ${target.url.split('/')[2]} 加到 request 合法域名`;
          } else if (/timeout/i.test(msg)) {
            detail = '请求超时';
          }
          resolve({ name: target.name, ok: false, detail });
        }
      });
    });
  },

  onClearCache() {
    wx.showModal({
      title: '清除本地缓存？',
      content: '会清掉已保存的期次和摘要，下次打开重新联网获取。',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.removeStorageSync(CACHE_KEY);
        } catch (e) {
          /* 忽略 */
        }
        this.setData({ cachedCount: 0 });
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    });
  },

  onCopySource() {
    wx.setClipboardData({
      data: 'https://tv.cctv.com/lm/xwlb/',
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' })
    });
  }
});
