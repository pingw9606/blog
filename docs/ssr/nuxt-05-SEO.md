---
---
# Nuxt 老站篇⑤：SEO（useHead / useSeoMeta + hreflang）

> 老站 SEO 靠 `useHead`/`useSeoMeta` 输出 meta，加两个自封装 composable：`usePageSeo`（后端驱动的 title/description）和 `useAlternateLinks`（多语言 hreflang）。对照 Next 新站的 `generateMetadata` + `buildMetadata`。

---

## 0. 基础：`useHead` / `useSeoMeta`

Nuxt 里设置页面 meta 用 `useHead`（通用 head）或 `useSeoMeta`（SEO 专用、字段名友好）：
```ts
useSeoMeta({ title, description, ogTitle: title, ogImage, twitterCard: 'summary_large_image' })
```
对应 Next 的 `generateMetadata` 返回的对象。

## 1. `usePageSeo`：后端驱动的 title/description

老站的一个特点——**SEO 文案可由后端配置**。`usePageSeo(key)` 用 `useAsyncData` 拉 `/api/seo/{key}`（服务端 SEO 接口），拿到 title/description；拿不到就回退 i18n key（`{key}-title`）：
```ts
const { data } = useAsyncData(
  () => ['seo', key, lang].join(':'),
  () => $fetch(`/api/seo/${key}`, { params: { lang } }),
)
const title = computed(() => data.value?.title ?? t(`${key}-title`))
useHead(() => ({
  title: title.value,
  meta: [{ name: 'description', content: description.value }],
  link: defaults.canonical ? [{ rel: 'canonical', href: defaults.canonical }] : [],
}))
```
> 这和 Next 新站不同：新站 SEO 文案主要在**代码里/i18n**（`buildMetadata`），老站可**后端下发**。迁移时要决定 SEO 文案的来源。

## 2. `useAlternateLinks`：多语言 hreflang

SEO 站必须给每页声明多语言 `alternate`（hreflang）。`useAlternateLinks()` 内置 16 语言配置，结合后端返回的各语言 slug/name，拼出各语言 URL，注入 `<link rel="alternate" hreflang="…">`：
```ts
const ALL_LOCALES = [{ code:'en', hreflang:'en' }, { code:'ja', hreflang:'ja' }, /* … */]
// 结合 useRequestURL + 各语言 slug 生成 alternate links → useHead 注入
```
canonical 自指 + hreflang 双向，是 SEO 红线（对应 Next 的 `buildAlternates`）。

## 3. canonical / 分页规范

- **canonical 自指**：每页声明指向自己的规范 URL；
- **分页第 1 页重定向**：`/dramas/1` 由 middleware 301 到 `/dramas`（见结构篇），避免重复内容；
- 这些和 Next 新站的"canonical 自指、参数页指向无参"是同一套 SEO 原则。

## 4. SSR 输出

SEO 靠 SSR：老站 setup 顶层 `await` 取数 + `useHead`/`useSeoMeta` 在服务端就把 title/description/link 渲染进 HTML，爬虫直接抓到（见取数篇）。

## 5. 对照 Next 新站

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 页面 meta | `useHead` / `useSeoMeta` | `generateMetadata()` |
| title/description 来源 | **后端 `/api/seo/{key}`** + i18n 回退 | 代码/i18n（`buildMetadata` 入参） |
| canonical | `useHead` link + middleware 分页重定向 | `alternates.canonical` 自指 |
| hreflang | `useAlternateLinks`（16 语言拼 URL） | `buildAlternates`（16 语言 + x-default） |
| sitemap/robots | 模块 / `public/robots.txt` | `app/sitemap.ts` / `app/robots.ts` |

## 6. 小结

- 老站 SEO = **`useHead`/`useSeoMeta`** + `usePageSeo`（**后端驱动**文案，i18n 回退）+ `useAlternateLinks`（多语言 hreflang）。
- 死守 canonical 自指、hreflang 双向、分页重定向、SSR 输出。
- 迁 Next：换成 `generateMetadata` + `buildMetadata`，并决定 SEO 文案来源（老站可后端下发，新站主要在代码/i18n）。

下一篇：**播放器 xgplayer**。
