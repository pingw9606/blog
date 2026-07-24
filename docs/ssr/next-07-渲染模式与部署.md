---
---
# Next 新站篇⑦：渲染模式与部署

> 收尾篇：新站怎么在 SSG/ISR/SSR 之间选、`force-dynamic` 什么时候用、build 为什么不能强依赖后端、以及跑在 K8s pod 里的一些真实坑。对照 Nuxt 的 Nitro / routeRules / prerender。

---

## 0. 三种渲染怎么选（详见渲染模式篇）

- **静态内容**（条款等）→ SSG（构建时生成）；
- **会变但容忍短暂旧**（列表/详情）→ ISR；
- **要读请求头/实时** → SSR（`force-dynamic`）；
- 纯交互局部 → 客户端组件 fetch。

详细见《[SSR/CSR/SSG/ISR 渲染模式](../backend/SSR-CSR-SSG-ISR渲染模式-前端视角)》，这里讲本项目实际。

## 1. `force-dynamic`：读 host 的页面

详情页要读请求头 host（按访问域名路由后端），读 host 是"动态"操作，和静态化冲突——曾因 ISR 撞读 host 导致**生产 500**，改成 `force-dynamic`（每次请求实时渲染）修复。
```tsx
// 需要 per-request 信息的页面
export const dynamic = 'force-dynamic';
```

## 2. build 不能强依赖后端（踩过的大坑）

SSG/预渲染在 **build 时**跑。如果被预渲染的页面（或其 layout）**在 build 时调后端**，而 build 环境（CI）调后端被网关 **403** / 后端 503 → **整个构建失败**。
- 我们踩过：根 layout 调 `getLanguages()`（语言列表）→ build 时被 403 → 全站预渲染挂。
- **修法不是加假数据**：语言列表这种**配置类**数据，失败时**回退到前端本地常量**（`routing.locales`）；**业务页**改动态渲染（运行时在 pod 内取）。让 **build 不强依赖后端可用**。
- 验证：用不可达后端地址 build，157 页仍能全部生成 = build 不依赖后端了。

## 3. 构建命令：必须 `--webpack`

本仓库目录含中文（`九州`），Turbopack 会 panic，所以 `dev`/`build` 脚本固定带 `--webpack`：
```jsonc
"build": "next build --webpack"   // 中文路径不能用默认 Turbopack
```

## 4. 跑在 K8s pod 里

- 服务打成容器，跑在 **pod**（多副本），对外经网关；
- **C 端 SSR 取数走集群内网 Service**（`xxx-seo-api:8080`），绕开公网网关白名单 403（详见《[Kubernetes与Pod](../backend/Kubernetes与Pod-前端视角)》）；
- 多 pod → 灰度/滚动更新时注意"部署对象和流量落到的 pod 是否一致"（见《[灰度发布](../backend/灰度发布-前端视角)》）。

## 5. 缓存头：发版后别拿旧 HTML

`next.config` 里区分缓存策略（配合前置 CDN/Nginx）：
- `/_next/static/:path*`（带 hash 的资源）→ `public, max-age=31536000, immutable`（长期强缓存，内容变文件名变）；
- HTML 文档 → `no-cache`（每次向服务器校验，保证发版后拿到最新页面）。

## 6. 对照 Nuxt

| | Nuxt 3 | Next 16 |
|---|---|---|
| 服务端运行时 | Nitro | Node（跑 pod） |
| 渲染控制 | `routeRules` / `prerender` | `dynamic` / `revalidate` |
| 静态/增量 | prerender / SWR | SSG / ISR |
| 实时/读请求 | 默认 SSR | `force-dynamic` |
| 构建 | `nuxi build` | `next build`（本项目 `--webpack`） |

## 7. 小结

- 按"更新频率 + 是否读请求头"选渲染：**静态 SSG、能容忍旧用 ISR、读 host/实时用 `force-dynamic`**。
- **build 别强依赖后端**：配置类回退本地常量、业务页动态渲染，否则后端一挂构建就失败。
- 本项目特有：**`--webpack`（中文路径）**、**SSR 走内网 Service**、**多 pod 注意灰度**、**HTML no-cache / 静态资源 immutable**。

至此「Next 16 新站篇」完结。接下来是「Nuxt 3 老站篇」，再回看「跨栈对比」会更有体会。
