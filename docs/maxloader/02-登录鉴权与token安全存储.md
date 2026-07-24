---
---
# 02 · 登录鉴权与 token 安全存储

> 桌面工具的登录和网页不一样：没有 Cookie 域、要免登、token 得**安全落地到本地磁盘**。本篇讲三种登录（短信 / 飞书 OAuth / 启动恢复）怎么做，token 怎么用系统级加密存，以及"当前用户"在主进程里怎么共享。

## 一、token 放哪：内存 + 加密磁盘双层

登录拿到 token 后，分两处放：

1. **内存**：`setToken(token)`，给 axios 请求拦截器拼 `Authorization` 头用。
2. **磁盘（加密）**：`saveToken(token)`，下次启动免登。

内存这层很简单，就是 `http/request.ts` 里的一个模块变量：

```ts
// src/main/http/request.ts
let token: string | null = null
export function setToken(t: string | null) { token = t }
export function getToken() { return token }
```

磁盘这层是重点——**绝不能明文存 token**。Electron 提供了 `safeStorage`，底层用操作系统的密钥链（macOS Keychain / Windows DPAPI）加密，别的程序/用户拿不到：

```ts
// src/main/utils/token-store.ts
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'

const tokenPath = join(app.getPath('userData'), 'token.enc')

export function saveToken(token: string) {
  if (!safeStorage.isEncryptionAvailable()) return
  writeFileSync(tokenPath, safeStorage.encryptString(token))  // 加密后写盘
}

export function loadToken(): string | null {
  if (!existsSync(tokenPath) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(tokenPath))  // 读盘解密
  } catch {
    return null  // 解密失败（比如换了机器）就当没登录
  }
}

export function clearToken() {
  if (existsSync(tokenPath)) rmSync(tokenPath)
}
```

几个细节：

- 存在 `app.getPath('userData')`——每个应用独立的用户数据目录，不会和别的程序冲突。
- `isEncryptionAvailable()` 兜底：极少数环境（如某些 Linux 无密钥环）加密不可用，那就干脆不存，退化成每次登录，绝不明文落盘。
- 解密 `try/catch` 返回 null：换机器 / 密钥变了会解密失败，静默当未登录处理，不崩。

## 二、短信登录

短信登录两步：发验证码 → 带验证码登录。滑块验证码这里先略过（项目用了个本地代理规避跨域，属于旁支）。核心的登录 handler：

```ts
// src/main/ipc/auth.ts
ipcMain.handle('auth:login', async (_e, params: LoginParams): Promise<ApiResult<UserInfo>> => {
  try {
    const token = await login(params)   // 调 CMS /smsLogin
    setToken(token)                     // 内存
    saveToken(token)                    // 加密磁盘
    const user = await getInfo()        // 用 token 拉当前用户信息
    setCurrentUser(user)                // 存到主进程"当前用户"
    recoverOnStartup()                  // 恢复上次未完成的上传任务
    return { ok: true, data: user }
  } catch (err: any) {
    setToken(null)
    return { ok: false, error: err?.message ?? '登录失败' }
  }
})
```

底层调 CMS 的部分（`http/shortmax.ts`），注意**业务错误约定**：HTTP 200 但 `data.code !== 200` 视为失败，抛出 `data.msg`：

```ts
export async function login(params: LoginParams): Promise<string> {
  const { data } = await http.post('/smsLogin', { ...params, mobileLogin: true })
  if (data.code !== 200) throw new Error(data.msg || '登录失败')
  return data.token
}

export async function getInfo(): Promise<UserInfo> {
  const { data } = await http.get('/getInfo')
  if (data.code !== 200) throw new Error('获取用户信息失败')
  return { userName: data.user.userName, nickName: data.user.nickName, feishuUserId: data.user.feishuUserId }
}
```

## 三、飞书 OAuth 登录

飞书登录是标准 OAuth 授权码流程，桌面端的做法是：**开一个窗口加载飞书授权页 → 用户授权后飞书回调带 code → 用 code 换 token**。

流程拆成三步（`http/shortmax.ts`）：

