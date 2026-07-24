---
---
# Nuxt 老站篇①：项目结构与文件路由

> 本篇讲老站 `shorttv-website`（Nuxt 3）的**目录结构、文件路由、自定义路由正则、layouts/middleware**。这是"一"号线的起点，后面会和 Next 新站逐块对照。

---

## 0. 目录结构

```
shorttv-website/
├── pages/              # 文件路由（每个 .vue 自动成路由）
│   ├── index/          # 首页
│   ├── drama/[id].vue  # 剧集详情
│   ├── dramas/[category]/[page].vue   # 剧场（分类+分页）
│   ├── episode/  Episodes/  Fandom/  search/  genres/
│   └── player.vue  upload.vue  privacy.vue …
├── layouts/            # 布局（default.vue / home.vue）
├── components/         # 组件（自动导入，dramas/ mobile/ HomeComponent/ ui/）
├── composables/        # 组合式函数（api/ usePageSeo useAlternateLinks useDevice …）
├── stores/             # Pinia（dramaStore/filterStore/fandomStore/player）
├── middleware/         # 路由中间件（redirect-*-page-1 等）
├── plugins/            # 插件（gpc.client / disable-devtool.client）
├── server/             # Nitro 服务端（api/ middleware/）
├── utils/              # crypto(AES) / track / slug / video-hls-loader …
├── i18n/locales/       # 19 种语言 JSON
└── nuxt.config.ts
```
对照 Next 新站：`pages/` → `app/[locale]/`；`layouts/default.vue` → `layout.tsx`；**composables + stores + 自动导入** 是 Nuxt 特色，Next 那边换成 `lib/` + hooks + 手动 import。

## 1. 文件路由

Nuxt 里 **`pages/` 下的 `.vue` 文件自动成为路由**，无需手动配置：
- `pages/index/index.vue` → `/`
- `pages/drama/[id].vue` → `/drama/:id`（动态段）
- `pages/dramas/[category]/[page].vue` → `/dramas/:category/:page`

## 2. 自定义路由正则（SEO URL 精控）

默认文件路由不够精细，老站在 `nuxt.config` 的 **`hooks: pages:extend`** 里用正则改写路径，区分"分页"和"分类详情"：
```ts
hooks: {
  'pages:extend'(pages) {
    // /dramas/:page 只匹配纯数字（分页）
    pages.find(p => p.name === 'dramas-page').path = '/dramas/:page(\\d+)'
    // /dramas/:category 匹配 "xxx-数字"（分类详情）
    pages.find(p => p.name === 'dramas-category').path = '/dramas/:category(.+-\\d+)'
    // Fandom 同理：/fandom/:page(\d+) 分页、/fandom/:id(.+-\d+) 详情
  }
}
```
这样 `/dramas/2`（分页）和 `/dramas/romance-100`（分类）走不同页面组件——**SEO URL 结构清晰**。（新站是靠 `[[...slugs]]` catch-all + 代码里 `parseSlugs` 区分数字/slug 达到同样效果。）

## 3. layouts 与 middleware

- **layouts**：`default.vue`（大部分页）、`home.vue`（首页专用）。页面用 `definePageMeta({ layout: 'home' })` 选布局。
- **middleware**：`redirect-*-page-1.ts` 系列——把 `/dramas/1` 这种"第 1 页"**重定向到无页码的规范 URL**（`/dramas`），避免重复内容、利于 canonical：
```ts
// middleware/redirect-dramas-page-1.ts
export default defineNuxtRouteMiddleware((to) => {
  if (to.params.page === '1') return navigateTo('/dramas', { redirectCode: 301 })
})
```

## 4. 自动导入（Nuxt 特色）

Nuxt **自动导入** `components/`、`composables/`、`utils/` 下的东西，页面里直接用（不写 import）：
```vue
<script setup>
const { request } = useApi()      // composables/api 自动可用
const store = useDramaStore()      // stores 自动可用（@pinia/nuxt）
</script>
<template><DramaCard :drama="d" /></template>  <!-- components 自动可用 -->
```
> 迁移到 Next 时这点最不一样：**Next 全部要手动 import**。

## 5. app.vue / error.vue

- `app.vue`：应用根（`<NuxtLayout><NuxtPage/></NuxtLayout>`）。
- `error.vue`：全局错误页。

## 6. 对照 Next 新站

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 路由 | `pages/` 文件路由 + `pages:extend` 正则 | `app/[locale]/` 目录 + `[[...slugs]]` catch-all + 代码解析 |
| 布局 | `layouts/*.vue` + `definePageMeta` | `layout.tsx`（嵌套） |
| 分页第1页重定向 | `middleware/redirect-*-page-1` | 代码里判断 + `redirect` |
| 导入 | **自动导入**（组件/composable/util） | 全部手动 import |
| 多语言 | `@nuxtjs/i18n` 自动生成 locale 路由 | `[locale]` 段 + `generateStaticParams` |

## 7. 小结

- Nuxt = **`pages/` 文件路由**，用 `pages:extend` 正则精控 SEO URL；layouts 选布局、middleware 做分页重定向。
- **自动导入**（components/composables/utils/stores）是 Nuxt 一大便利，也是迁移 Next 时要全部改成手动 import 的点。

下一篇：**数据获取与 SSR**（`useApi().request` + setup 顶层 await）。
