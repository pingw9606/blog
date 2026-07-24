---
---
# 跨栈对比·深度篇：取数 / SEO / i18n / 渲染，两套 SSR 到底差在哪

> 前面 Nuxt 篇、Next 篇分别讲了两套实现，这篇把四个最核心的维度**并排深度对比**——同一个需求，Nuxt 3 和 Next 16 各自的模型、写法、边界差异。

---

## 1. 数据获取

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 页面取数 | `<script setup>` 顶层 `await request()` | Server Component 函数体 `await` |
| 取数封装 | `useApi().request()`（$fetch+加密） | `lib/api`（`apiPost`+加密，`server-only`） |
| 去重/缓存 | `useAsyncData`（同 key SSR 去重 + 客户端缓存） | `cache()`（请求内）+ `unstable_cache`（跨请求，带 revalidate） |
| 客户端取数 | 事件里 `request()` / Pinia action | 客户端组件 `fetch` 调 route handler（`/api/*`） |
| 取数在哪跑 | 组件默认**两端都可能跑** | RSC **只在服务端**，取数不进浏览器包 |

**本质差异**：Nuxt 的组件是"同构"的（同一份代码两端跑），取数用声明式 composable 磨平两端；Next RSC 把"服务端组件"和"客户端组件"**物理分开**了——服务端组件直接 await、密钥安全，客户端要数据得走 route handler。

## 2. SEO

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| meta 输出 | `useHead` / `useSeoMeta` | `generateMetadata()` |
| title/desc 来源 | **后端 `/api/seo/{key}`** + i18n 回退 | 代码/i18n（`buildMetadata` 入参） |
| canonical | `useHead` link + middleware 分页重定向 | `alternates.canonical` 自指 |
| hreflang | `useAlternateLinks`（拼各语言 URL） | `alternates.languages`（16 语言 + x-default） |
| sitemap/robots | 模块 / `public/robots.txt` | `app/sitemap.ts` / `app/robots.ts`（代码生成） |

**本质差异**：SEO 红线（canonical 自指、hreflang 双向、SSR 输出）两边一致；差在**文案来源**——老站可**后端下发** SEO 文案，新站更多在**代码/i18n**里；新站把 canonical/hreflang **工具化 + 类型化**（`buildMetadata`/`buildAlternates`）。

## 3. 国际化

| | Nuxt 3 `@nuxtjs/i18n` | Next 16 `next-intl` |
|---|---|---|
| 前缀策略 | `prefix_except_default` | `localePrefix: 'as-needed'`（同义） |
| 取文案 | `$t()` / `useI18n().t` | `getTranslations`(服务端) / `useTranslations`(客户端) |
| 带语言链接 | `localePath()` / `<NuxtLink>` | `@/i18n/navigation` 的 `Link` |
| 语言包 | `i18n/locales/*.json`（19 种） | `messages/*.json`（16 种） |
| 懒加载 | `lazy: true` | `request.ts` 动态 import |

**本质差异**：概念高度对应（都是"前缀策略 + 语言包 + 带语言的链接"）。最大坑是**服务端/客户端取文案 API 不同**（next-intl 分 `getTranslations`/`useTranslations`），以及**locale 列表要对齐**（19 → 16）。

## 4. 渲染与运行时

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 引擎 | Nitro（`.output`，Node server） | Node（`.next`，跑 pod） |
| 组件默认 | 两端都可能跑（`<ClientOnly>` 区分） | **RSC 只服务端；`"use client"` 才客户端** |
| 渲染控制 | `routeRules` / SSR | `dynamic` / `revalidate`（SSG/ISR/`force-dynamic`） |
| 读请求头 | 随手读 | **读 `headers()`/`cookies()` 会强制动态**（影响能否 SSG/ISR） |
| 缓存 | `nitro.routeRules` 头 | `next.config` headers |

**本质差异**：Next 的**服务端/客户端边界是硬的**（RSC 概念），且**读请求上下文会改变渲染模式**——这是 Nuxt 开发者最需要适应的两点。

## 5. 一句话总纲

- **取数**：Nuxt 声明式(useAsyncData)磨平两端；Next 靠 RSC 把两端物理分开（服务端 await、客户端走 route handler）。
- **SEO**：红线一致；差在文案来源（后端下发 vs 代码/i18n）和工具化程度。
- **i18n**：概念对应；坑在服务端/客户端 API 分离 + locale 列表对齐。
- **渲染**：Next 的 RSC 边界 + "读请求头变动态"是最需要转的思维。

下一篇（收官）：**复刻踩坑与经验**——真正动手迁移时会遇到什么。
