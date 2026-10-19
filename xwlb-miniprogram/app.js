const { getSnapshot } = require('./utils/source');

App({
  globalData: {
    editions: [],
    // 由首页在拿到最新数据后写入，供详情页/归档页复用
    latestDate: ''
  },

  onLaunch() {
    // 先用包内快照填一次，保证任何页面冷启动都立刻有内容
    this.globalData.editions = getSnapshot();
    this.globalData.latestDate = this.globalData.editions.length
      ? this.globalData.editions[0].date
      : '';
  },

  setEditions(editions) {
    if (!editions || !editions.length) return;
    this.globalData.editions = editions;
    this.globalData.latestDate = editions[0].date;
  },

  findEdition(date) {
    const list = this.globalData.editions || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].date === date) return list[i];
    }
    return null;
  }
});