```ts
// 1) 拿授权页 URL（redirectUri 必须在飞书应用回调白名单里）
export async function getFeiShuAuthUrl(redirectUri: string): Promise<string> {
  const { data } = await http.post('/getFeiShuAuthUrl?isCanRepeatSubmit=true', { redirectUri })
  if (data.code !== 200 || !data.data?.url) throw new Error(data.msg || '获取飞书授权链接失败')
  return data.data.url
}

// 2) 用飞书回调的 code + state 换我们后端的 token
export async function qrCodeLogin(code: string, state: string): Promise<string> {
  const { data } = await http.post('/qrCodeLogin?isCanRepeatSubmit=true', { code, state })
  if (data.code !== 200 || !data.token) throw new Error(data.msg || '飞书登录失败')
  return data.token
}
```

handler 侧和短信登录几乎一样，只是 token 来源换成 `feishuLogin()`（内部开授权窗口、监听回调 URL、提取 code、调 `qrCodeLogin`）：

```ts
ipcMain.handle('auth:feishu-login', async (): Promise<ApiResult<UserInfo>> => {
  try {
    const token = await feishuLogin()
    setToken(token); saveToken(token)
    const user = await getInfo()
    setCurrentUser(user)
    recoverOnStartup()
    return { ok: true, data: user }
  } catch (err: any) {
    setToken(null)
    return { ok: false, error: err?.message ?? '飞书登录失败' }
  }
})
```

> ⚠️ 一个坑：后端接口域名从旧平台切到新内容中台后，飞书 OAuth 的 `redirectUri` 会变成 `{新域名}/socialCallback`，**必须去飞书开放平台把新域名加进回调白名单**，否则授权后回调被拒、登录失败。

## 四、启动免登恢复

应用启动时，渲染层先调 `auth:restore` 试着用本地 token 免登：

```ts
ipcMain.handle('auth:restore', async (): Promise<ApiResult<UserInfo>> => {
  const token = loadToken()            // 读加密磁盘
  if (!token) return { ok: false, error: '无本地登录态' }
  setToken(token)
  try {
    const user = await getInfo()       // 拿 token 探一次，验证是否还有效
    setCurrentUser(user)
    recoverOnStartup()
    return { ok: true, data: user }
  } catch (err: any) {
    setToken(null)
    clearToken()                       // token 失效 → 清掉，回到登录页
    return { ok: false, error: err?.message ?? '登录态失效' }
  }
})
```

关键：**用 `getInfo()` 探一次来验证 token 是否还有效**。有效就直接进主界面；失效（过期/被踢）就清掉本地 token，让用户重新登录。这样既免登、又不会拿着废 token 一直报错。

## 五、"当前用户"在主进程里怎么共享

上传完成通知要 @ 操作人、测速上报要带用户名、排行榜要高亮"我"——这些都发生在主进程各处，需要一个共享的"当前用户"。做法很朴素，一个模块单例：

```ts
// src/main/current-user.ts
import type { UserInfo } from '../../shared/types'

let currentUser: UserInfo | null = null
export function setCurrentUser(u: UserInfo | null) { currentUser = u }
export function getCurrentUser(): UserInfo | null { return currentUser }
```

登录成功 `setCurrentUser(user)`、登出 `setCurrentUser(null)`。上传队列里就能：

```ts
const user = getCurrentUser()
if (user?.feishuUserId) {
  void notifyUploadComplete(user.feishuUserId, shortPlayName, successCount)
}
```

`UserInfo` 里三个字段各有用途：

```ts
export interface UserInfo {
  userName: string       // 系统账号（排行榜 user_id、统计去重用）
  nickName?: string      // 昵称（展示用）
  feishuUserId?: string  // 飞书 user_id（发私聊通知用）
}
```

## 小结

- token 双层：内存给请求拦截器用，磁盘用 `safeStorage` 系统级加密存，绝不明文。
- 三种登录（短信 / 飞书 / 启动恢复）统一：拿 token → set+save → getInfo 验证 → 记录当前用户 → 恢复任务。
- 启动恢复靠 `getInfo()` 探活验证 token，失效即清。
- "当前用户"用主进程单例共享给上传/通知/上报。

下一篇是核心——[上传队列引擎：断点续传 + 自动重试 + 并发控制](./03-上传队列引擎)。
