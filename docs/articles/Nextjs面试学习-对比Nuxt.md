---
---
# Next.js（App Router）面试学习文档 —— 对照 Nuxt 3

> 背景：本仓库 `vibeshort-website`（Next.js 16 App Router + React 19）是老项目 `shorttv-website`（Nuxt 3 + Vue 3）的跨技术栈复刻。本文用项目里的真实代码讲 Next.js 核心，并对照你熟悉的 Nuxt，帮你建立映射、应付面试。

---

## 0. 一张表先建立心智映射

| 能力 | Nuxt 3（你熟悉的） | Next.js App Router（要学的） |
|------|------|------|
| 渲染单元 | 同构组件（服务端+客户端都跑） | **默认 Server Component（只在服务端跑）**，交互组件标 `"use client"` |
| 路由 | `pages/` 文件路由 | `app/` 文件路由（文件夹即路由段） |
| 页面入口 | `pages/xxx.vue` | `app/xxx/page.tsx` |
| 布局 | `layouts/default.vue` + `<slot/>` | `app/layout.tsx` + `{children}` |
| 数据获取 | `useFetch` / `useAsyncData` | **async Server Component 直接 `await`** / `fetch` |
| 加载态 | `<NuxtLoadingIndicator>` / 手动 | `loading.tsx`（Suspense 边界） |
| 错误页 | `error.vue` | `error.tsx` / `not-found.tsx` |
| SEO 头 | `useHead` / `useSeoMeta` | `export const metadata` / `generateMetadata` |
| 状态管理 | Pinia store | 服务端无需 store；客户端用 Context/Zustand |
| 中间件 | `middleware/` | `middleware.ts`（Edge） |
| 国际化 | `@nuxtjs/i18n` | `next-intl`（本项目用） |
| 接口代理层 | `server/api/` (Nitro) | `app/api/.../route.ts`（Route Handler） |
| 渲染模式 | SSR/SSG/ISR/SPA（route rules） | SSR/SSG/ISR/CSR（段配置 + 组件类型） |

**面试一句话总结两者最大区别**：Nuxt 是「同构（isomorphic）框架」，一套组件代码跑在服务端和客户端两遍（hydration）；Next.js App Router 引入了 **React Server Components**，把组件分成「只跑在服务端的」和「`use client` 的」两类，默认服务端，按需下放到客户端——目的是**减少发到浏览器的 JS**。

---

## 1. 渲染模式（面试必考，重中之重）

四种渲染方式，必须能说清楚区别、适用场景、在 Next.js 里怎么开启：

### 1.1 CSR（客户端渲染）
- 服务端只返回空壳 HTML，数据和渲染都在浏览器。
- SEO 差、首屏慢。SPA（纯 React/Vue）就是这种。
- Next 里：组件标 `"use client"` 且数据在 `useEffect` 里 fetch。

### 1.2 SSR（服务端渲染，每次请求实时渲染）
- 每个请求服务端拉数据 + 渲染 HTML 返回，**TTFB 取决于后端快慢**。
- SEO 好，但每次都打后端，慢、扛压差。
- Next 里：页面用了**动态 API**（`headers()`/`cookies()`/`searchParams`）或显式 `export const dynamic = 'force-dynamic'`。
- **本项目例子**：`/dramas/[[...slugs]]` 列表页是 SSR（`ƒ` 标记），因为它依赖路由实时拉剧集。

### 1.3 SSG（静态生成，构建时预渲染）
- `build` 时就生成好 HTML，放 CDN，**秒开**。
- 适合内容稳定的页面。
- Next 里：页面不依赖动态数据 + 有 `generateStaticParams`。
- **本项目例子**：`/[locale]/privacy`、`/terms` 等法务页（`●` 标记，16 语言全预渲染）。

