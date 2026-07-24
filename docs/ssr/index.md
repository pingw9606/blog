---
---
# SSR 项目实战：同一个短剧 SEO 站，Nuxt 3 与 Next.js 两套实现

> 这是一个**对比实战大课题**。我们有同一个短剧内容 SEO 站，老站用 **Nuxt 3（Vue 3）** 实现，新站是把它**跨技术栈复刻重写成 Next.js 16（React 19）**。两条线并行讲——既能一次吃透两大 SSR 框架，又能看清"同一套业务/SEO 需求，两种框架各怎么落地、怎么互相映射"。

---

## 两个项目

| | 老站 `shorttv-website` | 新站 `vibeshort-website` |
|---|---|---|
| 框架 | **Nuxt 3.17**（Vue 3.5） | **Next.js 16**（React 19） |
| 渲染 | Nitro SSR / SSG / 预渲染 | App Router SSR / SSG / ISR |
| 状态 | **Pinia 3** | Server Component 为主 + 局部 `useState` |
| 国际化 | **@nuxtjs/i18n 10 + vue-i18n** | **next-intl 4** |
| 样式 | Less / Sass（scoped） | **SCSS Modules** |
| 图片 | `@nuxt/image`（`<NuxtImg>`） | `next/image` |
| 播放器 | **xgplayer 3** | **hls.js** |
| 语言 | TypeScript | TypeScript |

新站是老站的**功能/页面结构/SEO 行为**的复刻，实现完全重建——所以它俩是学 SSR 对比的绝佳样本。

## 核心概念映射（Nuxt 3 ↔ Next 16 App Router）

| 维度 | Nuxt 3（老站） | Next 16 App Router（新站） |
|---|---|---|
| 路由 | `pages/` 文件路由 | `app/[locale]/` 目录路由 |
| 页面数据(SSR) | `useAsyncData` / `useFetch` / `$fetch` | Server Component `async` + `fetch` |
| 客户端状态 | Pinia store / `ref` | `"use client"` + `useState` |
| 服务端/客户端边界 | `<ClientOnly>` / `process.client` | `"use client"` 指令 / RSC 默认服务端 |
| 国际化 | `@nuxtjs/i18n`（`$t`、locale 路由） | `next-intl`（`getTranslations`、`[locale]`） |
| SEO meta | `useHead` / `useSeoMeta` | `generateMetadata()` |
| 路由跳转 | `<NuxtLink>` / `navigateTo` | `@/i18n/navigation` 的 `Link` / `useRouter` |
| 图片 | `<NuxtImg>`（`@nuxt/image`） | `<Image>`（`next/image`） |
| 渲染控制 | route rules / `prerender` | `dynamic`/`revalidate`（SSG/ISR/`force-dynamic`） |
| 服务端运行时 | Nitro | Node（跑在 pod 里） |

## 课题地图（两大类 + 对比，持续更新）

### 一、Nuxt 3 老站篇（`shorttv-website`）
1. 项目结构与文件路由（`pages` / `layouts` / `middleware`）
2. 数据获取与 SSR（`useAsyncData` / `useFetch` / `$fetch`，服务端 vs 客户端取数）
3. 状态管理 Pinia（store 设计、SSR 状态注水 hydration）
4. 国际化 `@nuxtjs/i18n`（多语言路由、`vue-i18n`、语言切换）
5. SEO（`useHead` / `useSeoMeta`、动态 meta、canonical/hreflang、sitemap/robots）
6. 播放器 xgplayer 与媒体处理
7. 渲染与部署（Nitro、SSR/SSG/预渲染、Node 服务）

### 二、Next 16 新站篇（`vibeshort-website`）
1. 项目结构与 App Router（`[locale]` 段、`layout`/`page`、Server Component）
2. 数据获取（Server Component `async`、`fetch` 缓存、`force-dynamic`、客户端 `fetch` route handler）
3. Server/Client 组件与状态（RSC + `"use client"` 边界）
4. 国际化 next-intl（`routing`/`navigation`/`messages`）
5. SEO（`generateMetadata`、canonical 自指、hreflang+x-default、sitemap/robots）
6. 播放器 hls.js 与媒体（加密 HLS、原地切集）
7. 渲染模式与部署（SSG/ISR/SSR、跑在 pod、build 依赖后端的坑）

### 三、跨栈对比与复刻经验
1. Nuxt→Next 概念映射全表 + 复刻方法论（哪些直接映射、哪些要重新设计）
2. 取数 / SEO / i18n / 渲染 的两套实现深度对比
3. 复刻踩坑：`Pinia → RSC`、`useFetch → Server Component`、i18n 迁移、样式（scoped → CSS Modules）迁移

> 相关基建（Pod / 渲染模式 / SEO 等）另见「后端运维笔记 · 前端视角科普」里的《[SSR/CSR/SSG/ISR 渲染模式](../backend/SSR-CSR-SSG-ISR渲染模式-前端视角)》《[Kubernetes与Pod](../backend/Kubernetes与Pod-前端视角)》。

## 怎么读

- 想学 **Nuxt**：看「一」；想学 **Next App Router**：看「二」；想做**跨栈迁移/复刻**：重点看「三」+ 上面的映射表。
- 本系列**持续更新**，每篇结合两个真实项目的代码讲，逐步补充。
