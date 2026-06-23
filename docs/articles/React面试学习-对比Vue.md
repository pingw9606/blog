---
---
# React 面试学习文档 —— 对照 Vue 3

> 配合 `Nextjs面试学习-对比Nuxt.md` 一起看。本文讲 React 本身的面试点，对照你熟悉的 Vue 3（Composition API），并尽量用本项目（`vibeshort-website`）的真实组件举例。

---

## 0. Vue ↔ React 心智映射总表

| 概念 | Vue 3 | React |
|------|-------|-------|
| 响应式状态 | `ref()` / `reactive()` | `useState()` |
| 计算属性 | `computed()` | `useMemo()` |
| 侦听器 | `watch()` / `watchEffect()` | `useEffect()` |
| 模板 | `<template>` 指令（v-if/v-for） | JSX（`&&`、`map`、三元） |
| 生命周期 | `onMounted`/`onUnmounted` | `useEffect(() => {...}, [])` + 返回清理函数 |
| 双向绑定 | `v-model` | 受控组件（value + onChange，手动） |
| 事件 | `@click` | `onClick`（合成事件） |
| 插槽 | `<slot>` | `props.children` |
| 透传 DOM 引用 | `ref` + `template ref` | `useRef` + `ref` |
| 依赖注入 | `provide`/`inject` | `Context` + `useContext` |
| 全局状态 | Pinia | Context / Zustand / Redux |
| 逻辑复用 | composable（`useXxx`） | custom hook（`useXxx`） |
| 性能优化 | 默认细粒度响应式（自动） | `React.memo`/`useMemo`/`useCallback`（手动） |

> **一句话区别**（面试爱问）：Vue 是**编译时 + 运行时的细粒度响应式**——它知道哪个数据变了、精确更新对应 DOM，开发者基本不用手动优化。React 是**「状态变 → 组件函数重新执行 → 生成新 VDOM → diff → 更新 DOM」**，默认会重渲染整棵子树，**性能优化要靠开发者手动 memo**。这是两者最本质的差异。

---

## 1. JSX 与渲染本质

- JSX 是 `React.createElement(...)` 的语法糖，最终生成「React 元素」对象（描述 UI 的普通对象），不是真实 DOM。
- **组件就是一个返回 JSX 的函数**。状态/props 变化 → 函数重新执行 → 返回新元素树 → React diff 后更新真实 DOM。
- 条件/列表用 JS 表达式：
  ```tsx
  {loading ? <Skeleton/> : <List/>}          // 三元 ≈ v-if/v-else
  {count > 0 && <Badge/>}                      // 短路 ≈ v-if
  {items.map(i => <Card key={i.id} data={i}/>)} // map ≈ v-for（key 必填）
  ```

> 对照 Vue：Vue 用模板指令（编译成 render 函数）；React 直接写 JS。Vue 模板更声明式，React 更「就是 JavaScript」。

---

## 2. State：useState（面试核心）

```tsx
const [count, setCount] = useState(0);
setCount(count + 1);             // 直接传值
setCount(c => c + 1);            // 函数式更新（依赖前值时必须这样，避免闭包陷阱）
```

### 必考点
1. **状态不可变**：不能 `state.push()` / `state.x = 1`，必须创建新对象/数组：
   ```tsx
   setList(prev => [...prev, item]);          // ✅
   setObj(prev => ({ ...prev, name: 'x' }));  // ✅
   ```
   > 对照 Vue：Vue 的 `reactive` 可以直接改属性（`obj.x = 1`）因为有 Proxy 追踪；React 没有 Proxy，靠**引用变化**判断更新，所以必须换新引用。

2. **setState 是异步 + 批处理（batching）**：一次事件里多次 `setState` 会合并成一次重渲染。
   ```tsx
   setCount(count + 1);
   setCount(count + 1);   // count 还是旧值，结果只 +1（要用函数式 c => c+1 才 +2）
   ```
   React 18 起，连 setTimeout/Promise 里的多次 setState 也自动批处理（automatic batching）。

3. **状态是「快照」**：每次渲染的 state 是那一次渲染的固定值（闭包捕获），不是「实时」的。

---

## 3. useEffect（面试最容易翻车的点）

```tsx
useEffect(() => {
  // 副作用：订阅、请求、操作 DOM、定时器
  return () => { /* 清理：取消订阅、清定时器 */ };
}, [dep1, dep2]);   // 依赖数组
```

### 依赖数组三种形态
| 写法 | 触发时机 | 对应 Vue |
|------|---------|---------|
| `[]` | 仅挂载时一次 | `onMounted` |
| `[a, b]` | a 或 b 变化时 | `watch([a,b])` |
| 不传 | 每次渲染后 | `watchEffect`（近似） |