### 1.4 ISR（增量静态再生成）⭐ 面试高频
- **SSG + 定时刷新**：构建/首次访问时生成静态页，缓存 N 秒；过期后后台悄悄再生成，用户始终拿到快的缓存。
- 既有 SSG 的速度，又能更新内容。**SEO 视频站/电商的标配**。
- Next 里：`export const revalidate = N`。
- **本项目例子**（我们一起做的）：`src/app/[locale]/drama/[slug]/page.tsx`
  ```tsx
  export const revalidate = 60;        // 60 秒缓存
  export const dynamicParams = true;   // 没预生成的剧集，首次访问按需生成再缓存
  export function generateStaticParams() { return []; }  // 剧集太多，不在 build 时全量预渲染
  ```
  验证产物里能看到 `Cache-Control: s-maxage=60, stale-while-revalidate`，命中时 `x-nextjs-cache: HIT`，不打后端。

> **对照 Nuxt**：Nuxt 用 `routeRules` 配置同样的能力，写在 `nuxt.config.ts`：
> ```ts
> routeRules = {
>   '/drama/**': { isr: 60 },        // ISR
>   '/privacy':  { prerender: true },// SSG
>   '/dramas':   { ssr: true },      // SSR
> }
> ```
> **区别**：Nuxt 在配置文件集中声明；Next 在**每个页面文件里 `export const`** 声明（段级配置 Segment Config）。面试可答：「Next 的渲染模式是 per-route 文件内声明的，由 `dynamic`/`revalidate`/`fetchCache` 等段配置 + 是否用动态 API 共同决定。」

### 面试题：「一个页面是 SSR 还是 SSG，Next 怎么判断？」
答：默认尽量静态化。一旦页面（或其调用链）用了**动态 API**（`headers()`、`cookies()`、`searchParams`、`unstable_noStore`）或 `fetch` 设了 `cache:'no-store'`、或 `export const dynamic='force-dynamic'`，就转为动态 SSR。否则静态/ISR。

> **本项目真实踩坑**（可当面试故事讲）：详情页本来想做 ISR，但我们的 API 客户端 `apiPost` 内部调了 `headers()` 读 host 和透传用户 IP，导致页面被判定为 dynamic，`revalidate` 失效。解决办法：**把 `headers()` 解耦出去**——host 改用环境变量、IP 改成可选参数，只在真正需要 per-request 的动态路由里显式读 header。改完页面才变成 `●` ISR。

---

## 2. React Server Components（RSC）—— App Router 的灵魂

### 2.1 核心概念
- **Server Component（默认）**：只在服务端执行，**代码不打进浏览器 bundle**。可以直接 `async/await` 读数据库/接口、读文件、用密钥。不能用 `useState`/`useEffect`/事件绑定/浏览器 API。
- **Client Component（`"use client"`）**：传统 React 组件，会 hydration，能用 hooks、事件、浏览器 API。

```tsx
// Server Component（本项目 DramaCard）——没有 "use client"，可以 await
export async function DramaCard({ drama }) {
  const t = await getTranslations();   // 服务端直接取
  return <Link href={...}>{drama.title}</Link>;
}
```

```tsx
// Client Component（本项目 DramasClient）——有 "use client"，能用 hooks
"use client";
export function DramasClient({ initialData }) {
  const [data, setData] = useState(initialData);
  useEffect(() => { /* 客户端 fetch */ }, [page]);
}
```

### 2.2 关键规则（面试爱问）
1. `"use client"` 是**边界**：一旦一个组件标了，它 import 的所有子组件都进客户端 bundle。
2. Server Component **可以渲染** Client Component（传 props），但 Client Component **不能 import** Server Component（只能通过 `children` 插槽接收）。
3. Server → Client 传的 props 必须**可序列化**（不能传函数、Date 实例等）。
4. 默认全是 Server Component，**只在需要交互时才标 `"use client"`**，把客户端 JS 降到最低。

> **对照 Nuxt/Vue**：Vue 没有这个分裂——所有组件都是同构的，服务端渲染一遍 + 客户端 hydration 再跑一遍，组件代码**全量**打进浏览器。Next RSC 的优势是「展示型组件的代码根本不下发到浏览器」。面试可答：「RSC 解决的是 SSR 框架的通病——hydration 要把所有组件 JS 发给客户端；RSC 让纯展示组件留在服务端，显著减小 bundle。」

