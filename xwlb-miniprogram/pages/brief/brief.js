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
        const code = err && err.message;
        if (code === 'NO_URL') {
          this.setData({ state: 'nourl' });
        } else if (code === 'NO_CONTENT') {
          this.setData({ state: 'nourl' });
        } else {
          this.setData({ state: 'error', errorText: '正文加载失败，检查网络后重试' });
        }
      });
  },

  onCopyTitle() {
    wx.setClipboardData({
      data: this.data.title,
      success: () => wx.showToast({ title: '标题已复制', icon: 'none' })
    });
  }
});
