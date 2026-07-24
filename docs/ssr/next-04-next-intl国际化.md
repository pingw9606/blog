---
---
# Next 新站篇④：next-intl 国际化

> 新站 16 种语言，用 **next-intl** 实现。本篇讲它的三块配置（routing / navigation / request）、服务端与客户端怎么取文案、路由跳转为什么必须用专门的 `Link`。对照老站的 `@nuxtjs/i18n + vue-i18n`。

---

## 0. 三块配置文件

next-intl 在本项目分三个文件（`src/i18n/`）：

### ① `routing.ts` — 定义语言与前缀策略
```ts
export const routing = defineRouting({
  locales: ['en','es','pt','zh-Hant','id','ja','ko','th','ar','vi','de','fr','ms','ru','it','tr'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',   // en 无前缀(/drama/x)，其它带前缀(/ja/drama/x)
  localeDetection: false,      // 关闭自动跳转，URL 唯一利于 SEO 抓取
});
```

### ② `navigation.ts` — 多语言感知的导航 API
```ts
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```
**用这些替代 `next/link`、`next/navigation`**——它们会自动带上当前语言前缀，不会丢语言。

### ③ `request.ts` — 每个请求加载对应语言的文案（懒加载）
```ts
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: (await import(`@/messages/${locale}.json`)).default };
});
```
**只加载当前语言的语言包**（懒加载），不把 16 份文案全打进包。

## 1. 语言包：`messages/{locale}.json`

每种语言一个 JSON（`messages/en.json`、`messages/ja.json`…），结构一致、key 相同：
```json
{ "dramas": { "title": "All Dramas", "episodes": "{count} episodes" } }
```
（从 Nuxt 迁移时，语言包 JSON 基本可复用，只是调用 API 变了。）

## 2. 取文案：服务端 vs 客户端

- **服务端组件**（page/layout）用 `getTranslations`：
  ```tsx
  import { getTranslations } from 'next-intl/server';
  const t = await getTranslations('dramas');
  <h1>{t('title')}</h1>
  ```
- **客户端组件**（`"use client"`）用 `useTranslations`：
  ```tsx
  import { useTranslations } from 'next-intl';
  const t = useTranslations('dramas');
  ```
  客户端能用它，靠 layout 里包了 **`<NextIntlClientProvider>`**（把当前语言的 messages 传给客户端）。

## 3. 打通语言的两处关键

1. **layout 里 `setRequestLocale(locale)`**：绑定当前请求的语言，并让页面可静态渲染；
2. **`<NextIntlClientProvider>`**：给客户端组件提供 i18n 上下文（服务端组件不需要，直接 `getTranslations`）。

## 4. 路由跳转：必须用 `@/i18n/navigation`

```tsx
import { Link, useRouter } from '@/i18n/navigation';  // ✅ 不是 next/link、next/navigation
<Link href="/drama/xxx-123">…</Link>   // 自动变成 /ja/drama/... （当前语言）
```
**用错（`next/link`）会丢语言前缀**，跳到默认语言页——这是迁移时高频 bug。

## 5. middleware 与前缀

next-intl 的中间件（`middleware.ts`）负责按 URL 前缀识别语言、`as-needed` 策略下给非默认语言补前缀。`localeDetection: false` 关掉了"按浏览器语言自动跳转"，保证同一内容 URL 唯一（对 SEO 友好，配合 hreflang）。

## 6. 对照 Nuxt（`@nuxtjs/i18n`）

| | Nuxt 3 `@nuxtjs/i18n` | Next 16 `next-intl` |
|---|---|---|
| 配置 | `nuxt.config` i18n（locales/strategy） | `routing.ts` + `middleware` |
| 取文案 | `$t()` / `useI18n()` | `getTranslations`(服务端) / `useTranslations`(客户端) |
| 语言包 | `locales/*.json` | `messages/*.json`（基本可复用） |
| 带语言的链接 | `localePath()` / `<NuxtLink>` | `@/i18n/navigation` 的 `Link` |
| 前缀策略 | `strategy: prefix_except_default` | `localePrefix: 'as-needed'` |

## 7. 小结

- next-intl 三块：**routing（语言/前缀）+ navigation（Link/useRouter）+ request（懒加载 messages）**。
- 取文案：**服务端 `getTranslations`、客户端 `useTranslations`**（靠 `NextIntlClientProvider`）。
- **跳转一律用 `@/i18n/navigation` 的 `Link`**，别用 `next/link`（会丢语言前缀）。
- 语言包 JSON 从 Nuxt 基本可平移，`$t` → `getTranslations/useTranslations`。

下一篇：**SEO（generateMetadata、canonical/hreflang、sitemap）**。
