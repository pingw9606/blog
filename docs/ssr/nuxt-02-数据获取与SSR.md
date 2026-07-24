---
---
# Nuxt 老站篇②：数据获取与 SSR

> 老站怎么取数据——一个自封装的 **`useApi().request()`**（`$fetch` + AES 加密）+ 页面 **setup 顶层 `await`** 实现 SSR 取数。对照 Next 新站的"Server Component 直接 await + lib/api"。

---

## 0. 取数入口：`useApi().request()`

老站没有到处裸调 `$fetch`，而是封装了一个 composable `useApi()`（`composables/api/api.js`），暴露 `request(path, params)`——内部统一处理**加密 POST、语言头、baseURL、解密**：
```vue
<script setup>
import { useApi } from '~/composables/api/api'
const { request } = useApi()
const { data: shortPlay } = await request('/cmsShortPlay/queryDetail', { shortPlayId })
</script>
```
`request` 底层是 `$fetch`（Nuxt 内置 fetch）+ AES 加解密（`utils/crypto.ts`，与新站同款 CBC 契约）。相当于 Next 新站的 `lib/api` 数据层。

## 1. SSR 的关键：setup 顶层 `await`

Nuxt 3 里，**`<script setup>` 顶层的 `await` 会被 SSR 等待**（配合内置 `<Suspense>`）——所以页面 setup 里直接 `await request(...)`，**服务端渲染时就把数据取好、连同 HTML 一起返回**：
```vue
<script setup>
const { data: shortPlay } = await request('/cmsShortPlay/queryDetail', { shortPlayId })
const { data: recommend = [] } = await request('/cmsShortPlay/recommend', { shortPlayId })
</script>
```
这和 Next **Server Component 函数体里 `await`** 是一个效果：首屏 HTML 带数据、利于 SEO。

## 2. `useAsyncData` / `useFetch`

除了自封装的 `request`，部分页面也用 Nuxt 内置的 `useAsyncData` / `useFetch`（带去重、缓存、`pending`/`refresh` 等）：
```ts
const { data, pending, refresh } = await useAsyncData('key', () => request('/xxx', {...}))
```
- `useAsyncData`：给一段异步逻辑加"SSR 去重 + 客户端缓存"（同 key 不重复取）；
- `useFetch`：`useAsyncData` + `$fetch` 的简写。

> 对照 Next：`useAsyncData` 的"同 key 去重"≈ React `cache()`；跨请求缓存那边用 `unstable_cache`。

## 3. 并行取数

多个独立请求并行（别串行 await）：
```ts
const [{ data: a }, { data: b }] = await Promise.all([
  request('/x', {}), request('/y', {}),
])
```
和 Next 的 `Promise.all` 思路一致。

## 4. 服务端 / 客户端

- setup 顶层 `await request` 在 **SSR 时服务端跑**（首屏数据）；
- 客户端交互（翻页、搜索）再在事件里调 `request`（客户端取），或走 Pinia action。
- Nuxt 组件**默认两端都可能跑**，用 `import.meta.client` / `<ClientOnly>` 区分——这点和 Next"RSC 默认只在服务端、要 `"use client"`"不同（见 Server/Client 组件篇）。

## 5. 对照 Next 新站

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 取数封装 | `useApi().request()`（$fetch+加密） | `lib/api` 数据层（`apiPost`+加密，server-only） |
| 页面取数 | setup 顶层 `await request()` | Server Component 函数体 `await` |
| 去重/缓存 | `useAsyncData`（同 key 去重） | `cache()`（请求内）+ `unstable_cache`（跨请求） |
| 并行 | `Promise.all` | `Promise.all` |
| 取数在哪跑 | 服务端+客户端都可能 | RSC 只在服务端；客户端取数走 route handler |

## 6. 小结

- 老站取数 = **`useApi().request()`（封装 $fetch + AES 加密）**，页面 **setup 顶层 `await`** 实现 SSR 首屏取数。
- 需要去重/缓存用 **`useAsyncData`/`useFetch`**；并行用 `Promise.all`。
- 和 Next 的"Server Component await + lib/api"能对应，差异在"Nuxt 组件两端跑 vs Next RSC 只在服务端"。

下一篇：**Pinia 状态管理**。