### 2.3 本项目的实战权衡（高质量面试谈资）
我们的 `/dramas` 列表页做过一次重构：从纯 Server Component 改成「**首屏 SSR 给爬虫 + 客户端接管做 SPA 式切换**」。
- 服务端 `page.tsx` 拉首屏数据，传给 `DramasClient`（client component）做 `initialData`。
- 之后切分类/翻页：客户端 `fetch('/api/dramas')` + 本地 Map 缓存，URL 路由瞬间变、骨架过渡，不再整页等服务端。
- 既保住了 SEO（首屏 HTML 完整），又拿到了 SPA 的流畅。这正是对标源站 Nuxt（`watch(route)` 客户端拉数据）的做法。

---

## 3. 路由系统（文件即路由）

### 3.1 约定文件
```
app/
├── layout.tsx          # 根布局（必须有 <html><body>）
├── page.tsx            # 路由对应的页面
├── loading.tsx         # 加载 UI（Suspense fallback）
├── error.tsx           # 错误边界（client component）
├── not-found.tsx       # 404 UI
└── api/xxx/route.ts    # API 端点（Route Handler）
```

### 3.2 动态路由（对照 Nuxt）
| 模式 | Next.js | Nuxt |
|------|---------|------|
| 单段动态 | `app/drama/[slug]/page.tsx` | `pages/drama/[slug].vue` |
| catch-all | `app/dramas/[...slug]/page.tsx` | `pages/dramas/[...slug].vue` |
| 可选 catch-all | `app/dramas/[[...slugs]]/page.tsx` | （Nuxt 用嵌套/index 实现） |
| 路由组（不影响 URL） | `app/(marketing)/page.tsx` | 无直接对应 |

**本项目例子**：`/dramas/[[...slugs]]` 是**可选 catch-all**，一套文件处理 `/dramas`、`/dramas/2`、`/dramas/romance-200067`、`/dramas/romance-200067/2` 四种 URL，在代码里解析 `slugs` 数组判断是页码还是分类：
```tsx
function parseSlugs(slugs?: string[]) {
  if (!slugs?.length) return { page: 1 };              // /dramas
  if (slugs.length === 1)
    return /^\d+$/.test(slugs[0])
      ? { page: Number(slugs[0]) }                     // /dramas/2
      : { genreSlug: slugs[0], page: 1 };              // /dramas/romance-200067
  return { genreSlug: slugs[0], page: Number(slugs[1]) }; // /dramas/romance-200067/2
}
```

### 3.3 params / searchParams 是 **Promise**（Next 15+ 变更，面试新考点）
Next 15 起，`params` 和 `searchParams` 改成异步，必须 `await`：
```tsx
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;   // ⚠️ 必须 await
}
```
> 面试可答：「Next 15 把 params/searchParams/cookies/headers 都改成了异步 API，为的是支持更激进的流式渲染（PPR）。」

---

## 4. 数据获取（对照 useFetch/useAsyncData）

### 4.1 Server Component 直接 await（最常用）
```tsx
// 本项目首页：服务端并行拉数据，零客户端 JS 开销
export default async function HomePage() {
  const [banners, groups] = await Promise.all([getBanners(5), getContentGroups()]);
  return <BannerCarousel banners={banners} />;
}
```
> **对照 Nuxt**：你在 Nuxt 里写 `const { data } = await useAsyncData(() => $fetch(...))`。Next 里**不需要专门的 composable**，Server Component 本身就是 async 函数，直接 `await` 普通的数据函数即可。

### 4.2 fetch 缓存（面试高频，且 Next 15 改了默认值）
Next 扩展了原生 `fetch`，可控缓存：
```tsx
fetch(url)                                   // Next 15 默认 no-store（不缓存）
fetch(url, { cache: 'force-cache' })         // 强缓存（SSG 行为）
fetch(url, { next: { revalidate: 60 } })     // ISR：缓存 60 秒
fetch(url, { next: { tags: ['dramas'] } })   // 打标签，可按需失效
```
- **Next 14 vs 15 区别**：14 里 `fetch` 默认缓存（force-cache）；**15 起默认不缓存**（no-store）。这是高频考点。
- 按需失效：`revalidateTag('dramas')` / `revalidatePath('/dramas')`（在 Server Action 或 Route Handler 里调）。

