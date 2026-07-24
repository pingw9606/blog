---
---
# MaxLoader 传剧工具项目全景

> 一个给内容运营用的**短剧批量上传桌面工具**（Electron + Vue3），以及配套自建的一套轻量后端服务（Node + Fastify + PostgreSQL）。本文把整套系统从头到尾梳理清楚：它解决什么问题、怎么分层、每个模块负责什么、关键功能怎么实现、怎么部署和发版。

---

## 一、项目背景

内容运营需要把短剧的视频文件批量传到内容中台（星图 / ShortMax CMS）。原来只能在网页后台一个个传，痛点很明显：

- 网页上传**关页面就断**，进度全丢；大文件、多集时尤其难受。
- 要**盯着屏幕**等每个文件传完，不能干别的。
- 传到一半失败，看不懂原因、也不好重试。
- 不知道**该从第几集接着传**，容易漏传或重复。

于是做了 **MaxLoader** 这个桌面工具：搜索短剧 → 拖入整个文件夹 → 后台队列批量上传，关软件、断网都不丢进度，失败自动重试。

在工具之外，还自建了一套轻服务 **app-service**，负责工具本身的"运营侧"能力：更新检查、用户活跃统计、意见反馈、上传测速、传剧排行榜、公告下发、错误上报。配一个 React 后台可视化查看和管理。

整套系统三部分：

```
┌────────────────────┐     HTTP      ┌─────────────────────┐
│  MaxLoader 桌面端    │ ────────────▶ │  内容中台 CMS         │
│  Electron + Vue3    │  上传/搜索/注册 │  (星图 / ShortMax)    │
└─────────┬──────────┘               └─────────────────────┘
          │ x-app-key（旁路，失败静默）
          ▼
┌────────────────────┐               ┌─────────────────────┐
│  app-service        │ ◀──x-admin──  │  运营后台 app-admin    │
│  Fastify+Postgres   │   token       │  React + MUI          │
└────────────────────┘               └─────────────────────┘
```

**一条红线**：所有对 app-service 的调用都是**旁路、失败静默、短超时**——app-service 挂了也绝不影响传剧主流程。

---

## 二、客户端 MaxLoader（Electron + Vue3）

### 技术栈
- **Electron**（主进程 Node + 渲染层 Vue3 + Element Plus）
- 主进程负责：登录鉴权、调 CMS 接口、上传队列调度、断点续传、与 app-service 通信
- 渲染层负责：界面（传剧工作台、排行榜等）

### 核心功能
- **搜索短剧**：按编码或剧名搜，提示"当前应从第几集继续"。
- **拖拽导入**：整个文件夹拖进来，自动过滤非视频、按 `短剧编码-集数.扩展名` 校验命名。
- **后台队列上传**：提交即入队，主进程持续上传；可设并发数。
- **断点续传 + 自动重试**：网络中断挂起、恢复后自动续传；失败按退避策略重试，终态失败可手动重试。
- **两种模式**：新增上传 / 修改重传（替换已上传的集）。
- **上传完成通知**：某部剧全部传完，飞书机器人私聊提醒操作人。

### 主进程与 CMS 的交互
主进程用一个统一的 axios 实例（`http`，baseURL 指向 CMS `/prod-api`）调所有业务接口，带 `Authorization: Bearer {token}`。约定：HTTP 200 但 `data.code !== 200` 即业务错误，各调用点抛出交上层提示。

上传本身：先调 `batchAddDramaUpload` / `batchUpdateDramaUpload` 注册剧集，再走七牛云上传，完成后回调 CMS。

---

## 三、后端 app-service（Node + Fastify + PostgreSQL）

一套自建的轻服务，纯 ESM，Docker 部署在腾讯云 Lighthouse。**不自带数据库**，复用同机另一套项目的 Postgres 容器，在里面开独立库 `appservice`、独立用户。

### 运行机制
- 容器启动时自动执行 `db/schema.sql`（幂等，`create table if not exists`），表结构改了重启即生效，不用手动建表。
- 自包含定时清理任务（不依赖外部 cron）：每 24h 清一次超期数据。
- 通过 docker 网络用服务名连库；密钥（DB 连接串、飞书 secret、admin token）全部放 `.env`，不进版本库。

### 数据表（6 张）

| 表 | 作用 | 关键字段 |
|---|---|---|
| **apps** | 接入的应用（多租户），`app_key` 用于客户端鉴权 | app_id, app_key |
| **events** | 每次客户端 checkin 一条，统计数据源 | device_id, user_id, version, day |
| **releases** | 版本发布记录，checkin 据此判断有无更新 | platform, version, download_url, mandatory |
| **upload_stats** | 每传完一个文件一条，测速 + 排行榜数据源 | user_id, size_bytes, duration_ms, speed_bps, ip |
| **feedback** | 用户反馈 | type, content, status |
| **error_logs** | 客户端错误上报，只留最近 N 条 | source, message, stack |
| **announcements** | 公告，checkin 下发给客户端 | content, level, enabled |

