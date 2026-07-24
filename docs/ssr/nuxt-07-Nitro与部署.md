---
---
# Nuxt 老站篇⑦：Nitro 与部署

> 收尾篇：老站的服务端引擎 Nitro、缓存 routeRules、静态资源预压缩、构建优化、字体/分析脚本的性能处理。对照 Next 新站的 Node/pod 部署。

---

## 0. Nitro：Nuxt 3 的服务端引擎

Nuxt 3 的 SSR 由 **Nitro** 驱动，构建产物是 `.output/`（一个可独立运行的 Node server，也能出静态/各平台适配）。`server/` 目录下还能写服务端 API（`server/api/*`）和中间件——老站的 `/api/seo/{key}`（SEO 文案接口）就在这。

## 1. 缓存策略：`nitro.routeRules`

发版后最怕"引用了旧版本的 JS/CSS 404"。老站在 `routeRules` 里按路径设缓存头：
```ts
nitro: {
  routeRules: {
    '/images/**': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    '/fonts/**':  { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    '/_nuxt/**':  { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }, // 带 hash 的构建产物
    '/**':        { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },   // HTML 每次校验
  }
}
```
和 Next 新站 `next.config` 的 headers 策略是一个思路：**带 hash 的资源长缓存 immutable、HTML 不缓存**。

## 2. 静态资源预压缩

```ts
nitro: { compressPublicAssets: { brotli: true, gzip: true }, minify: true }
```
构建时生成 `.br` / `.gz`，服务端直接吐压缩版，省带宽、加速首屏。

## 3. 构建优化（Vite / Terser）

```ts
vite: { build: { minify: true, terserOptions: { compress: {
  drop_console: true, drop_debugger: true, pure_funcs: ['console.log','console.info'],
}}}}
```
生产**移除 console/debugger**。（对比：新站靠运行时 host 判断只在非生产打日志，两种思路都行。）

## 4. 首屏性能处理（head 里）

- **字体 preload**：`app.head.link` 预加载 Montserrat 关键字重，减少文字渲染等待；
- **GA / Yandex 延迟加载**：分析脚本用 `setTimeout(…, 3000)` 延迟 3 秒注入，**不抢首屏**（省 ~170KB 首屏）；
- `@nuxt/image` 输出 **WebP** + 响应式尺寸（`format:['webp']` + `screens`）。

> 这些正是《[Web性能指标与Lighthouse](../backend/Web性能指标与Lighthouse-前端视角)》里说的优化手段——老站在字体/脚本/图片上都做了处理。

## 5. 对照 Next 新站

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 服务端引擎 | Nitro（`.output`） | Node（`.next`，跑 pod） |
| 服务端 API | `server/api/*` | `app/api/*/route.ts` |
| 缓存 | `nitro.routeRules` | `next.config` headers |
| 预压缩 | `compressPublicAssets` | 交给 CDN/Nginx（或构建） |
| 去 console | Vite terser `drop_console` | 运行时 host 判断（仅非生产打） |
| 渲染控制 | `routeRules` / SSR | `dynamic`/`revalidate`（SSG/ISR/`force-dynamic`） |

## 6. 小结

- 老站部署 = **Nitro `.output`**（Node server + `server/api`），`routeRules` 管缓存、`compressPublicAssets` 预压缩、Terser 去 console。
- 首屏优化：**字体 preload + 分析脚本延迟 3s + @nuxt/image WebP**。
- 和 Next 新站思路一致（缓存分级、去 console、图片优化），只是 API 与产物形态不同（Nitro `.output` vs Next `.next`/pod）。

至此「Nuxt 3 老站篇」完结。最后回到「跨栈对比」的深入两篇，会更有体会。
