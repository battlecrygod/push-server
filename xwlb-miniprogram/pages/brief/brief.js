const app = getApp();
const { loadArticle } = require('../../utils/article');
const { tagOf, TAG_STYLES } = require('../../utils/format');

Page({
  data: {
    title: '',
    tag: '',
    tagClass: '',
    dateText: '',
    children: [],
    paragraphs: [],
    state: 'loading',
    errorText: ''
  },

  onLoad(query) {
    this.query = query || {};
    this.render(query || {});
  },

  onRetry() {
    this.render(this.query || {});
  },

  render(query) {
    const date = query.date || '';
    const kind = query.kind === 'flash' ? 'flash' : 'main';
    const idx = Number(query.idx);

    const edition = app.findEdition(date);
    if (!edition) {
      this.setData({ state: 'error', errorText: '没有找到这一期的内容' });
      return;
    }

    const list = kind === 'flash' ? edition.flashes : edition.mains;
    const item = list[idx];
    if (!item) {
      this.setData({ state: 'error', errorText: '没有找到这条新闻' });
      return;
    }

    const tag = tagOf(item);
    this.setData({
      title: item.title,
      tag,
      tagClass: TAG_STYLES[tag] || 'tag--domestic',
      dateText: `${edition.displayDate} ${edition.weekday}`,
      children: (item.children || []).map((c) => c.title)
    });

    wx.setNavigationBarTitle({ title: '联播详情' });
    this.loadBody(item, date);
  },

  loadBody(item, date) {
    this.setData({ state: 'loading' });

    loadArticle({ url: item.videoUrl, date, title: item.title })
      .then((res) => {
        this.setData({ state: 'ok', paragraphs: res.paragraphs });
      })
      .catch((err) => {
        const code = (err && err.message) || '';
        const raw = (err && err.raw) || '';
        const detail = `${code} ${raw}`;

        if (code === 'NO_URL' || code === 'NO_CONTENT') {
          this.setData({ state: 'nourl' });
          return;
        }
        if (/domain list/i.test(detail)) {
          this.setData({
            state: 'error',
            errorText: '域名未配置：需要在小程序后台把 tv.cctv.com 加进 request 合法域名'
          });
          return;
        }
        if (/timeout/i.test(detail)) {
          this.setData({ state: 'error', errorText: '请求超时，网络不稳定，稍后再试' });
          return;
        }
        this.setData({ state: 'error', errorText: `加载失败：${code || '未知错误'}` });
      });
  },

  onCopyTitle() {
    wx.setClipboardData({
      data: this.data.title,
      success: () => wx.showToast({ title: '标题已复制', icon: 'none' })
    });
  }
});
