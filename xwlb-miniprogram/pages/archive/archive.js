const app = getApp();
const { loadEditions } = require('../../utils/source');
const { decorateArchiveItem } = require('../../utils/format');

const PAGE_STEP = 2;
const MAX_PAGES = 6;

function groupByMonth(editions) {
  const groups = [];
  let current = null;
  for (const edition of editions) {
    const ym = edition.date.slice(0, 7);
    if (!current || current.ym !== ym) {
      current = {
        ym,
        label: `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`,
        items: []
      };
      groups.push(current);
    }
    current.items.push(decorateArchiveItem(edition));
  }
  return groups;
}

Page({
  data: {
    groups: [],
    total: 0,
    pages: 1,
    loading: true,
    loadingMore: false,
    hasMore: true,
    notice: ''
  },

  onLoad() {
    const cached = app.globalData.editions || [];
    if (cached.length) this.render(cached);
    this.load(1);
  },

  async load(pages) {
    this.setData({ loading: this.data.total === 0 });
    try {
      const result = await loadEditions({ pages });
      if (result.editions && result.editions.length) {
        app.setEditions(result.editions);
        this.render(result.editions, pages);
      }
      this.setData({
        loading: false,
        notice: result.degraded ? '暂时连不上节目源，显示的是本地存档' : ''
      });
    } catch (err) {
      this.setData({ loading: false, notice: '加载失败，请稍后重试' });
    }
  },

  render(editions, pages) {
    this.setData({
      groups: groupByMonth(editions),
      total: editions.length,
      pages: pages || this.data.pages,
      hasMore: (pages || this.data.pages) < MAX_PAGES
    });
  },

  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    const next = Math.min(MAX_PAGES, this.data.pages + PAGE_STEP);
    this.setData({ loadingMore: true });
    loadEditions({ pages: next }).then((result) => {
      app.setEditions(result.editions);
      this.setData({ loadingMore: false });
      this.render(result.editions, next);
    });
  },

  onOpen(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({ url: `/pages/detail/detail?date=${date}` });
  },

  onPullDownRefresh() {
    this.load(this.data.pages).then(() => wx.stopPullDownRefresh());
  }
});
