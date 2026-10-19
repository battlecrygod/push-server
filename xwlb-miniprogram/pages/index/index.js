const app = getApp();
const { loadEditions, getSnapshot } = require('../../utils/source');
const { getDigest } = require('../../utils/digest');
const { decorateEdition, pad2 } = require('../../utils/format');
const { requestSubscribe, registerToServer, getQuota } = require('../../utils/subscribe');

function relativeLabel(dateStr) {
  const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const now = new Date();
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getTime() - 86400000));
  if (dateStr === today) return '今天';
  if (dateStr === yesterday) return '昨天';
  return '';
}

Page({
  data: {
    view: null,
    relative: '',
    digest: '',
    digestLoading: true,
    notice: '',
    stale: false,
    quota: 0,
    subscribeHint: ''
  },

  onLoad() {
    const snapshot = getSnapshot();
    if (snapshot.length) this.applyEdition(snapshot[0]);
    this.setData({ quota: getQuota() });
    this.refresh(false);
  },

  onShow() {
    this.setData({ quota: getQuota() });
  },

  onPullDownRefresh() {
    this.refresh(true).then(() => wx.stopPullDownRefresh());
  },

  async refresh(force) {
    this.setData({ notice: '', stale: false });
    try {
      const result = await loadEditions({ pages: 3, force });
      if (result.editions && result.editions.length) {
        app.setEditions(result.editions);
        const latest = result.editions[0];
        if (!this.data.view || latest.date !== this.data.view.date) {
          this.applyEdition(latest);
        }
        if (result.degraded) {
          this.setData({
            stale: true,
            notice: `连不上新闻源，当前是 ${latest.displayDate} 的存档。可在「我的」里检测原因。`
          });
        }
      }
    } catch (err) {
      this.setData({
        stale: true,
        notice: '连不上新闻源，显示的是本地存档。可在「我的」里检测原因。'
      });
    }
  },

  applyEdition(edition) {
    if (!edition) return;
    this.setData({
      view: decorateEdition(edition),
      relative: relativeLabel(edition.date),
      digest: '',
      digestLoading: true
    });
    this.loadDigest(edition);
  },

  loadDigest(edition) {
    getDigest(edition)
      .then((res) => {
        // 期间用户可能已经切换了期次，避免串数据
        if (!this.data.view || this.data.view.date !== edition.date) return;
        this.setData({ digest: res.summary, digestLoading: false });
      })
      .catch(() => {
        this.setData({ digestLoading: false });
      });
  },

  onOpenArchive() {
    wx.switchTab({ url: '/pages/archive/archive' });
  },

  onCopyVideo() {
    const url = this.data.view && this.data.view.videoUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '原片链接已复制', icon: 'none' })
    });
  },

  onSubscribe() {
    // 微信要求订阅面板必须在点击回调里同步弹出，所以这里不 await 任何前置操作
    requestSubscribe()
      .then((res) => {
        this.setData({ quota: res.quota });
        if (!res.accepted) {
          wx.showToast({ title: '未开启，随时可以再来', icon: 'none' });
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
              '需要在微信公众平台申请一个订阅消息模板，把模板 ID 填到 utils/config.js 的 templateIds 里，这里就能用了。',
            showCancel: false
          });
          return;
        }
        wx.showToast({ title: '开启失败，稍后再试', icon: 'none' });
      });
  }
});
