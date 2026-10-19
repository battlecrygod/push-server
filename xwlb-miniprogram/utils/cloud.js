/**
 * 云服务客户端（单例）
 *
 * endpoint / publishableKey 来自应用创建时下发的 publicConfig，
 * 是唯一可以放进小程序前端的云配置，不含任何长时效密钥。
 */
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

const publicConfig = {
  endpoint: 'https://mp-api.app.workbuddy.host',
  publishableKey: 'wbpk_XY1CZOcNI2vqOfKOErshrP_p8Prad44DZHb57mm6V0wRoD63wWAZo5f'
};

const cloud = createMiniProgramWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
  wx: createDiagnosticWx(wx)
});

/** 模型目录只拉一次，缓存到内存 */
let modelPromise = null;

function pickModel() {
  if (!modelPromise) {
    modelPromise = cloud.llm.models
      .list()
      .then((models) => {
        const usable = (models || []).filter((m) => m.disabled !== true);
        return usable.length ? usable[0] : null;
      })
      .catch((err) => {
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

module.exports = { cloud, publicConfig, pickModel };
