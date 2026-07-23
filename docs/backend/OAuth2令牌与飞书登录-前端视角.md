---
---
# OAuth2 令牌与飞书登录 —— 前端视角：登录后那串 token 和"OAuth2 客户端不存在"

> 背景：这次预发后台飞书登录报了个 `{"code":1002020000,"msg":"OAuth2 客户端不存在"}`，从"是不是跨域"一路查到最后，发现是数据库缺了一条种子数据。借这个真实案例，把后端（yudao 框架）的 OAuth2 令牌鉴权、以及飞书这类第三方登录，从前端视角讲清楚。

---

## 0. 先理解：后端登录不是"登完就完事"

前端对登录的理解通常是"发账号密码 → 拿到登录态"。后端（yudao）这套是标准的 **OAuth2 令牌体系**：
- 认证通过后，后端**签发一个 access_token（访问令牌）**；
- 之后每个请求带着这个 token（`Authorization` 头），后端校验 token 才放行；
- token 有**有效期、能刷新（refresh_token）、有权限范围（scope）**。

token 类比：**登录后拿到的"门禁卡"**，每次请求刷卡；卡本身记录了你是谁、能进哪些门、什么时候过期。

## 1. 关键角色：OAuth2 客户端（client）

令牌不是凭空发的，是**"以某个 OAuth2 客户端的名义"签发**的。这些客户端登记在数据库表 **`system_oauth2_client`** 里，每条定义一个客户端：`client_id`、密钥、允许的授权方式、token 时长、scope 等。

- 后台自己登录，用的是内置客户端 **`client_id = default`**。
- 一套后端可以对接多个前端/第三方应用，各自一个 `client_id`，token 互不通用、权限独立——但我们这个场景只用到 `default`。

## 2. 飞书登录的完整流程（第三方登录）

飞书登录是"用飞书账号换我们系统的 token"，流程：
```
① 前端点"飞书登录" → 后端 /feishu/auth-url 返回飞书授权链接(带飞书 appId)
② 用户在飞书授权 → 飞书回调，带回一个 code
③ 前端把 code 发给后端 /feishu/login
④ 后端用 code 向飞书换 access_token → 拿飞书用户信息
⑤ 把飞书用户映射到系统用户(system_users)
⑥ 后端【以 client_id=default 的名义】给这个用户签发系统 token
⑦ 返回 token，前端存起来，之后带着它访问
```

**注意两个不同的"client_id"**（这次容易混）：
- 第 ① 步飞书授权链接里的 `client_id` = **飞书应用的 AppId**（给飞书用的）；
- 第 ⑥ 步签发系统 token 用的 `client_id = default` = **本系统 OAuth2 客户端**（`system_oauth2_client` 表里那条）。
两者完全不同层。

> 还有个点：**前端 `/feishu/login` 只传 `code`（和 state），不传 client_id**——`default` 是后端写死的常量。所以"前端参数里没有 client_id"是正常的。

## 3. 那次报错：`OAuth2 客户端不存在`（1002020000）

飞书登录走到第 ⑥ 步签发 token，要先校验 `client_id=default` 这个客户端存不存在、是否启用。**预发数据库 `system_oauth2_client` 表里没有 `default` 这条记录** → 直接抛 `OAuth2 客户端不存在`。

排查时的弯路很典型：**先怀疑跨域**（浏览器报错像跨域）→ 发现后端 503（服务没起）→ 起来后又报这个 → 最后定位是**缺种子数据**。教训：报错文案（"OAuth2 客户端不存在"）对业务同学不友好，容易误判。

## 4. 为什么会"缺数据"：yudao 基础数据要手动灌

`system_oauth2_client`（客户端）、`system_menu`（菜单）、`system_dict_*`（字典）、`system_role`（角色）、`system_users`（用户）这些**都是数据库里的数据，不是代码**。yudao **应用启动不会自动生成**它们——新环境部署要**手动从已有库导入这些 `system_*` 基础数据**。漏导 `default` 客户端 → 登录挂；漏导菜单 → 后台空白。

（所以上线 checklist 里"导入 yudao 基础数据"是必做项，我们还特意把 `system_oauth2_client` 加进了上线 Runbook。）

## 5. token 存在哪、怎么校验

- 签发的 token 一般缓存在 **Redis**（快、可设过期），也落库。
- 每个请求带 `Authorization: Bearer <token>`，后端从 Redis/库校验 token 是否有效、未过期、权限够不够。
- token 过期用 refresh_token 换新的，不用重新登录。

## 6. 前端会撞见的

- **"OAuth2 客户端不存在" / 登录报错**：优先怀疑**环境数据库缺 `system_oauth2_client` 的 default 记录**（尤其新环境/预发），不是前端问题。
- **飞书 appId 配错**：飞书授权那步的 appId/secret 配在后端（Nacos），配错登录也失败。
- **前端不传 client_id 是对的**：它是后端写死的 `default`。
- 登录后拿 token，之后请求带 `Authorization` 头——这套由框架/拦截器处理，前端一般无感。

## 7. 一句话总结

- 后端登录 = **签发 access_token（门禁卡）**，token 以某个 **OAuth2 客户端（`default`）** 的名义发出，客户端登记在 `system_oauth2_client` 表。
- **飞书登录**：code 换飞书用户 → 映射系统用户 → 用 `default` 发系统 token；前端只传 code，不传 client_id。
- **"OAuth2 客户端不存在"= 库里缺 `default` 种子数据**（新环境没导全 yudao 基础数据），不是跨域、不是代码。

配套阅读：《[Nacos配置中心](./Nacos配置中心-前端视角)》（飞书 appId/密钥在这）《[这套SEO项目的后端全景](./这套SEO项目的后端全景-前端视角)》。
