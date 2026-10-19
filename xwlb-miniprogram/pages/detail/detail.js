const app = getApp();
const { loadEditions } = require('../../utils/source');
const { getDigest } = require('../../utils/digest');
const { decorateEdition } = require('../../utils/format');

Page({
  data: {
    view: null,
    digest: '',
    digestLoading: true,
    notFound: false
  },

  onLoad(options) {
    const date = options && options.date;
    if (!date) {
      this.setData({ notFound: true });
      return;
    }
    this.date = date;

    const cached = app.findEdition(date);
    if (cached) this.applyEdition(cached);

    // 缓存里没有（例如从分享链接直接进来）就先把最近几期拉下来再找
    if (!cached) {
      loadEditions({ pages: 3 }).then((result) => {
        app.setEditions(result.editions);
        const edition = app.findEdition(date);
        if (edition) this.applyEdition(edition);
        else this.setData({ notFound: true });
      });
    }
  },

  applyEdition(edition) {
    this.setData({
      view: decorateEdition(edition),
      notFound: false,
      digest: '',
      digestLoading: true
    });
    wx.setNavigationBarTitle({ title: `${edition.date} 新闻联播` });

    getDigest(edition)
      .then((res) => {
        if (this.date !== edition.date) return;
        this.setData({ digest: res.summary, digestLoading: false });
      })
      .catch(() => this.setData({ digestLoading: false }));
  },

  onOpenBrief(e) {
    const ds = e.currentTarget.dataset;
    const date = this.data.view && this.data.view.date;
    if (!date) return;
    wx.navigateTo({
      url: `/pages/brief/brief?date=${date}&kind=${ds.kind}&idx=${ds.idx}`
    });
  },

  onCopyVideo() {
    const url = this.data.view && this.data.view.videoUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '原片链接已复制', icon: 'none' })
    });
  }
});
