# 昨日联播

每天把前一晚《新闻联播》的主要内容整理成一份可直接扫读的清单，配一句话概括；可回看往期，可订阅微信推送。

## 这套东西由三部分组成

| 目录 | 作用 | 是否必须 |
|---|---|---|
| `xwlb-miniprogram/` | 微信小程序本体 | 必须 |
| `push-server/` | 每天早上抓取并推送的服务 | 想要主动推送才需要 |
| `tools/` | 数据抓取、快照生成、界面预览等开发脚本 | 可选 |
| `xwlb-preview.html` | 界面预览页，浏览器直接打开就能看 | 只是给你看效果的 |

## 一、先看效果

双击打开 `xwlb-preview.html`。这是一个可点击的界面预览：三个标签能切换，往期列表能点进详情。数据是真实的（2026-10-13 至 10-17 五期）。

## 二、跑起小程序

1. 装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 选择 `xwlb-miniprogram` 目录
3. AppID 选「测试号」，或者填你自己的小程序 AppID
4. 直接编译，模拟器里就能看到首页

云服务 SDK 已经内置在 `miniprogram_npm/` 里，**不需要点「构建 npm」**。

### 发布

点小程序产物卡片打开预览，右上角「分享 / Share」可以选择发布试用小程序（扫码一次，无需提前注册账号，有效期 14 天），或者绑定你自己的小程序账号。

> 试用小程序只能发试用版，长期运营建议一开始就绑定自己的账号。

## 三、内容从哪来

数据直连央视网的公开接口，所以**每天早上自动就是最新的**，不需要任何定时任务去更新内容：

```
https://api.cntv.cn/NewVideo/getVideoListByColumn?id=TOPC1451528971114112&n=20&sort=desc&p=1
```

这个接口返回的 `brief` 字段本身就是每期的「本期节目主要内容」列表，结构天然是 `1. xxx；2. xxx；国内联播快讯：（1）xxx…`。`utils/parse.js` 把它拆成结构化条目（一级要点 + 快讯子项），首页、往期页、详情页都用这一份解析结果。

**注意**：正式发布后，需要到微信公众平台 →「开发管理」→「开发设置」→「服务器域名」，把 `https://api.cntv.cn` 加入 **request 合法域名**，否则线上会请求失败。开发阶段可以在开发者工具里勾选「不校验合法域名」绕过。

即使请求失败，小程序也有两层兜底：本地缓存 → 包内快照（`data/snapshot.js`，最近 10 期）。

## 四、一句话概括怎么来的

调用云端大模型生成，三级取用：

1. 本地缓存 — 同一期不重复生成
2. 云端共享缓存 — 存在 `daily_digest` 表，所有用户共用一份
3. 都没有才真正调模型，生成后回写云端

模型调用走的是云服务内置通道，**不需要你准备任何 API Key**。位置在 `utils/digest.js`。

## 五、订阅推送

这是唯一需要你自己动手配置的部分，因为微信的推送必须由**你自己的小程序账号**发起。

### 5.1 先说清楚一件事

微信小程序的「订阅消息」是**一次性**的：用户授权一次，服务端只能推**一条**，推完即失效。所以「每天都能收到」需要用户在每次收到推送后回来再点一次开启，或者勾选「总是保持以上选择」。

这是微信的规则，不是实现缺陷。如果用户更在意「打开就能看到最新」，小程序首页本来就是打开即最新，不依赖推送。

### 5.2 配置步骤

1. 到 [微信公众平台](https://mp.weixin.qq.com) →「订阅消息」→ 选用一个「新闻/资讯提醒」类模板（或申请一个），记下**模板 ID** 和它的**字段名**（比如 `thing1`、`thing2`、`date3`）
2. 把模板 ID 填到 `xwlb-miniprogram/utils/config.js` 的 `templateIds` 数组里
3. 在「开发管理」→「开发设置」里拿到 **AppSecret**
4. 复制 `push-server/config.example.json` 为 `push-server/config.json`，填 `appId` / `appSecret` / `templateId`，并把 `templateData` 改成你模板实际的字段名

```json
"templateData": {
  "thing1": "{title}",
  "thing2": "{summary20}",
  "date3": "{date}"
}
```

可用占位符：`{title}` 标题、`{summary20}` 一句话摘要（≤18 字）、`{summary}` 完整摘要、`{date}` 日期（10月17日）、`{dateFull}` 完整日期、`{count}` 要点数、`{weekday}` 星期。

> 微信的 `thing` 类字段最多 20 个字，超了整条会被拒收。代码里已按字段类型自动截断。

5. 起服务：

```bash
cd push-server
node src/index.js
```

服务会做两件事：每天 `07:30` 抓取并推送；在 `http://localhost:8787/api/subscribe` 接收小程序上送的 code 换 openid 存入订阅名单。

6. 把这个服务地址填回 `xwlb-miniprogram/utils/config.js` 的 `pushEndpoint`（注意必须是 HTTPS 且备案的域名，加到小程序的 request 合法域名里），并把 `clientToken` 与 `config.json` 里的 `clientToken` 设成同一个值。

### 5.3 想先看推送长什么样

```bash
cd push-server
node src/index.js --dry-run
```

不会真的发送，只打印抓到的内容和即将下发的模板字段。

### 5.4 关于「常驻环境」

推送必须在某个一直开机的环境里跑。三个选择：

- **自己的电脑**：`node src/index.js` 挂着就行，电脑关机就不推
- **云服务器**：最省心，`pm2 start src/index.js` 托管，同时也能对外接收订阅
- **GitHub Actions**：不花钱不维护，每天定时跑一次 `node src/index.js --once`。
  但它只能定时执行、不能接收 HTTP 请求，所以「收集订阅名单」要另外解决。
  完整步骤和坑见 [push-server/GITHUB-ACTIONS.md](push-server/GITHUB-ACTIONS.md)

不推送完全没有影响——小程序打开即最新内容。

## 六、开发脚本

```bash
node tools/fetch-editions.mjs --days 120   # 抓最近 120 期到 tools/editions.json
node tools/build-snapshot.mjs --days 10    # 用上面的数据重新生成包内快照
node tools/build-preview.mjs               # 重新生成界面预览页
node tools/verify.mjs                      # 项目静态自检（页面完整性、require 路径、事件绑定等）
```

改了内容解析或界面之后，建议跑一次 `verify.mjs`。

## 七、已知边界

- 央视网接口没有官方文档，字段可能变动。`utils/parse.js` 对格式做了容错，但如果解析结果为 0 条，会回退到包内快照。
- 条目文字完全来自央视网公开的节目信息，不做改写，只做分条和分组。
- 一句话概括由大模型生成，偶尔可能不够准确，页面上已标注来源。
