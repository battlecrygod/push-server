/**
 * 小程序侧可调配置
 *
 * templateIds：订阅消息模板 ID。在微信公众平台「订阅消息」里申请「每日新闻摘要」类模板后粘贴到这里。
 *              留空时，订阅按钮会提示未配置，不会报错。
 * pushEndpoint：你自己的推送服务地址（可选）。填写后，用户点订阅会同时把一次性 code 上送，
 *               由服务端换取 openid 存入订阅名单；不填则只完成本地授权。
 */
module.exports = {
  templateIds: [],
  pushEndpoint: '',
  // 推送服务的鉴权口令，需与服务端 config.json 的 clientToken 一致
  clientToken: ''
};