### 本项目实战例子（SearchBox 防抖搜索，覆盖多个考点）
```tsx
useEffect(() => {
  const kw = query.trim();
  if (!kw) return;
  const ctrl = new AbortController();        // 请求取消
  const timer = setTimeout(async () => {     // 防抖 250ms
    const res = await fetch(`/api/search?q=${kw}`, { signal: ctrl.signal });
    setResults(await res.json());
  }, 250);
  return () => {                             // 清理：query 变化/卸载时取消上一次
    clearTimeout(timer);
    ctrl.abort();
  };
}, [query]);                                 // query 变就重跑
```
这段能讲清：依赖触发、清理函数、防抖、竞态取消（AbortController）——是高质量面试谈资。

### 高频陷阱
1. **闭包陷阱（stale closure）**：effect 里用了状态但没进依赖数组，拿到的是旧值。解决：加进依赖，或用函数式 setState、`useRef`。
2. **无限循环**：effect 里 setState 又把那个 state 当依赖 → 循环。
3. **对象/函数做依赖**：每次渲染都是新引用 → effect 每次都跑。用 `useMemo`/`useCallback` 稳定引用。
4. **请求竞态**：快速切换导致旧请求后返回覆盖新结果 → 用 AbortController 或 ignore 标志（本项目用了 AbortController）。

---

## 4. 其余核心 Hooks

| Hook | 作用 | 对照 Vue |
|------|------|---------|
| `useRef` | 可变引用（不触发渲染）/ 拿 DOM | `template ref` / 普通变量 |
| `useMemo` | 缓存**计算结果** | `computed` |
| `useCallback` | 缓存**函数引用** | （Vue 不太需要，因为没有重渲染问题） |
| `useContext` | 读 Context | `inject` |
| `useReducer` | 复杂状态逻辑（类 Redux） | 无直接对应 |
| `useTransition` | 标记非紧急更新（并发） | 无 |
| `useDeferredValue` | 延迟值（并发） | 无 |
| `useLayoutEffect` | DOM 绘制前同步执行 | `onMounted` 同步场景 |
| `useId` | 生成稳定唯一 id（SSR 安全） | 无 |

### useRef 两个用途（面试常考）
```tsx
// 1. 拿 DOM（本项目 SearchBox 点击外部关闭）
const boxRef = useRef<HTMLDivElement>(null);
<div ref={boxRef}>...</div>

// 2. 存「不触发渲染」的可变值（本项目 BannerCarousel 存定时器/缓存 Map）
const timer = useRef<ReturnType<typeof setInterval> | null>(null);
const cache = useRef<Map<string, Data>>(new Map());
```
> 关键：改 `ref.current` **不会触发重渲染**（对照 `useState` 会触发）。

### useMemo / useCallback —— 什么时候用（面试必问）
- `useMemo(() => 昂贵计算, [deps])`：避免每次渲染都重算。
- `useCallback(fn, [deps])`：保持函数引用稳定，常用于**传给 memo 化子组件的 prop**或**做 effect 依赖**。
- **不要滥用**：简单计算用了反而增加开销。只在「计算昂贵」或「需要稳定引用」时用。
> 对照 Vue：Vue 的细粒度响应式让你几乎不用操心这些；React 因为「父组件重渲染默认会重渲染子组件」，才需要这套手动优化。

---

## 5. Hooks 规则（必背）
1. **只在顶层调用**：不能放在 if / for / 嵌套函数里（保证每次渲染 hook 调用顺序一致）。
2. **只在 React 函数组件 / 自定义 hook 里调用**。
> 为什么？React 靠**调用顺序**而非名字来关联 hook 状态。顺序变了就错乱。这是 ESLint `react-hooks/rules-of-hooks` 强制的。

---

## 6. 受控 vs 非受控组件

```tsx
// 受控：value 由 state 驱动，onChange 更新 state（≈ v-model 但手动）
<input value={query} onChange={e => setQuery(e.target.value)} />

// 非受控：用 ref 读值，React 不管它
<input ref={inputRef} defaultValue="..." />
```
> 对照 Vue：`v-model` 是受控的语法糖（自动 value + input 事件）。React 没有 v-model，受控要手写 value+onChange。本项目 SearchBox 的输入框就是受控组件。

---

## 7. 列表 key（高频）
- `key` 帮 React 在 diff 时识别哪些元素是「同一个」，决定复用/移动/删除。
- **不要用 index 做 key**（列表会增删/排序时会出 bug：状态错位、输入框内容串）。用稳定唯一 id。
  ```tsx
  {dramas.map(d => <DramaCard key={d.id} drama={d} />)}  // ✅ 用 id
  ```