### 接口分两层

**客户端公开接口**（`x-app-key` 头鉴权，key 存客户端和 apps 表）：
- `POST /api/checkin` — 报到：写 events + 返回是否有新版本 + 下发当前公告
- `POST /api/upload-stat` — 上传测速上报（IP 用离线 `ip2region` 转地区）
- `POST /api/feedback` — 提交反馈
- `POST /api/notify` — 上传完成 → 飞书机器人私聊操作人
- `GET /api/leaderboard` — 传剧排行榜
- `POST /api/error-report` — 错误上报（插入后裁剪到最近 N 条）

**管理后台接口**（`x-admin-token` 头鉴权，登录换取）：
- `POST /api/admin/login` — 账密换 token
- `GET /api/admin/{stats,leaderboard,upload-stats,feedback,errors,announcements,releases,apps}` — 各类查询
- 发版、发布/启停公告等写操作

---

## 四、运营后台 app-admin（React + MUI）

独立的 React 前端仓库（Vite + React18 + TS + MUI v5 + @mui/x-data-grid），构建产物 rsync 到服务器，由 app-service 挂载目录后当静态站点提供，访问 `/admin/`。

页签：
- **用户统计** — 累计 / DAU / WAU、版本分布（按用户去重）
- **传剧排行榜** — Top3 领奖台 + 完整排名
- **版本发布** — 发新版本记录
- **公告发布** — 填内容选级别一键发布，同时只生效一条
- **用户反馈** — 反馈列表
- **错误日志** — 按用户可搜，重点关注"接口"来源
- **上传测速** — 按用户 / 地区聚合，定位谁传得慢

---

## 五、几个关键功能怎么实现

### 1. 应用内更新提示
客户端启动时 `checkin` 上报当前版本，服务端拿 `releases` 表里该平台最新已发布版本比对，返回 `update_available`。有新版本就在界面顶部弹提示条，点击去飞书文档下载；用户可"忽略此版本"（记在 localStorage，不再打扰）。

### 2. 公告
后台发布公告写入 `announcements` 表（发新的自动停用旧的，保证同时只有一条生效）。客户端 `checkin` 时顺带下发当前公告，界面顶部横幅展示，可关闭且按公告 id 记忆。

### 3. 传剧排行榜
`upload_stats` 按用户聚合（集数 = 记录数、上传量 = 字节总和），倒序取 Top50。客户端做成 Top3 领奖台 + 前十榜单，登录用户若上榜会触发庆祝动画（彩带 + 横幅 + 卡片呼吸高亮）。

### 4. 错误上报
客户端多层兜底捕获错误并上报：
- **接口错误**（最关键）：业务 axios 拦截器统一抓——网络错误（ECONNRESET / 超时 / 5xx）+ 业务 `code != 200`
- **上传失败**：任务终态失败时上报一次（重试中不报，防刷屏）
- **全局兜底**：主进程 uncaughtException / unhandledRejection、渲染层 Vue / window / promise 错误

全部同类 60s 去重、失败静默。后台留最近 5000 条 / 应用，可按用户搜索。

### 5. 上传测速
每传完一个文件上报大小、耗时、平均速度、IP。服务端用离线 `ip2region` 把 IP 转成地区，后台按用户和地区聚合，定位"谁 / 哪个地区传得慢"。（曾用它定位到某地办公出口带宽被占满导致上传慢。）

---

## 六、部署与发版

### 部署
- app-service：`deploy.sh` 做 rsync 源码（**排除 `.env` / `uploads`**）+ `docker compose up -d --build`。
- app-admin：`npm run build` + rsync dist 到服务器挂载目录，无需重建 app-service。

### 发版（Release SOP）
标准流程：**改版本号 → 提交代码 → 打包 → 上传飞书文档 → 加 release 记录**。
- 版本号只改 `package.json` 一处（界面版本号由 vite 构建时注入自动同步）。
- `electron-builder` 一次出 mac(arm64/x64) + win 三平台安装包（未做签名，安装时按提示放行）。
- 安装包传到飞书分发文档，并在 `releases` 表加一条记录 → 老版本用户启动即收到更新提示。

---

## 七、小结

这套系统的思路是：**桌面工具解决核心的"稳、省心"上传体验，一套轻后端 + 可视化后台解决"运营侧"的观测与运营能力**，两者解耦、失败静默，后端挂了不影响传剧。整体自包含、易部署、易迭代——从更新检查到公告、排行榜、错误上报，都是围绕"让运营传剧更顺、让维护者看得清"这个目标一点点加起来的。
