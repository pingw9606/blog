# H5 改造 TikTok 小程序（Minis）完整指南

> 结合 [TikTok for Developers 官方文档](https://developers.tiktok.com/doc/tiktok-minis-develop-your-mini-app) 与一个真实短剧项目（Vue 3 + Vite，一套代码同时产出 H5 与 TikTok 小程序）的落地实现，完整梳理"把一个普通 H5 项目改造成 TikTok 小程序"要做的全部事情与细节。

## 一、先纠正一个认知：TikTok Minis 不是传统小程序

官方原话强调：**不要用微信/传统小程序的心智去套 TikTok Minis**。最准确的理解是：

> **Web App + 客户端 JSAPI（TTMinis）+ CLI 工具链**

- Minis 就是**标准的 Web 工程**：`index.html` + 前端框架代码 + 构建产物，跑在 TikTok App 的 **WebView** 里
- TikTok 客户端能力（登录、支付、广告、录屏控制等）通过全局 `window.TTMinis` 暴露，**不在你的 web 代码里实现**
- 上传前先独立构建你的 web 项目，再用 CLI（`minis build`）校验并打包成平台要求的产物

这带来一个巨大的工程红利：**H5 和小程序可以共用同一套代码**，小程序只是在 H5 之上叠一层"客户端能力适配"。下面的真实项目正是这么做的。

## 二、整体架构：两套 API

| | TikTok Minis SDK（客户端） | TikTok Minis Server APIs（服务端） |
|---|---|---|
| 载体 | 全局 `TTMinis`（`connect.tiktok-minis.com/drama/sdk.js`） | `open.tiktokapis.com`，仅后端调用 |
| 能力 | 登录、支付、订阅、广告、UI、能力探测 | OAuth v2 换 token、拉用户信息、下单/管单、定价 |
| 谁存密钥 | 不存 | **后端保管** token 与 trade order |

前端拿 `code`/发起支付 → 后端用 Server API 换 token、建订单、校验回调。**钱和身份的最终裁决在服务端**，前端只负责唤起。

```
用户 ── TikTok App(WebView) ── 你的 Web 页面
                │                    │
        window.TTMinis          你的后端 ──→ open.tiktokapis.com
        (login/pay/ads/…)                  (oauth/token, trade_order, user/info)
```

## 三、完整生命周期

### 阶段 0 · 开发者平台准备（最容易卡人的环节）
1. 注册开发者账号、创建 **Organization**（对外可见，用公司实体名）
2. **业务认证 + 行业资质审核**（Verify Business / Industry Qualification）
3. 拿到 **`client_key`**（SDK 初始化要用）
4. 填齐 **基础信息**：App 名称、图标、**隐私政策 URL、服务条款 URL**
   - ⚠️ 官方明确：这些为空/不全会直接导致**登录和授权报错**。没有正式链接可先用占位链接
5. **配置请求域名白名单**：小程序要访问的所有后端域名都要加白名单，**非白名单的跨域请求会被 TikTok 客户端拦截**
6. **开通变现能力**（IAA 广告 / IAP 内购）：需签约 + TikTok 审批，且只能由组织管理员操作

### 阶段 1 · 安装工具链
```bash
# 官方 CLI（本项目用的是 ttdx 封装，等价）
npm install tiktok-minis-cli -g --registry=https://registry.npmjs.org/
minis -v          # 验证
minis init        # 生成 minis.config.json
```
- Android 本地调试需要 **TikTok 测试版客户端**（找运营/工单申请）
- iOS 本地调试：上传打包产物到平台，**扫码预览**
- 三层联调：本地业务页 ↔ Playground 调试页 ↔ TikTok App

### 阶段 2 · 开发与集成
非客户端能力（UI、列表、路由）用标准浏览器开发即可；**登录、授权、广告、支付、订阅**必须走 TikTok 客户端能力。

**初始化 SDK（index.html）：**
```html
<head>
  <script src="https://connect.tiktok-minis.com/drama/sdk.js"></script>
  <script>TTMinis.init({ clientKey: "your_client_key" });</script>
</head>
```

**官方要求"必须集成"的能力：**
| 功能 | 客户端 API | 服务端 API | 必需 |
|------|-----------|-----------|------|
| 静默登录 | `TTMinis.login` | `/v2/oauth/token/` | ✅ |
| 显式授权(取昵称头像) | `TTMinis.authorize` | `/v2/oauth/token/` + `/v2/user/info/` | 可选 |
| 激励视频广告 | `TTMinis.createRewardedVideoAd` | — | ✅(开IAA) |
| 插屏广告 | `TTMinis.createInterstitialAd` | — | ✅(开IAA) |
| 内购(Beans 一次性) | `TTMinis.pay` | `/v2/minis/trade_order/create/` | ✅(开IAP) |
| 订阅 | `TTMinis.createSubscription` | `/v2/minis/subscription/create/` | ✅(开IAP) |
| 导航栏 | `TTMinis.setNavigationBarColor` / `getMenuButtonBoundingClientRect` | — | ✅ |

> 支付货币是平台虚拟币 **TikTok Beans**；官方推荐"**充值+支付合并**"（余额不足才提示充值）的无感路径。

### 阶段 3 · 打包发布
```bash
vite build            # 先出 web 产物
minis build           # 校验 + 打包成平台产物
```
- 打成 **ZIP，≤ 50MB**
- **禁用 `eval()`、`iframe`** 等
- 上传到平台 Code Assets，可选 **全量发布 / 灰度(Partial Rollout，做 A/B)**
- 审核约 **1–3 天**

### 阶段 4 · 运营
- **举报处理（Report Handling）**：72 小时 SLA，在平台的 User Reports 处理/申诉
- **美国/欧盟上线**需额外的 Launch Approval

## 四、真实项目里"H5 → 小程序"到底改了什么

下面对应一个真实短剧项目（`playlet`，Vue3+Vite）的落地。它的高明之处是**一套代码两端复用 + 对 H5 优雅降级**。

### 1) 入口 `index.html`
- 注入 `minis-meta`（`client_key`、`scopes:["user.basic.info"]`、`minis_category:"short_drama"`）
- 引 `drama/sdk.js` + `TTMinis.init`
- `clientKey`/`title` 用 vite 模板变量注入（`<%- clientKey %>`）

### 2) 构建链路（多品牌）
```jsonc
// package.json
"build:minis:shortmax": "vite build --mode shortmax && node scripts/setMinisClientKey.js mn5z9124mhx05l9n && ttdx minis build"
```
- `minis.config.json`：清单（clientKey / navbar 颜色 / 输出目录）
- `scripts/setMinisClientKey.js`：构建前按品牌替换 clientKey
- 一套代码出十几个品牌（shortmax/tapdrama/…），每个一把 client key + 一个 vite mode
- H5 部署那套（`dockerfile` / nginx `default.conf.template`）**保留不动**，同产物两用

### 3) SDK 桥封装 + 优雅降级（关键）
```ts
// src/utils/ttMinis.ts —— 纯 H5 / sdk.js 加载失败时 TTMinis 为 undefined
export function isTTMinisAvailable(): boolean {
  return typeof TTMinis !== "undefined";
}
```
```ts
// src/global.d.ts —— 给 TTMinis 补类型声明
declare const TTMinis: TTMinisAPI;
```
调用铁律：**先 `isTTMinisAvailable()` 再 `TTMinis.canIUse('xxx')` 探测，最后才调**。这样纯 H5 环境自动跳过客户端能力，同一份代码两端都能跑。

### 4) 登录（`src/App.vue`）
```ts
if (!isTTMinisAvailable()) return;              // 纯 H5：跳过 TT 静默登录，走游客登录
TTMinis.login(async (response) => {
  if (response.authResponse?.code) {
    await TTSignIn(response.authResponse.code); // 把 code 交给后端换会话
    await ApiGetUserInfo();
  }
});
```
后端拿 `code` → 调 `open.tiktokapis.com/v2/oauth/token/` 换 token → 建立自己的会话。

### 5) 支付 / 订阅（`payPanel.vue` / `payPanelA.vue`）
```ts
TTMinis.createSubscription(cb, params); // 订阅
TTMinis.pay(cb, params);                // Beans 一次性内购
if (TTMinis.canIUse('showSurfaceCoupon')) TTMinis.showSurfaceCoupon(cb); // 平台券
if (TTMinis.canIUse('hideRibbon')) TTMinis.hideRibbon(cb);
```
配套：后端 `/v2/minis/trade_order/create/` 或 `/v2/minis/subscription/create/` 下单，回调校验后发货。

### 6) 平台专属能力
| 能力 | 位置 | 用途 |
|------|------|------|
| `disableCapture` / `enableCapture` | `videoContent.vue` | 播放页**禁止录屏** |
| `requestSubscribeMessage` | `home.api.ts` | 订阅消息（inbox） |
| `reportEvent` | `hooks/track.ts` | 平台埋点，与自有埋点 / `ttq` / `fbq` 并存 |

### 7) 几乎不用动的部分
`axios` 请求层、`vue-router`、业务组件、`i18n`、状态管理 —— **全部复用 H5**（没有 `tt.request` 之类改写，因为 WebView 里标准 HTTP 直接可用，只要域名在白名单）。

## 五、避坑清单（官方 + 实战）

- **域名白名单**：漏配后端域名 → 请求被客户端静默拦截，排查很费时
- **隐私/条款 URL**：不填 → 登录授权直接报错
- **优雅降级**：所有 `TTMinis.*` 调用必须先守卫，否则纯 H5 或 SDK 加载失败会 `ReferenceError` 拖垮整个模块
- **能力探测**：不同客户端版本能力不同，用 `canIUse` 判断，不要假设一定存在
- **包体 ≤ 50MB、禁 eval/iframe**：打包前自查
- **钱和身份在服务端**：`code`→token、下单、发货都要后端用 Server API 校验，前端结果不可信
- **审核 1–3 天、举报 72h SLA**：上线节奏和运营响应要留出时间
- **多品牌**：用 vite mode + 构建脚本注入 client key，别把 key 写死在代码里

## 六、一句话总结

TikTok 小程序 = **你的 H5** + **`index.html` 引 SDK/`minis.config.json`/CLI 打包** + **`TTMinis` 客户端能力（登录/支付/订阅/广告/录屏/导航栏）** + **后端 `open.tiktokapis.com` 管身份与交易**，并对 H5 优雅降级。业务代码基本不动，改造集中在"入口 + 构建 + 一层能力适配"。

> 官方文档索引：[Develop Your Mini Drama](https://developers.tiktok.com/doc/tiktok-minis-develop-your-mini-app)、[Minis SDK](https://developers.tiktok.com/doc/minis-sdk-get-started)、[Server APIs](https://developers.tiktok.com/doc/minis-server-apis-overview)、[IAP](https://developers.tiktok.com/doc/tiktok-minis-in-app-purchases)、[发布](https://developers.tiktok.com/doc/tiktok-minis-release-your-mini-app)。
