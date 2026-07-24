---
---
# Nuxt 老站篇④：@nuxtjs/i18n 国际化

> 老站 19 种语言用 **@nuxtjs/i18n + vue-i18n**。本篇讲配置、取文案、带语言前缀的路由、懒加载。对照 Next 新站的 next-intl。

---

## 0. 配置（nuxt.config）

```ts
i18n: {
  defaultLocale: 'en',
  strategy: 'prefix_except_default',   // en 无前缀，其它带 /ja /ko …
  detectBrowserLanguage: false,        // 关闭自动跳转，URL 唯一利于 SEO
  lazy: true,                          // 懒加载语言包
  langDir: 'locales',
  locales: [
    { code: 'en', name: 'English', file: 'en.json' },
    { code: 'ja', name: '日本語', file: 'ja.json' },
    // … 共 19 种
  ],
}
```
- **`strategy: 'prefix_except_default'`** = Next 那边的 `localePrefix: 'as-needed'`；
- **`lazy: true`** 懒加载对应语言包（首屏只加载当前语言，不影响 SSR/SEO）；
- **`detectBrowserLanguage: false`** 关掉按浏览器语言自动跳转（保证内容 URL 唯一）。

## 1. 取文案：`$t` / `useI18n`

模板里直接 `$t('key')`（vue-i18n 全局注入）：
```vue
<template><h1>{{ $t('dramas-title') }}</h1></template>
```
`<script>` 里用 `useI18n()`：
```ts
const { t, locale } = useI18n()
t('dramas-title'); locale.value  // 'en' / 'ja' …
```
语言包在 `i18n/locales/*.json`（`en.json`/`ja.json`/…），key 结构一致。

## 2. 带语言前缀的路由

跳转要保持当前语言前缀，用 `localePath()` 或 `<NuxtLink>`（i18n 会补前缀）：
```vue
<NuxtLink :to="localePath(`/drama/${slug}`)">…</NuxtLink>
```
（对应 Next 那边"必须用 `@/i18n/navigation` 的 `Link`"，一个道理——别用会丢前缀的原生跳转。）

## 3. 当前语言 composable

老站封装了 `useCurrentLang()` 拿当前语言（在取数、SEO、拼多语言 URL 时统一用），避免各处直接读 `locale`。

## 4. 对照 Next 新站（next-intl）

| | Nuxt 3 `@nuxtjs/i18n` | Next 16 `next-intl` |
|---|---|---|
| 前缀策略 | `strategy: 'prefix_except_default'` | `localePrefix: 'as-needed'` |
| 取文案 | `$t()` / `useI18n().t` | `getTranslations`(服务端) / `useTranslations`(客户端) |
| 语言包 | `i18n/locales/*.json` | `messages/*.json` |
| 带语言链接 | `localePath()` / `<NuxtLink>` | `@/i18n/navigation` 的 `Link` |
| 懒加载 | `lazy: true` | `request.ts` 里按 locale 动态 import |
| 自动跳转 | `detectBrowserLanguage: false` | `localeDetection: false` |

> 迁移要点：**语言包 JSON 基本可平移**（key 一致），主要改调用 API（`$t` → `getTranslations/useTranslations`）和链接（`localePath` → `Link`）。注意两站语言集略有出入（老站 19 种含 hi/fil/zh-Hans，新站 16 种）——迁移时要对齐 locale 列表。

## 5. 小结

- 老站 i18n = **@nuxtjs/i18n + vue-i18n**，`prefix_except_default` + `lazy` + 19 语言包。
- 取文案 `$t`/`useI18n`，跳转 `localePath`/`<NuxtLink>` 保前缀。
- 迁 Next：语言包可平移，调用换 next-intl API，注意 locale 列表差异。

下一篇：**SEO（useHead/useSeoMeta + hreflang）**。
