---
---
# Next 新站篇②：数据获取与 SSR

> 本篇讲新站怎么取数据——**Server Component 直接 `await`**、数据层怎么组织、并行取数、缓存（`cache()` / `unstable_cache`）、`force-dynamic`，以及**客户端 fetch route handler**。对照 Nuxt 的 `useAsyncData/useFetch/$fetch`。

---

## 0. 核心差异：页面本身就是 async 函数

Nuxt 里取数是在组件里声明式调 `useAsyncData/useFetch`。Next App Router 里——**页面（Server Component）本身是个 `async` 函数，直接 `await` 取数**：
```tsx
// app/[locale]/drama/[slug]/page.tsx
export default async function DramaPage({ params }) {
  const { slug } = await params;
  const id = parseId(slug);
  const drama = await getDramaById(Number(id));   // ← 直接 await，服务端取
  if (!drama) notFound();                         // 取不到 → 404
  const [episodes, related, genres] = await Promise.all([   // 并行取
    getEpisodes(drama.id), getRelated(drama.id), getGenres(),
  ]);
  return <DramaDetail drama={drama} episodes={episodes} .../>;
}
```
这段代码**只在服务端跑**，取数逻辑、密钥都不进浏览器包。

## 1. 数据层：收敛在 `lib/api`（server-only）

所有后端请求收敛在 `lib/api/`，页面不直接 `fetch`。请求走加密 POST（`app-api`，AES 加密、`server-only`，详见《[接口加密与验签](../backend/接口加密与验签-前端视角)》）：
```ts
// lib/api/dramas.ts
export const getDramaById = cache(async (id: number) => {
  return backendOrMock(
    async () => { const r = await apiPost(ENDPOINTS.dramaDetail, { shortPlayId: id }); return r.data ? mapDrama(r.data) : null; },
    async () => mockDrama(id),   // 仅本地离线开发用
  );
});
```
- 端点/加解密契约与老站 1:1（复刻）；
- **客户端组件只能 `import type` 引用 `lib/api`**，禁止运行时引入（否则把 server-only 打进浏览器）。

## 2. 并行取数：`Promise.all`

能并行的请求别串行 `await`。剧场页一次并行取分类/标签/列表：
```tsx
// app/[locale]/dramas/[[...slugs]]/page.tsx
const [genres, labels, initialData] = await Promise.all([
  getGenres(), getLabels(), getDramas({ genre_id, page, page_size: 24 }),
]);
```

## 3. 两层缓存：`cache()`（请求内）+ `unstable_cache`（跨请求）

- **React `cache()`**：同一次请求内多处调同一函数只打一次后端（请求级去重）。
- **`unstable_cache`**：**跨请求**缓存（带 `revalidate`）。分类/标签这种全站相对静态的数据，翻页不该每次都打后端：
```ts
const fetchGenresCached = unstable_cache(
  async (locale, host) => { /* apiPost ... */ },
  ['dramas-genres'], { revalidate: 3600, tags: ['dramas-taxonomy'] }
);
```
> 坑：`unstable_cache` 内不能读 `headers()`/`getLocale()` 等动态 API——要在外层取好 `locale`/`host` 作为参数传进去（也作 cache key 隔离语言/环境）。

## 4. `force-dynamic`：需要每次实时 / 读请求头的页面

详情页要读请求头 host（按域名路由后端），这是"动态"操作，和静态化冲突——所以标 `force-dynamic`，每次请求实时渲染（曾因 ISR 撞读 host 导致生产 500，改 force-dynamic 修复）。详见《[SSR/CSR/SSG/ISR 渲染模式](../backend/SSR-CSR-SSG-ISR渲染模式-前端视角)》。

## 5. 客户端取数：route handler + `fetch`

不是所有取数都在服务端。像**剧场翻页、搜索**这种客户端交互触发的，走 **route handler（`app/api/*/route.ts`）+ 浏览器 `fetch`**：
```tsx
// 客户端组件里
fetch(`/api/dramas?${params}`).then(r => r.json()).then(setData);
```
```ts
// app/api/dramas/route.ts —— 在服务端跑，转调数据层
export async function GET(req) {
  const data = await getDramas({ page, page_size, genre_id });
  return NextResponse.json(data);
}
```
对应 Nuxt 里"客户端 `$fetch` 调接口"。（注意这条链路的 [api] 调试日志/CORS 有它自己的处理，见后端科普系列。）

## 6. 对照 Nuxt

| | Nuxt 3 | Next 16 |
|---|---|---|
| 页面取数 | `useAsyncData`/`useFetch`（声明式） | **页面 `async` 函数直接 `await`** |
| 命令式请求 | `$fetch` | 数据层函数 / route handler + `fetch` |
| 并行 | 多个 `useAsyncData` | `Promise.all` |
| 缓存 | payload/`useAsyncData` key | `cache()` + `unstable_cache` |
| 取数在哪跑 | 服务端+客户端都可能 | RSC **只在服务端**；客户端取数走 route handler |

## 7. 小结

- Next 取数：**页面即 async、直接 await；数据层收敛 lib/api（server-only、加密）**；能并行就 `Promise.all`。
- 缓存分两层：**`cache()` 请求内去重、`unstable_cache` 跨请求**（注意别在里面读动态 API）。
- **读 host/cookie 或要实时 → `force-dynamic`**；**客户端交互取数 → route handler + fetch**。
- 和 Nuxt 的 `useAsyncData/useFetch/$fetch` 能对应，但要牢记"RSC 只在服务端、密钥不进浏览器"。

下一篇：**Server / Client 组件的边界与状态**。
