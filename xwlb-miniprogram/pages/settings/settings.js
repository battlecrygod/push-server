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
    version: '1.0.0'
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
