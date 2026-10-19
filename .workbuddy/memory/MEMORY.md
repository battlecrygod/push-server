# 项目长期记忆

## 昨日联播（新闻联播每日要点小程序）

- 云应用 ID：`wbapp_XY1CZOcNI2vqOfKOErshrP`（appType: miniprogram，名称「昨日联播」）
- 小程序 AppID：`wx5dc35a44adf69cd2`（已写入 project.config.json）
- GitHub 仓库：`git@github.com:battlecrygod/push-server.git`（该机器 github.com:443 不通，走 ssh.github.com:443）
- 微信开发者工具：`E:\微信web开发者工具\cli.bat`，用前必须在工具里开启服务端口
- 数据源：央视网 `api.cntv.cn/NewVideo/getVideoListByColumn?id=TOPC1451528971114112`，
  `brief` 字段即为当期条目列表，按日期去重（19:00 / 21:00 两版）
- 云库表 `daily_digest`：公开读 + 限长插入（summary 15–500 字），无 UPDATE/DELETE
- 架构原则：**内容实时直连源站，云库只做共享缓存**。不要设计「定时任务写云库」的方案——
  云服务无定时能力，且公共内容无法由未登录客户端安全写入
- SDK 已内置在 `miniprogram_npm/`，无需「构建 npm」
- 用户偏好：要能立刻看到效果 → 交付时配 H5 界面预览页（手机框 + 真实数据）