> 对照 Vue：`:key` 完全一样的概念和注意事项。

---

## 8. 合成事件 SyntheticEvent
- React 的事件是**合成事件**（跨浏览器包装），React 17 起绑定在 root 容器上（事件委托）。
- `e.preventDefault()` / `e.stopPropagation()` 正常用。
- 本项目用 `onMouseDown` + `e.preventDefault()` 防止搜索下拉在 blur 前消失（细节技巧）。

---

## 9. Context（跨层传值，对照 provide/inject）
```tsx
const ThemeCtx = createContext(null);
<ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
const theme = useContext(ThemeCtx);
```
- 解决 **props drilling**（逐层透传）。
- **坑**：Provider 的 value 变化会让**所有消费者重渲染**；value 是对象时要 `useMemo` 稳定，否则每次都触发。
> 对照 Vue：`provide/inject`。Vue 的 inject 配合响应式更省心；React Context 要注意重渲染范围。本项目用 `NextIntlClientProvider` 就是 Context 模式下发文案。

---

## 10. 重渲染机制 & 性能优化（资深必考）

### 何时重渲染？
1. 自身 `state` 变化；
2. 父组件重渲染（**默认会带着所有子组件一起重渲染**，无论 props 变没变）；
3. 消费的 Context value 变化。

### 优化手段
- `React.memo(Component)`：props 浅比较没变就跳过重渲染（≈ Vue 默认就有的行为）。
- `useMemo`/`useCallback`：稳定传给 memo 子组件的 props 引用。
- 状态下沉 / 拆分组件：把频繁变化的状态隔离到小组件，避免大范围重渲染。
- 列表用稳定 key。

> **面试金句**：「Vue 靠响应式系统精确追踪依赖、自动最小化更新；React 默认重渲染整棵子树，需要开发者用 memo/useMemo/useCallback 手动剪枝。所以 React 的性能优化更依赖开发者对重渲染机制的理解。」

---

## 11. Virtual DOM / Reconciliation / Fiber（原理题）
- **Virtual DOM**：用 JS 对象描述 UI，状态变化时生成新 VDOM，和旧的 **diff**，只把变化部分更新到真实 DOM（减少昂贵的 DOM 操作）。
- **Reconciliation（协调）**：diff 算法。同层比较；类型不同直接替换；同类型复用并更新 props；列表靠 key 匹配。
- **Fiber（React 16+）**：把渲染拆成可中断的小单元，支持**优先级调度**和**并发**（高优先级更新如输入可打断低优先级渲染）。
> 对照 Vue：Vue 也有 VDOM + diff，但 Vue3 编译期做了优化（静态提升、PatchFlag 标记动态节点），diff 更高效；React 靠 Fiber 做可中断调度。

---

## 12. React 18 并发特性
- **Automatic Batching**：所有场景（含 promise/setTimeout）的 setState 自动批处理。
- **Suspense**：声明式等待异步（配 loading fallback）。Next 的 `loading.tsx` 就基于它。
- **Transitions**：`useTransition` / `startTransition` 标记「非紧急」更新，让紧急更新（如输入）优先：
  ```tsx
  const [isPending, startTransition] = useTransition();
  startTransition(() => setTab(next));  // 切 tab 不卡输入
  ```
  本项目 LocaleSwitcher 切语言用了 `useTransition`。

---

## 13. Error Boundary（错误边界）
- 捕获子树渲染错误，显示降级 UI（类组件 `componentDidCatch` 或 Next 的 `error.tsx`）。
- **不能**捕获事件处理函数里的错误、异步错误、SSR 错误。
> 对照 Vue：`onErrorCaptured` / `errorHandler`。

---

## 14. Refs 进阶
- `forwardRef`：让函数组件能接收并转发 ref 到内部 DOM（React 19 起可直接把 `ref` 当普通 prop，免 forwardRef）。
- `useImperativeHandle`：自定义 ref 暴露的方法（≈ Vue `defineExpose`）。
- `createPortal`：把子节点渲染到 DOM 树其它位置（弹窗/Toast）。

---

## 15. StrictMode（开发模式 double render，面试新人常困惑）
- 开发环境下 `<StrictMode>` 会**故意把组件渲染两次、effect 执行两次**，帮你发现副作用不纯/没清理的问题。
- 生产环境不会。所以「为什么我的 effect 跑了两次」——大概率是 StrictMode。

---

## 16. 函数组件 vs 类组件（生命周期映射）
现在几乎全用函数组件 + hooks。类组件生命周期映射：
| 类组件 | 函数组件 |
|--------|---------|
| `componentDidMount` | `useEffect(fn, [])` |
| `componentDidUpdate` | `useEffect(fn, [deps])` |
| `componentWillUnmount` | `useEffect` 返回的清理函数 |
| `shouldComponentUpdate` | `React.memo` |

