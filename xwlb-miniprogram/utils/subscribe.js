/**
 * 订阅消息
 *
 * 微信的一次性订阅消息规则：用户每授权一次，服务端可以在「一次」推送里发一条。
 * 所以这里除了申请授权，还要把授权次数记下来，让用户知道还剩几次。
 */
const config = require('./config');

const QUOTA_KEY = 'xwlb:sub_quota';

function readQuota() {
  try {
    return Number(wx.getStorageSync(QUOTA_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function writeQuota(n) {
  try {
    wx.setStorageSync(QUOTA_KEY, n);
  } catch (e) {
    /* 忽略 */
  }
}

/**
 * 调用微信订阅面板。必须在 tap 事件回调里同步调用，不能先 await 别的东西。
 * @returns {Promise<{accepted:boolean, quota:number}>}
 */
function requestSubscribe() {
  const { templateIds } = config;

  if (!templateIds || !templateIds.length) {
    return Promise.reject({ code: 'NO_TEMPLATE' });
  }

  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success(res) {
        const accepted = templateIds.some((id) => res[id] === 'accept');
        if (accepted) writeQuota(readQuota() + 1);
        resolve({ accepted, quota: readQuota(), raw: res });
      },
      fail(err) {
        reject({ code: 'FAIL', message: err.errMsg || '订阅失败' });
      }
    });
  });
}

/**
 * 把用户上送给自己的推送服务（可选）
 * 只有配置了 pushEndpoint 才会走这一步。
 */
function registerToServer() {
  const { pushEndpoint, clientToken } = config;
  if (!pushEndpoint) return Promise.resolve({ skipped: true });

  return new Promise((resolve) => {
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          resolve({ ok: false, reason: 'no_code' });
          return;
        }
        wx.request({
          url: `${pushEndpoint.replace(/\/$/, '')}/api/subscribe`,
          method: 'POST',
          dataType: 'json',
          header: {
            'content-type': 'application/json',
            'x-client-token': clientToken || ''
          },
          data: { code: loginRes.code },
          success(res) {
            resolve({ ok: res.statusCode === 200, status: res.statusCode });
          },
          fail() {
            resolve({ ok: false, reason: 'network' });
          }
        });
      },
      fail() {
        resolve({ ok: false, reason: 'login_fail' });
      }
    });
  });
}

function getQuota() {
  return readQuota();
}

module.exports = { requestSubscribe, registerToServer, getQuota };
