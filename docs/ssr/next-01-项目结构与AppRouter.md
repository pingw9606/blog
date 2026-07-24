---
---
# Next 新站篇①：项目结构与 App Router

> 本篇讲新站 `vibeshort-website`（Next 16 App Router）的**目录结构、路由约定、`[locale]` 多语言段、根 layout**。对照老站 Nuxt 的 `pages/` 文件路由，看 App Router 怎么组织一个多语言 SEO 站。

---

## 0. 目录结构

```
src/
├── app/[locale]/          # 所有页面（多语言段）
│   ├── layout.tsx         # 根布局（每个语言一套）
│   ├── page.tsx           # 首页 /
│   ├── drama/[slug]/page.tsx        # 剧集详情 /drama/xxx-123
│   ├── dramas/[[...slugs]]/page.tsx # 剧场（可选 catch-all，含分页/分类）
│   ├── episode/[slug]/page.tsx      # 播放页
│   ├── fandom/…  search/…
├── app/sitemap.ts         # sitemap（含 hreflang alternates）
├── app/robots.ts          # robots（屏蔽 /api /admin）
├── i18n/                  # routing / navigation / request 配置
├── messages/              # 各语言 JSON 文案
├── config/site.ts         # 品牌配置（换站只改这里）
├── lib/api/               # 接口层（server-only）
├── lib/seo/               # metadata + schema 工具
└── components/            # 复用组件
```

对比 Nuxt：老站的 `pages/` 文件路由 → 这里是 **`app/` 目录路由**；`layouts/default.vue` → **`app/[locale]/layout.tsx`**。

## 1. App Router 的约定文件

App Router 靠**目录 + 约定文件名**组织：
- `page.tsx` = 一个可访问路由；
- `layout.tsx` = 包裹子路由的共享布局（可嵌套）；
- `loading.tsx` / `error.tsx` = 加载态 / 错误边界；
- 动态段：`[slug]`（单段）、`[[...slugs]]`（可选 catch-all）。

**默认是 Server Component**（在服务端渲染，代码不进浏览器包）——这是和 Nuxt 组件"两端都跑"最大的不同。

## 2. `[locale]` 多语言段 + 静态参数

所有页面都在 `app/[locale]/` 下，`[locale]` 是语言段。16 种语言在 `i18n/routing.ts` 定义，用 **`as-needed` 前缀策略**：默认语言 `en` 无前缀（`/drama/x`），其它带前缀（`/ja/drama/x`）：
```ts
export const routing = defineRouting({
  locales: ['en','es','pt','zh-Hant','id','ja','ko','th','ar','vi','de','fr','ms','ru','it','tr'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',   // en 无前缀，其它带
  localeDetection: false,      // 关闭自动跳转，URL 唯一、利于爬虫
});
```

页面用 `generateStaticParams` **为每种语言预生成静态参数**（对应 Nuxt i18n 的多语言路由）：
```tsx
// app/[locale]/layout.tsx
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
```

## 3. 根 layout 做了什么

`app/[locale]/layout.tsx`（对应 Nuxt `layouts/default.vue`）：
```tsx
export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);        // 启用静态渲染 + 绑定当前语言
  return (
    <html lang={locale} dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}>
      <body className={`${montserrat.variable} ${lexendDeca.variable}`}>
        <NextIntlClientProvider>   {/* 给客户端组件提供 i18n */}
          <GpcNotice /><Analytics /><ApiDebugFetchPatch /><BuildInfo />
          <AppShell languages={languages}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```
关键点：
- **`setRequestLocale(locale)`**：告诉 next-intl 当前语言，并让页面可静态渲染；
- **`NextIntlClientProvider`**：把 i18n 上下文传给客户端组件（服务端组件直接用 `getTranslations`，客户端组件靠这个 Provider）；
- **字体**用 `next/font`（`montserrat` / `lexendDeca`），通过 CSS 变量注入；
- 全局挂载了分析/埋点补丁/构建信息等（都是各司其职的小组件）。

## 4. metadata / SEO 入口

layout 里有静态 `metadata`（`metadataBase`、title 模板、icons），页面级用 `generateMetadata()` 输出各自的 title/description/canonical/hreflang（详见后面 SEO 篇）。对应 Nuxt 的 `app.head` + 页面 `useSeoMeta`。

## 5. 对照 Nuxt 的关键差异

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 路由 | `pages/` 文件即路由 | `app/[locale]/` 目录 + `page.tsx` |
| 布局 | `layouts/default.vue` | `app/[locale]/layout.tsx` |
| 多语言 | i18n 模块自动生成 locale 路由 | `[locale]` 段 + `generateStaticParams` |
| 组件默认 | 两端都可能跑 | **默认 Server Component（仅服务端）** |
| import | 自动导入组件/composable | **全部手动 import** |

## 6. 小结

- App Router = **目录路由 + 约定文件（page/layout/…）**，默认 Server Component。
- 多语言靠 **`[locale]` 段 + `as-needed` 前缀 + `generateStaticParams`**，根 layout 里 `setRequestLocale` + `NextIntlClientProvider` 打通 i18n。
- 结构上和 Nuxt 能对应（pages↔app、layouts↔layout），但**"默认服务端 + 手动 import"** 是思维要转过来的地方。

下一篇：这些页面**怎么取数据（SSR）** —— Server Component 直接 `await`。
