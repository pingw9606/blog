---
---
# Next 新站篇③：Server / Client 组件与状态

> App Router 最需要"换脑子"的一点：**组件默认在服务端跑（RSC），要交互才用 `"use client"`**。本篇讲这条边界怎么划、状态怎么管（不再靠 Pinia）、以及一个实用的"服务端读数据 → 客户端 useEffect 用"模式。对照 Nuxt 的 `<ClientOnly>` / `process.client` / Pinia。

---

## 0. 两种组件

- **Server Component（默认）**：在**服务端**渲染，代码不进浏览器包。能直接 `await` 取数、读服务端资源；**不能**用 `useState/useEffect`、不能用 `window` 等浏览器 API。
- **Client Component**：文件顶部加 **`"use client"`**。能用 hooks、事件、浏览器 API；会打进浏览器包、参与 hydration。

**划分原则**：能放服务端就放服务端（取数、SEO、纯展示）；**只有需要交互/浏览器能力的才 `"use client"`**。

## 1. 本项目的实际划分

**服务端组件**（默认，不加指令）：
- 所有 `page.tsx`、`layout.tsx`（取数、组装、SEO）；
- `DramaCard`（纯展示卡片，取数在父级做好传进来）；
- `ApiDebugBeacon`（读服务端收集的调试日志）。

**客户端组件**（`"use client"`）：
- `LocaleSwitcher`（语言下拉，要交互）；
- `DramasClient`（剧场翻页/筛选，有本地状态 + 客户端 fetch）；
- `BannerCarousel` / `HlsPlayer` / `EpisodePlayerClient`（轮播、播放器，要 DOM/事件）；
- `Analytics` / `TrackLink` / `ApiDebugFetchPatch`（埋点、`window` 相关）。

## 2. 两条边界铁律

1. **服务端组件里不能用 hooks / 浏览器 API**（`useState`、`useEffect`、`window`）——要用就抽成 `"use client"` 子组件。
2. **客户端组件不能运行时 `import` server-only 模块**（加解密、密钥、`lib/api` 服务端实现）——只能 `import type`，否则会把服务端代码/密钥打进浏览器包。

## 3. 状态：不再是 Pinia，而是"服务端取数下传 + 局部 useState"

Nuxt 习惯把数据放 Pinia 全局共享。Next 里**优先在服务端取好数据，作为 props 传给客户端组件**；只有真正的客户端交互状态才用 `useState`：
```tsx
// 页面(服务端)取好首屏数据，传给客户端组件
<DramasClient initialData={initialData} genres={genres} initialPage={page} />
```
```tsx
// DramasClient("use client")：只管交互态
const [data, setData] = useState(initialData);   // 首屏用服务端给的，翻页再客户端 fetch
const [loading, setLoading] = useState(false);
```
**没有全局 store**——共享靠"服务端取好下传"，客户端只留必要的局部/交互状态（要跨组件共享才上 Context）。

## 4. 一个实用模式：服务端读数据 → 客户端 useEffect 消费

有时数据必须在服务端拿（如请求级收集的调试日志），但要在浏览器里执行（如 `console.info`）。做法：**服务端组件读数据 → 传给一个客户端子组件用 `useEffect` 消费**：
```tsx
// ApiDebugBeacon（服务端）：读服务端收集的调用日志
export function ApiDebugBeacon() {
  const calls = getApiCallLog();          // 服务端数据
  if (!calls.length) return null;
  return <ApiDebugConsole calls={calls} />; // 传给客户端组件
}
```
```tsx
// ApiDebugConsole（"use client"）：在浏览器打印
export function ApiDebugConsole({ calls }) {
  useEffect(() => { calls.forEach(c => console.info('[api]', c)); }, [sig]);
  return null;
}
```
> 为什么不用内联 `<script>`：内联脚本在 App Router 客户端导航时不会重新执行；用客户端组件的 `useEffect` 才能在每次导航后执行。

## 5. 对照 Nuxt

| | Nuxt 3 | Next 16 |
|---|---|---|
| 组件默认 | 两端都可能跑 | **默认仅服务端（RSC）** |
| 只在客户端 | `<ClientOnly>` / `process.client` | **`"use client"` 指令** |
| 交互状态 | `ref` / `reactive` | `useState` |
| 全局状态 | Pinia | **优先服务端取数下传**；必要才 Context |
| 生命周期 | `onMounted` | `useEffect(()=>{},[])` |

## 6. 小结

- **默认服务端，交互才 `"use client"`**；服务端组件不碰 hooks/浏览器 API，客户端组件不碰 server-only。
- **状态别照搬 Pinia**：服务端取好数据传 props，客户端只留局部/交互态。
- 需要"服务端数据 + 浏览器执行"时，用**服务端组件传 props → 客户端 useEffect**的模式。

下一篇：**next-intl 国际化**。