### 4.3 请求去重
React 的 `cache()` 包裹函数，**同一次渲染内**多次调用同参数只请求一次：
```tsx
// 本项目 getGenres 用 cache() 包裹，一次渲染内多个组件调用只打一次后端
export const getGenres = cache(async () => { ... });
```
> 对照 Nuxt：`useAsyncData` 的 `key` 做去重；Next 用 React `cache()`。

---

## 5. 布局、Loading、Error（对照 Nuxt layouts）

### 5.1 layout.tsx —— 嵌套布局
- 根 `layout.tsx` 必须渲染 `<html><body>`，包裹 `{children}`。
- 布局**不随导航重渲染**（状态保留），只有变化的 page 段更新。
- **本项目**：`app/[locale]/layout.tsx` 注入字体、`NextIntlClientProvider`、`AppShell`（含 Header/Footer）。
> 对照 Nuxt：`layouts/default.vue` 的 `<slot/>` ≈ Next 的 `{children}`；`definePageMeta({ layout: 'home' })` 切换布局 ≈ Next 用路由组或嵌套 layout。

### 5.2 loading.tsx —— 自动 Suspense 边界 ⭐
放一个 `loading.tsx`，Next 会自动用它作为该路由段的 Suspense fallback——**导航瞬间显示骨架，数据 ready 后替换**。
- **本项目**：`/dramas/[[...slugs]]/loading.tsx` 是卡片骨架屏；切换到列表页时先显示骨架。
> 对照 Nuxt：你得手动用 `<NuxtLoadingIndicator>` 或 `pending` 状态；Next 是文件约定，零代码接入。

### 5.3 error.tsx / not-found.tsx
- `error.tsx` 必须是 client component（要捕获运行时错误，带 `reset()`）。
- `notFound()` 函数抛出 → 渲染最近的 `not-found.tsx`。
- **本项目**：详情页 `if (!drama) notFound();`。

---

## 6. SEO / Metadata（对照 useHead）

### 6.1 静态 metadata
```tsx
export const metadata: Metadata = { title: '...', description: '...' };
```

### 6.2 动态 generateMetadata（按数据生成）
```tsx
// 本项目详情页：按剧集动态生成 title/description/og
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const drama = await getDramaById(parseId(slug));
  return buildMetadata({ title: drama.title, description: drama.description, ogImage: drama.cover_url });
}
```
> **对照 Nuxt**：你用 `useHead({ title, meta:[...] })` 或 `useSeoMeta`。Next 用 `metadata` 导出 / `generateMetadata` 函数，**类型安全**，自动处理 OG/Twitter/canonical/hreflang。本项目 `lib/seo/metadata.ts` 封装了 hreflang 多语言 alternates，和源站 `useAlternateLinks` 对应。

### 6.3 结构化数据 / sitemap / robots
- JSON-LD：直接渲染 `<script type="application/ld+json">`（本项目 `<JsonLd>` 组件，剧集页用 `VideoObject` schema）。
- `app/sitemap.ts`、`app/robots.ts`：导出函数即生成，无需插件。
> 对照 Nuxt：`@nuxtjs/sitemap` 等模块；Next 内置文件约定。

---

## 7. 缓存体系（Next 四层缓存，资深岗必考）

Next.js App Router 有四层缓存，能说全是加分项：

| 缓存 | 位置 | 作用 | 失效方式 |
|------|------|------|----------|
| **Request Memoization** | 服务端，单次请求内 | 同一渲染内 `fetch`/`cache()` 去重 | 请求结束自动清 |
| **Data Cache** | 服务端，持久 | 缓存 `fetch` 结果（跨请求/用户） | `revalidate` 时间 / `revalidateTag` / `revalidatePath` |
| **Full Route Cache** | 服务端，持久 | 缓存静态路由的渲染产物（HTML+RSC） | 重新部署 / `revalidate` |
| **Router Cache** | 客户端内存 | 缓存访问过的路由段，前进后退秒回 | 会话级 / 时间 / `router.refresh()` |

