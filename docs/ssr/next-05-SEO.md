---
---
# Next 新站篇⑤：SEO（generateMetadata / canonical / hreflang / sitemap）

> SEO 站的命根子是 SEO。本篇讲新站怎么用 App Router 的 `generateMetadata` + 一套 `buildMetadata` 工具，产出 **title/description、自指 canonical、双向 hreflang（含 x-default）、sitemap、robots、结构化数据**。对照 Nuxt 的 `useHead/useSeoMeta`。

---

## 0. 页面级 SEO 入口：`generateMetadata`

App Router 里，每个页面导出一个 `generateMetadata` 异步函数（可先取数据、再生成 meta）：
```tsx
// app/[locale]/drama/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const drama = await getDramaById(Number(parseId(slug)));
  if (!drama) return buildMetadata({ locale, path: '/dramas', title: 'Not Found', indexable: false });
  return buildMetadata({
    locale,
    path: `/drama/${buildSlug(drama.title, drama.id)}`,
    title: `${drama.title} - ...`,
    description: drama.description,
  });
}
```
对应 Nuxt 页面里的 `useSeoMeta({...})`——都是"这页的 title/description/canonical 等"。

## 1. 一套 `buildMetadata` 工具统一产出

所有页面复用 `lib/seo/metadata.ts` 的 `buildMetadata`，保证每页都有齐全且正确的 SEO：
```ts
export function buildMetadata({ locale, path, title, description, indexable = true }) {
  return {
    title, description,
    alternates: buildAlternates(locale, path),   // canonical + hreflang
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type:'website', siteName, title, description, url, images:[...] },
    twitter: { card:'summary_large_image', title, description, images:[...] },
  };
}
```

## 2. Canonical 自指 + 双向 hreflang（SEO 红线）

`buildAlternates` 给每个页面生成：
```ts
export function buildAlternates(locale, path) {
  const languages = {};
  for (const l of locales) languages[l] = absoluteUrl(localizedPath(l, path)); // 16 语言互指
  languages['x-default'] = absoluteUrl(localizedPath(defaultLocale, path));     // x-default
  return { canonical: absoluteUrl(localizedPath(locale, path)), languages };    // canonical 自指
}
```
- **canonical 自指向**：当前语言页的 canonical 指向它自己（参数页指向无参版本）；
- **hreflang 双向 + x-default**：16 种语言互相声明 alternate，加 `x-default` 指默认语言；
- **`localizedPath`** 按 `as-needed`：默认语言 en 无前缀，其它加 `/{locale}`。

这几条是 SEO 硬要求，Nuxt 那边是手动拼 `useHead` 的 link，这里工具化了。

## 3. sitemap 与 robots

- **`app/sitemap.ts`**：生成 sitemap，**含各页的 hreflang alternates**（和 canonical 一致）。
- **`app/robots.ts`**：允许抓 `/`，**屏蔽 `/api/`、`/admin/`、`/_next/`**，声明 sitemap 地址：
```ts
export default function robots() {
  return { rules: [{ userAgent:'*', allow:'/', disallow:['/api/','/admin/','/_next/'] }],
           sitemap: `${siteConfig.url}/sitemap.xml` };
}
```

## 4. 结构化数据（Schema / JSON-LD）

详情/文章页注入 JSON-LD（`lib/seo/schema.ts` 的 `articleSchema`/`breadcrumbSchema`），帮搜索引擎理解内容类型、出富摘要。用 `<JsonLd>` 组件在页面里输出 `<script type="application/ld+json">`。

## 5. SEO 要靠 SSR 输出，不能靠 CSR

SEO 站**首屏 HTML 必须带 title/description/正文**（SSR/SSG），爬虫才抓得到。所以内容页都是服务端渲染（详见渲染篇），**别用纯客户端渲染**——否则爬虫可能抓到空壳。

## 6. 对照 Nuxt

| | Nuxt 3 | Next 16 |
|---|---|---|
| 页面 meta | `useSeoMeta()` / `useHead()` | `generateMetadata()` |
| canonical/hreflang | 手动拼 `useHead` 的 link | `alternates.canonical` + `alternates.languages` |
| sitemap | `@nuxtjs/sitemap` 等 | `app/sitemap.ts` |
| robots | 模块/静态文件 | `app/robots.ts` |
| JSON-LD | `useHead` script | `<JsonLd>` 组件 |

## 7. 小结

- 页面用 **`generateMetadata`**（可先取数）+ 统一的 **`buildMetadata`** 工具产出 SEO。
- 死守红线：**canonical 自指、hreflang 双向 + x-default、sitemap 带 alternates、robots 屏蔽 /api /admin、内容靠 SSR 输出**。
- Nuxt 的 `useSeoMeta` 思路能平移，Next 这边工具化 + 类型化更统一。

下一篇：**播放器（hls.js）与媒体**。
