# TikTok 小程序·登录与支付的前后端完整时序（深入）

> 承接 [《H5 改造 TikTok 小程序完整指南》](./TikTok小程序-H5改造完整指南.md)。这里把两条最关键、最容易出错的链路——**静默登录（code→token）** 与 **内购/订阅下单**——的前后端时序、接口参数、以及踩坑点讲透。全部对齐 [官方文档](https://developers.tiktok.com/doc/tiktok-minis-silent-login)。

一句话原则贯穿全文：**前端只负责"唤起"和"拿临时凭证"，身份与钱的最终裁决全部在你的后端 + TikTok 服务端之间完成。**

---

## 一、静默登录：code → token

### 为什么是静默登录
短剧场景必须集成**静默登录**（官方标注 mandatory）：用户进入即建立身份，用于绑定观看进度、资产、订阅状态，也是后续支付/订阅/取用户信息的统一前置。它**不弹授权框**，用户无感完成。（要昵称头像才用 `TTMinis.authorize` 显式授权。）

### 完整时序

```
前端(WebView)              你的后端                      TikTok 服务端
    │                         │                        (open.tiktokapis.com)
 1. TTMinis.init({clientKey}) │                                │
 2. TTMinis.login()  ─────────┼── 返回一次性 code(≈5min,单次) │
 3. code ──HTTPS──▶ /your/login                               │
    │                    4. POST /v2/oauth/token/ ───────────▶│
    │                       grant_type=authorization_code     │
    │                       client_key + client_secret + code │
    │                    5. ◀── open_id, access_token,        │
    │                          refresh_token, expires_in...   │
    │                    6. 以 open_id 为主键落库 + 建自己的会话│
 7. ◀── 你的会话(如 JWT/Cookie) │                              │
```

### 前端（对应本项目 `App.vue`）
```ts
if (!isTTMinisAvailable()) return;              // 纯 H5：SDK 不存在则跳过，走游客登录
TTMinis.login(async (response) => {
  const code = response.authResponse?.code;     // 一次性授权码
  if (!code) return;
  await TTSignIn(code);                          // 立刻把 code 交给后端
  await ApiGetUserInfo();
});
```
**前端铁律**：只拿 `code` 立刻发给后端；**不要**在前端换 token、不要缓存 code、不要复用 code。

### 后端换 token
```http
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key=xxx&client_secret=xxx&code=<前端传来的code>&grant_type=authorization_code
```
返回：`open_id`、`access_token`、`refresh_token`、`expires_in`、`refresh_expires_in`、`scope`、`token_type`。

### 后端存储与刷新
- 以 **`open_id` 为该 App 下用户唯一主键**持久化：open_id / access_token / refresh_token / 两个过期时间 / scope / token_type
- **`access_token` 典型 24 小时**，**`refresh_token` 典型 365 天**
- 到期前 10–30 分钟**静默刷新**：同一端点 `grant_type=refresh_token`；刷新成功立即覆盖新 token 与过期时间
- 刷新返回 `invalid_grant` → refresh_token 过期，需前端重新 `TTMinis.login()`

### 登录高频坑
| 现象 | 原因 / 处理 |
|------|-------------|
| `TTMinis.login()` 直接失败，`errorCode: 102102` | **隐私政策/服务条款 URL 没配**，去开发者后台补（可先占位链接） |
| 换 token 返回 `invalid_grant` | code 过期或被复用 → 拿到立即用、不缓存、不重复提交 |
| 换 token 返回 `invalid_client` | client_key 与 client_secret 不匹配/混了别的平台配置 |
| 换 token 返回 `invalid_request` | 检查 `Content-Type` 是否 `application/x-www-form-urlencoded`、`grant_type` 是否正确 |
| 后续受保护接口 401 | access_token 过期 → 实现主动刷新，别等彻底过期 |

---

## 二、内购（Beans 一次性）与订阅

TikTok 小程序用平台虚拟币 **Beans** 结算。前端 `TTMinis.pay` / `createSubscription` 负责**唤起收银台**，而"**创建订单、校验价格、查询到账**"都在服务端 API 完成。所有服务端支付接口都要带 `Authorization: Bearer <该用户的 access_token>`。

### 服务端支付相关接口一览（`open.tiktokapis.com`）
| 用途 | 端点 |
|------|------|
| 取充值档位（Beans 数量/价格/币种） | `POST /v2/minis/utility/get_tier_infos/` |
| **校验定价合法性**（上架前/下单前必做） | `POST /v2/minis/utility/check_redeem_amounts/` |
| **创建交易订单** | `POST /v2/minis/trade_order/create/` |
| **查询订单状态**（PENDING / SUCCESS） | `POST /v2/minis/trade_order/query/` |
| 创建订阅 | `POST /v2/minis/subscription/create/` |

### 一次性内购完整时序

```
前端                     你的后端                         TikTok 服务端
 │  1. 点"解锁本集"          │                                  │
 │ ─── 请求下单 ──────────▶ │                                  │
 │                     2. (可选)check_redeem_amounts 校验价格 ─▶│
 │                     3. 在自己库建业务订单(order_id=PENDING)  │
 │                     4. POST /v2/minis/trade_order/create/ ─▶│
 │                        Bearer access_token                  │
 │                        {token_type:BEANS, token_amount,     │
 │                         order_info:{order_id,product_name,  │
 │                         product_id,order_url,quantity,      │
 │                         quantity_unit:"episode",image_url}} │
 │                     5. ◀── { trade_order_id }               │
 │ ◀── 返回 trade_order_id  │  (务必存下,只能靠它查状态)         │
 │  6. TTMinis.pay(cb, {trade_order_id...}) 唤起收银台          │
 │     用户支付 Beans ──────┼─────────────────────────────────▶│
 │  7. pay 回调返回结果      │                                  │
 │ ─── 通知后端去核实 ─────▶ │  8. POST /v2/minis/trade_order/query/ ─▶│
 │                        ◀── { trade_order_status: SUCCESS }  │
 │                     9. 校验 SUCCESS 后才真正发货(解锁剧集)   │
 │ ◀── 解锁成功 ────────────│                                  │
```

**创建订单请求体（官方示例）：**
```json
{
  "token_type": "BEANS",
  "token_amount": 100,
  "order_info": {
    "order_id": "external_order_id_003",
    "product_name": "Wake up dad! wedding time",
    "product_id": "external_product_id",
    "order_url": "/profile/order_history/external_product_id",
    "quantity": 1,
    "quantity_unit": "episode",
    "image_url": "https://your.domain/pics/wake_up_dad.jpg"
  }
}
```
返回 `{ "data": { "trade_order_id": "TOID1732533244259" } }`。查询订单只能靠这个 `trade_order_id`，**务必落库**。

### 前端（对应本项目 `payPanel.vue`）
```ts
// 订阅
TTMinis.createSubscription(cb, params);
// 一次性内购（Beans）
TTMinis.pay(cb, params);
// 平台优惠券 / 隐藏返利条：先能力探测再调
if (TTMinis.canIUse('showSurfaceCoupon')) TTMinis.showSurfaceCoupon(cb);
if (TTMinis.canIUse('hideRibbon')) TTMinis.hideRibbon(cb);
```

### 支付的关键纪律
1. **先建单再唤起**：先服务端 `trade_order/create` 拿 `trade_order_id`，再 `TTMinis.pay`。不要前端直接"发货"。
2. **发货以服务端查询为准**：`pay` 回调只是"用户操作完成"的信号，**必须**后端 `trade_order/query` 拿到 `SUCCESS` 才解锁内容——前端结果不可信。
3. **价格合法性**：上架/下单前用 `check_redeem_amounts` 校验，避免违反平台定价策略被拒。
4. **幂等**：用你自己的 `order_id` 做幂等键，`pay` 回调/查询可能多次触发，发货要防重。
5. **对账**：`trade_order_id` 是唯一对账钥匙，务必持久化并和你的业务订单一一映射。

---

## 三、把两条链路串起来

```
静默登录  ──▶  拿到并保管 access_token(以 open_id 为用户主键)
                     │
用户点解锁 ──▶ 后端用该 access_token 调 trade_order/create ──▶ 唤起 TTMinis.pay
                     │
支付完成  ──▶ 后端 trade_order/query 得 SUCCESS ──▶ 发货(解锁)
```

- **登录是支付的前置**：支付接口都要带该用户的 `access_token`，没有有效登录态就没法下单
- **前端只碰两样东西**：登录的 `code`、支付的 `trade_order_id`（唤起用）；其余都在服务端
- **两处"最终裁决"都在服务端**：token 交换、订单 SUCCESS 校验

## 四、对照本项目的落地位置
| 环节 | 代码位置 |
|------|----------|
| SDK 守卫 | `src/utils/ttMinis.ts`（`isTTMinisAvailable`）、`src/global.d.ts`（类型） |
| 静默登录唤起 + code 交后端 | `src/App.vue`（`TTMinis.login` → `TTSignIn(code)`） |
| 内购 / 订阅 / 平台券 | `src/components/payPanel.vue`、`payPanelA.vue` |
| 订阅消息、平台埋点 | `src/api/home.api.ts`、`src/hooks/track.ts` |

> 官方参考：[Silent Login](https://developers.tiktok.com/doc/tiktok-minis-silent-login)、[OAuth for Minis](https://developers.tiktok.com/doc/minis-oauth)、[Payment APIs](https://developers.tiktok.com/doc/minis-payment-apis)、[Subscription APIs](https://developers.tiktok.com/doc/minis-subscription-apis)、[Payment JSAPI](https://developers.tiktok.com/doc/minis-sdk-payment)。