---

## 17. React 19 新特性（前沿加分）
- **`use()`**：在渲染中读 Promise / Context（可配 Suspense）。
- **Actions / `useActionState` / `useOptimistic`**：表单提交 + 乐观更新一把梭。
- **`ref` 作为普通 prop**：不再需要 `forwardRef`。
- **`useFormStatus`**：读表单提交态。
- 配合 Next 的 Server Actions 使用。

---

## 18. 自定义 Hook（逻辑复用，对照 composable）
```tsx
// 本项目 useExposure：封装「元素进入视口上报埋点」的逻辑
function useExposure(event, params, { enabled }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { track(event, params); io.disconnect(); }
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
```
> 对照 Vue：和 composable（`useXxx`）一模一样的理念——把有状态逻辑抽成可复用函数。命名都用 `use` 前缀。

---

## 19. 高频面试题速答

**Q1：为什么 setState 后立刻读 state 拿到的是旧值？**
A：state 是本次渲染的快照（闭包捕获），setState 触发的是**下一次**渲染。依赖前值要用函数式 `setX(prev => ...)`。

**Q2：useEffect 和 useLayoutEffect 区别？**
A：useEffect 在浏览器绘制**后**异步执行（不阻塞绘制）；useLayoutEffect 在 DOM 变更后、绘制**前**同步执行（适合读布局/避免闪烁），但会阻塞绘制，慎用。

**Q3：useMemo 和 useCallback 区别？**
A：useMemo 缓存「计算结果（值）」，useCallback 缓存「函数本身」。`useCallback(fn, d)` === `useMemo(() => fn, d)`。

**Q4：React.memo 什么时候失效？**
A：props 里传了每次都变的引用（内联对象/函数/数组）。要配 useMemo/useCallback 稳定引用。

**Q5：key 为什么不能用 index？**
A：增删/排序时 index 会错位，导致 React 复用错元素，出现状态串、输入框内容错乱、动画异常。

**Q6：受控和非受控组件？**
A：受控=value 由 state 驱动（单一数据源、可校验/联动）；非受控=用 ref 读 DOM 值。一般推荐受控。

**Q7：React 怎么做性能优化？**
A：memo 剪枝重渲染、useMemo/useCallback 稳定引用、状态下沉拆分组件、列表稳定 key、虚拟列表、code splitting（dynamic import / lazy + Suspense）。

**Q8：Virtual DOM 为什么快？**
A：批量 diff 后最小化真实 DOM 操作（DOM 操作昂贵），并能跨平台。注意：VDOM 不是「绝对快」，而是「在保持声明式心智的同时把 DOM 操作控制在合理范围」。

**Q9：闭包陷阱怎么解决？**
A：把用到的值加进依赖数组；或用函数式 setState；或用 useRef 存最新值（`ref.current`）。

**Q10：Context 性能问题？**
A：value 变化会让所有消费者重渲染。拆分 Context、useMemo 稳定 value、把不常变和常变的状态分开放。

---

## 20. 和 Vue 对比的「升华」回答（面试官爱听）

> 「Vue 和 React 都是组件化 + VDOM，但响应式模型不同：
> - **Vue**：基于 Proxy 的细粒度响应式 + 模板编译期优化，框架精确知道依赖、自动最小化更新，开发者心智负担低；
> - **React**：基于『状态变 → 重新执行组件函数 → diff』的模型 + Fiber 可中断调度，更接近纯函数式、心智更统一，但需要开发者理解重渲染、手动 memo 优化。
>
> 一个是『框架帮你优化』，一个是『给你完全的控制权也给你责任』。配合 Next.js 的 RSC，React 进一步把『哪些组件根本不需要下发到客户端』也交给开发者决策。」

---

## 学习建议
1. 先吃透 **2/3 节（useState、useEffect）**——90% 的 React 面试和 bug 都在这。
2. 再 **10 节（重渲染&优化）+ 4 节（memo 系列）**——资深岗分水岭。
3. **11/12 节（原理&并发）** 背关键词能讲清即可。
4. 最后过 **19 节 Q&A + 20 节升华回答**。

> 对着本项目读：`components/search/SearchBox.tsx`（useState/useEffect/useRef/防抖/竞态/受控）、`components/drama/DramasClient.tsx`（useState/useEffect/useCallback/缓存 ref）、`components/home/BannerCarousel.tsx`（定时器 ref/自动播放/键盘事件）、`lib/track/exposure` 的 `useExposure`（自定义 hook）。