> 对照 Nuxt：Nitro 有 `cachedEventHandler`、`routeRules` 的 `swr`/`cache`，理念类似但分层没这么细。面试讲清这四层 + ISR 的 `stale-while-revalidate` 关系，基本就过了缓存这关。

---

## 8. Route Handler（API）+ Server Actions

### 8.1 Route Handler（≈ Nuxt server/api）
```ts
// 本项目 app/api/dramas/route.ts —— 给客户端组件调用的接口
export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get('page')) || 1;
  const data = await getDramas({ page });
  return NextResponse.json(data);
}
```
> 对照 Nuxt：`server/api/dramas.get.ts` 里 `defineEventHandler`。理念一样，都是 BFF 层。

### 8.2 Server Actions（了解即可）
`"use server"` 函数，可在客户端直接调用、在服务端执行（表单提交、变更数据），免手写 API。Nuxt 无直接对应（最接近的是 server route + `$fetch`）。

---

## 9. 中间件 middleware（对照 Nuxt middleware）
- `middleware.ts`（项目根），跑在 **Edge**，每个请求前拦截：重定向、鉴权、改 header、i18n 路由。
- **本项目**：`src/proxy.ts` + next-intl 的中间件处理语言前缀路由（`/es/...`）。
> 对照 Nuxt：`middleware/` 目录 + `definePageMeta({ middleware })`（路由中间件）。Next 的 middleware 是**全局单文件**、Edge 运行、能力更偏网络层。

---

## 10. 国际化：next-intl vs @nuxtjs/i18n
| | @nuxtjs/i18n（源站） | next-intl（本项目） |
|---|---|---|
| 配置 | `nuxt.config` i18n 块 | `i18n/routing.ts` `defineRouting` |
| 取文案 | `const { t } = useI18n()` | Server: `getTranslations()`；Client: `useTranslations()` |
| 路由前缀 | `strategy: 'prefix_except_default'` | `localePrefix: 'as-needed'` |
| 切语言 | `setLocale` | `useRouter().replace(path, {locale})` |
| 静态渲染 | 自动 | 需 `setRequestLocale(locale)` 才能静态化 |

> 本项目 16 语言，默认语言 `en` 无前缀，其它带前缀（`/ja`、`/es`），关闭了基于 Cookie 的自动跳转以保证 URL 对爬虫唯一稳定。

---

## 11. 样式方案
- 本项目用 **SCSS Modules**（`*.module.scss`，自动 scoped），等价于 Vue 的 `<style scoped>`。
- 设计令牌走 CSS 变量（`globals.scss` 的 `:root`）+ SCSS 变量/mixin（`src/styles/`）。
- **面试可讲的坑**：从 Tailwind 迁到 SCSS Modules 时，丢了 Tailwind 的 preflight（全局 reset），导致原生 `button`/`input` 默认样式泄漏——要手动补一份 base reset。

> 对照 Nuxt/Vue：`<style scoped lang="scss">` 是组件级 scoped；Next 的 CSS Modules 是文件级 scoped（类名编译成 hash）。两者心智一致。

---

## 12. 状态管理（RSC 时代的变化）
- **Server Component 不需要全局 store**：数据在服务端 `await` 拿到，直接传 props。
- 客户端共享状态才用 React Context / Zustand / Jotai。
> 对照 Nuxt：源站重度用 Pinia（`dramaStore`、`filterStore`）。迁到 Next 后，**大部分 store 消失了**——列表筛选靠 URL 路由 + 服务端取数，不再需要全局状态。这是 RSC 范式的典型变化，面试可作为「架构差异」谈点：「Nuxt/SPA 习惯把状态放 store；RSC 鼓励把状态放 URL + 服务端，store 用得更少。」

---

## 13. 高频面试题速答（背这些）

