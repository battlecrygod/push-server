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
    testResult: '',
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
   * 检测数据源是否连通。
   * 最常见的失败原因是 api.cntv.cn 没加进小程序的 request 合法域名——
   * 这种情况下首页会一直显示内置存档，看起来像「不更新」。
   */
  onTestSource() {
    if (this.data.testing) return;
    this.setData({ testing: true, testResult: '', testOk: false });

    wx.request({
      url:
        'https://api.cntv.cn/NewVideo/getVideoListByColumn?id=TOPC1451528971114112&n=2&sort=desc&p=1&mode=0&serviceId=tvcctv',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.setData({
            testing: false,
            testOk: false,
            testResult: `源站返回 HTTP ${res.statusCode}`
          });
          return;
        }
        const list = (res.data && res.data.data && res.data.data.list) || [];
        const latest = list[0] ? String(list[0].time).slice(0, 10) : '';
        if (!latest) {
          this.setData({
            testing: false,
            testOk: false,
            testResult: '连接成功，但没有解析到内容'
          });
          return;
        }
        this.setData({
          testing: false,
          testOk: true,
          testResult: `连接正常，源站最新一期是 ${latest}`
        });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '未知错误';
        let detail = msg;
        if (/domain list/i.test(msg)) {
          detail =
            '域名未加入白名单。去小程序后台「开发管理 → 开发设置 → 服务器域名」，把 https://api.cntv.cn 加到 request 合法域名';
        } else if (/timeout/i.test(msg)) {
          detail = '请求超时，检查一下网络';
        }
        this.setData({ testing: false, testOk: false, testResult: detail });
      }
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
