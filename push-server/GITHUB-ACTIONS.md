# 用 GitHub Actions 定时跑推送

不需要买服务器，让 GitHub 每天定时帮你执行一次推送。

## 先说清楚 Actions 能做什么、不能做什么

| 能做 | 不能做 |
|---|---|
| 每天定时执行一次 `node src/index.js --once` | 接收 HTTP 请求（`/api/subscribe` 用不了） |
| 把订阅名单提交回仓库，下次运行再读出来 | 常驻内存、保持长连接 |

所以如果走 Actions，**「收集谁要订阅」这件事要另外解决**——见文末第 5 节。

---

## 1. 把项目推到 GitHub

在项目根目录（有 `README.md` 和 `push-server/` 的那一层）执行：

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`.gitignore` 已经排除 `push-server/config.json`（含密钥），不会误传。

> **建议把仓库设成 Private**。订阅名单 `push-server/data/subscribers.json` 里存的是用户 openid，public 仓库会公开这些值。

## 2. 配置 Secrets

仓库页面 → Settings → Secrets and variables → Actions → New repository secret，添加三个：

| Name | Value |
|---|---|
| `XWLB_APP_ID` | 你的小程序 AppID |
| `XWLB_APP_SECRET` | 小程序 AppSecret |
| `XWLB_TEMPLATE_ID` | 订阅消息模板 ID |

可选：`XWLB_CLIENT_TOKEN`（如果你还另外跑着接收服务，用来校验请求来源）。

代码支持用环境变量覆盖 `config.json`，所以仓库里不需要放任何密钥文件。

## 3. 确认定时时间

工作流里这一行：

```yaml
- cron: '30 23 * * *'
```

**GitHub 的 cron 用 UTC**，北京是 UTC+8，所以 `23:30 UTC` = **北京时间次日 07:30**。

想改时间就自己换算：北京时间减 8 小时，跨过 0 点就减一天。

| 想要北京时间 | cron 写法 |
|---|---|
| 07:00 | `0 23 * * *` |
| 07:30 | `30 23 * * *` |
| 08:00 | `0 0 * * *` |
| 21:00 | `0 13 * * *` |

## 4. 试跑

仓库页面 → Actions → 左侧「每日联播推送」→ 右侧「Run workflow」按钮。

这是 `workflow_dispatch` 提供的手动入口，不用等到第二天。

跑完点进去看日志，能看到抓到的日期、要点条数、推送成功/失败数。

## 5. 订阅名单从哪来（关键）

每次 Actions 运行都是全新的容器，`subscribers.json` 靠工作流最后一步提交回仓库来保留。**但这份名单得先有人写进去**。

三个选择，按你的情况挑：

### A. 只用一台常驻机器收订阅，Actions 负责推（不推荐，多此一举）

既然已经有常驻机器了，直接在机器上 `node src/index.js` 全包了，不需要 Actions。

### B. 用免费的 Serverless 函数收订阅（推荐给「不想买服务器」的人）

Cloudflare Workers / Vercel / 腾讯云函数都行，免费额度足够。这个函数只做一件事：

```
收到小程序的 code → 调 jscode2session 换 openid → 追加到订阅名单
```

名单存到 Worker 的 KV 里，然后让 Actions 每天开工前把它拉下来。这样两个东西各司其职：

- Serverless 函数：随时接收订阅（毫秒级响应，本来就适合做这个）
- GitHub Actions：每天定时推送

> 需要的话我可以把这个 Worker 的代码也写出来，十几行，部署只需注册个 Cloudflare 账号。

### C. 先只推给自己（最快能跑起来）

不要接收服务，手动把自己的 openid 写进 `push-server/data/subscribers.json`：

```json
{
  "你的openid": { "subscribedAt": "2026-10-19T00:00:00.000Z", "source": "manual" }
}
```

openid 的拿法：在小程序里 `wx.login()` 拿到 code 后，调一次微信的 `jscode2session` 接口（`push-server/src/wechat.js` 里的 `code2openid` 就是干这个的）。code 只有 5 分钟有效期，所以要在本地立刻换。

拿到后提交进仓库，之后每天 Actions 就会推给这一个人。

---

## 6. 几个必须知道的坑

**定时不准时。** GitHub 的 schedule 在整点高峰期排队，实际可能晚几分钟到十几分钟。要精确到分就只能用服务器 + crontab。

**60 天不活动会自动停用。** 仓库连续 60 天没有任何提交，GitHub 会自动关闭定时任务，并给你发邮件。想避免就让仓库偶尔有点动静（工作流每次提交订阅名单也算活动，所以名单有变化时不会触发这个问题；但如果名单长期不变，得手动保活）。

**只对默认分支生效。** 工作流文件必须在默认分支（通常是 `main`）上。

**Actions 分钟数。** public 仓库免费无限；private 仓库每月 2000 分钟免费额度，这个任务每次运行几秒到十几秒，每天一次，一个月不到 10 分钟，完全够用。

**失败了会标红。** `--once` 在有任何推送失败时返回非 0 退出码，所以你会在 Actions 里直接看到红色，不用等用户反馈。

**排查推送为什么发不出去。** 最常见的错误码是 `43101`（用户拒收或订阅次数用尽），代码会自动把这类用户从名单里移除。`40001` 是 access_token 失效，会自动刷新重试一次。
