---
---
# Nuxt 老站篇③：Pinia 状态管理

> 老站用 **Pinia** 管全局状态（筛选、播放、fandom 等）。本篇讲它的两种写法、在 SSR 下的状态注水、以及为什么复刻到 Next 时"不该照搬全局 store"。

---

## 0. 老站有哪些 store

`stores/` 下四个 Pinia store：
- `dramaStore` —— 剧集列表、筛选分类/标签、当前页、当前剧集；
- `filterStore` —— 筛选条件；
- `fandomStore` —— 博客/fandom 状态；
- `player` —— 播放器状态。

## 1. 两种写法：setup store vs options store

Pinia 支持两种，老站两种都用了：

**Setup store**（`dramaStore`，像 `setup()`）：
```ts
export const useDramaStore = defineStore('dramaStore', () => {
  const category = ref('All')          // state
  const currentPage = ref(0)
  const currentDrama = ref<Drama|null>(null)
  const filtered = computed(() => /* ... */)   // getter
  function setCategory(c: string) { category.value = c }  // action
  return { category, currentPage, currentDrama, filtered, setCategory }
})
```

**Options store**（`player`/`filterStore`/`fandomStore`）：
```ts
export const usePlayerStore = defineStore('player', {
  state: () => ({ playing: false, current: null }),
  actions: { play() { this.playing = true } },
})
```

## 2. 怎么用（自动导入）

`@pinia/nuxt` 让 `useXxxStore()` **自动可用**（不用 import），页面/组件里直接拿：
```vue
<script setup>
const drama = useDramaStore()
drama.setCategory('Urban')
</script>
```

## 3. SSR 下的状态注水（hydration）

SSR 时 store 在服务端初始化好，Nuxt 会把状态**序列化进 HTML（payload）**，客户端**注水（hydrate）**时恢复——保证服务端和客户端状态一致，不闪烁。这是 Nuxt + Pinia 的 SSR 集成自动做的。

## 4. 复刻到 Next：别照搬全局 store

这是迁移时**最需要重新设计**的一块（见《[跨栈对比总纲](./跨栈对比-概念映射与复刻方法论)》）：
- Nuxt 习惯把数据/筛选态都塞 Pinia 全局共享；
- Next（App Router）里**优先在 Server Component 取好数据、直接传 props**，只有真正的客户端交互态才用 `useState`；
- 硬把 Pinia 翻译成一个全局 client store 是反模式（数据本可以服务端取好下传，不必进全局状态）。

举例：老站 `dramaStore` 里的"剧集列表 + 当前页"，在新站是**页面 Server Component 取好 `initialData` 传给 `DramasClient`**，翻页交互态才在客户端 `useState`。

## 5. 对照 Next 新站

| | Nuxt 3 老站 | Next 16 新站 |
|---|---|---|
| 全局状态 | Pinia（setup/options store） | **优先服务端取数下传 props**；必要才 Context |
| 交互态 | store 的 ref/state | 客户端组件 `useState` |
| SSR 状态 | Pinia 自动注水(hydration) | 服务端渲染直接带数据，无需注水全局 store |
| 用法 | `useXxxStore()` 自动导入 | 手动 import + props/hook |

## 6. 小结

- 老站用 **Pinia**（setup + options 两种写法）管筛选/播放/列表等全局态，`@pinia/nuxt` 自动导入 + SSR 自动注水。
- 复刻到 Next **别照搬全局 store**：能服务端取好下传就别进全局态，客户端只留交互态。

下一篇：**@nuxtjs/i18n 国际化**。