**Q1：App Router 和 Pages Router 区别？**
A：App Router（Next 13+）基于 RSC，默认服务端组件、文件约定更丰富（layout/loading/error）、布局可嵌套且不重渲染、支持流式渲染。Pages Router 是老的，全是客户端组件 + `getServerSideProps`/`getStaticProps`。

**Q2：SSR/SSG/ISR/CSR 怎么选？**
A：SEO + 内容稳定 → SSG；SEO + 内容会更新 → ISR；强实时/个性化 → SSR；纯交互后台/无 SEO → CSR。本项目：法务页 SSG、详情页 ISR、列表页 SSR + 客户端接管。

**Q3：RSC 解决什么问题？**
A：传统 SSR 框架 hydration 要把所有组件 JS 发到浏览器；RSC 让纯展示组件只在服务端跑、不下发 JS，减小 bundle、提升性能，同时服务端组件能直接访问数据源/密钥。

**Q4：`"use client"` 的影响？**
A：是客户端边界，它及其 import 的子树都进客户端 bundle、会 hydration。应尽量下沉到叶子组件，保持上层为 Server Component。

**Q5：Next 怎么做 ISR？`revalidate` 原理？**
A：`export const revalidate = N`。首次/构建生成静态页缓存 N 秒；过期后下一个请求触发后台再生成（stale-while-revalidate），用户始终拿缓存。配合 `revalidateTag/Path` 可按需失效。

**Q6：Next 15 有哪些 break change？**
A：params/searchParams/cookies/headers 变异步（要 await）；`fetch` 默认不再缓存（改 no-store）；GET Route Handler 默认不缓存。

**Q7：四层缓存说一下？**
A：Request Memoization（单请求去重）、Data Cache（fetch 结果持久缓存）、Full Route Cache（路由产物缓存）、Router Cache（客户端路由段缓存）。

**Q8：为什么用了 `headers()`/`cookies()` 页面就变动态？**
A：它们是 Dynamic API，依赖 per-request 信息，无法在构建时静态确定，所以页面退化为按请求 SSR，`revalidate` 失效。要静态化就别在渲染链路里读它们（本项目把 IP/host 解耦出 API 客户端就是为此）。

**Q9：loading.tsx 原理？**
A：Next 自动用它包一层 Suspense 作为该段 fallback，配合服务端流式渲染，导航时先出骨架、数据 ready 再流式替换。

---

## 14. 用本项目讲一个完整的「故事」（面试加分）

> 面试官问「讲个你做过的 Next.js 优化」，你可以这样讲：
>
> 「我把一个短剧 SEO 站从 Nuxt 迁到 Next App Router。详情页原来是 SSR，每次请求都打后端、TTFB 不稳。我改成 ISR（`revalidate=60`），但发现没生效——排查到是 API 客户端里调了 `headers()` 读用户 IP，把页面拖成了 dynamic。我把 `headers()` 解耦出去（host 走环境变量、IP 改可选参数，只在动态路由显式读），详情页才真正变成 ISR，命中缓存时 `x-nextjs-cache: HIT`、`Cache-Control: s-maxage=60, stale-while-revalidate`，不再回源。列表页则用『首屏 SSR 保 SEO + 客户端 fetch 接管做 SPA 切换 + 本地缓存』，兼顾收录和流畅。」

这个故事覆盖了：渲染模式、ISR 原理、动态 API 陷阱、缓存、RSC/Client 边界——是面试官想听的全部要点。

---

## 附：学习路径建议
1. 先吃透 **第 1 节（渲染模式）+ 第 2 节（RSC）**，这是 App Router 区别于一切的根本。
2. 再过 **第 7 节（缓存）+ 第 4 节（数据获取）**，资深岗必问。
3. 路由/布局/SEO（3/5/6 节）对你（有 Nuxt 基础）几乎是一一映射，快速过。
4. 最后背 **第 13 节 Q&A + 第 14 节故事**。

> 配合本仓库代码对着读：`app/[locale]/drama/[slug]/page.tsx`（ISR）、`components/drama/DramasClient.tsx`（RSC+Client 边界）、`lib/api/client.ts`（headers 解耦）、`app/[locale]/layout.tsx`（布局+i18n）。
