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

## 21. 深水区：Fiber / 并发 / 性能（资深进阶）

> 前面 10/11/12 节是关键词速记，这一章讲原理，面试到 P6/P7 或架构岗会往这里挖。

### 21.1 Fiber 架构：到底是什么

**Fiber 是一个 JS 对象**，对应一个组件（或 DOM 节点）的工作单元。每个 fiber 节点大致长这样：

```text
FiberNode {
  type,              // 组件函数 / DOM 标签
  key,
  stateNode,         // 对应的真实 DOM 或组件实例
  child, sibling, return,   // 树的三个指针：第一个子、下一个兄弟、父
  pendingProps, memoizedProps,
  memoizedState,     // hooks 链表就挂在这里
  flags,             // 副作用标记（Placement/Update/Deletion）
  lanes,             // 优先级（车道模型）
  alternate,         // 指向另一棵树里对应的 fiber（双缓冲）
}
```

> **关键点 1：为什么用链表而不是递归？**
> React 15 的 Stack Reconciler 用**递归**遍历组件树，一旦开始就无法中断——大树渲染会长时间占用主线程，导致输入/动画卡顿。Fiber 把树改成**链表结构**（child/sibling/return 指针），用**循环 + 指针**遍历，可以在任意 fiber 处**暂停、保存进度、下次继续**。这就是「可中断」的基础。

> **关键点 2：双缓冲（Double Buffering）**
> 内存里同时存在两棵 fiber 树：
> - **current 树**：当前屏幕上显示的；
> - **workInProgress 树**：正在后台构建的新树。
>
> 两棵树的节点通过 `alternate` 互相指向。新树构建完成后，React 只需**切换根指针**（`current = workInProgress`），一次性替换——类似显卡的双缓冲，避免看到中间态。

### 21.2 两大阶段：Render 与 Commit

React 更新分两个阶段，**这是理解并发的核心**：

| 阶段 | 做什么 | 能否中断 | 有无副作用 |
|------|-------|---------|-----------|
| **Render（协调）** | 构建 workInProgress 树、diff、打 flags 标记 | ✅ 可中断/可丢弃/可重来 | 纯计算，无 DOM 操作 |
| **Commit（提交）** | 根据 flags 把变更一次性刷到真实 DOM | ❌ 同步、不可中断 | 操作 DOM、执行 effect |

> **面试杀手锏**：
> - 「为什么 Render 阶段的代码要保持纯函数、不能有副作用？」→ 因为 Render 阶段**可能被中断、丢弃、重复执行**。如果你在组件函数体里直接改外部变量/发请求，中断重跑时就会执行多次，产生 bug。副作用必须放进 `useEffect`（在 commit 后跑）。
> - StrictMode 开发环境 double render 就是**故意重复 Render 阶段**，帮你揪出不纯的渲染逻辑。

### 21.3 Lane 车道模型（优先级调度）

React 18 用 **31 位的二进制 lanes** 表示优先级，位越靠右优先级越高：

```text
SyncLane           (最高，离散事件如 click)
InputContinuousLane (连续事件如 drag/scroll)
DefaultLane        (普通更新、网络请求回调)
TransitionLanes    (startTransition 标记的，低优先级)
IdleLane           (最低)
```

- 每次更新会被分配一条 lane；调度器按优先级决定先处理谁。
- **高优先级可打断低优先级**：正在跑一个 transition 渲染，此时用户输入（SyncLane）进来，React 会**暂停 transition，先处理输入**，之后再回来重跑 transition。
- 用位运算合并/判断多条 lane，极快。

> 对照 Vue：Vue 的调度是基于微任务队列的 flush，没有 React 这套细粒度优先级车道。React 的复杂度换来了「大渲染不阻塞高优交互」的能力。

### 21.4 时间切片（Time Slicing）怎么实现

```text
每处理完一个（或一批）fiber 单元后：
  if (需要让出主线程) {   // shouldYield()：看这一帧还有没有时间
     保存进度，通过调度器安排下次继续
     让浏览器去处理输入/绘制
  }
```

- React 有自己的 **Scheduler** 包，基于 `MessageChannel`（不是 `requestIdleCallback`，因为后者兼容性和触发频率不稳）实现宏任务级的让出。
- 每个时间片约 **5ms**，跑完就 `shouldYield()` 检查是否让出，保证每帧（~16ms）能留出时间给浏览器绘制和响应输入，页面不卡。

### 21.5 并发特性的底层：为什么 useTransition/useDeferredValue 有用

```tsx
// useTransition：把「切 tab」标记为低优先级，不阻塞输入
const [isPending, startTransition] = useTransition();
startTransition(() => setTab(next));   // 这次更新走 TransitionLane

// useDeferredValue：延迟派生值，输入框实时、列表用「滞后」的值渲染
const deferredQuery = useDeferredValue(query);
const list = useMemo(() => filterHugeList(deferredQuery), [deferredQuery]);
```

- 二者本质都是把某些更新**降级到 TransitionLane**，让 SyncLane 的输入优先响应。
- `isPending` 让你能显示「加载中」态，而旧内容仍停留（不会白屏）——这就是 **Concurrent 的"可中断+保留旧 UI"**。

> **面试对比题**：`useTransition` vs `useDeferredValue`？
> - `useTransition` 包裹**你主动触发的 setState**（有 isPending 态）；
> - `useDeferredValue` 包裹**一个你无法控制来源的值**（比如父组件传下来的 prop），产出一个滞后版本。
> - 都用于「区分紧急/非紧急」，选择取决于你能不能拿到那个 setState。

### 21.6 Suspense 的机制

```tsx
<Suspense fallback={<Skeleton/>}>
  <AsyncComp />    {/* 内部读取还没 ready 的资源时，会 throw 一个 Promise */}
</Suspense>
```

- 原理：组件在 Render 阶段读取未就绪的数据时**抛出一个 Promise**，最近的 Suspense 边界捕获它、显示 fallback；Promise resolve 后重新渲染。
- 配合 `use()`（React 19）可以在渲染中直接读 Promise。
- Next.js 的 `loading.tsx`、RSC 流式渲染都建立在 Suspense 上。

### 21.7 撕裂（Tearing）与 useSyncExternalStore

> 并发渲染带来一个新问题，**外部状态库（Redux/Zustand）作者必考**：

- **撕裂**：并发模式下一次渲染可能被中断、分多次进行。如果期间**外部 store 的值变了**，就可能出现「同一次渲染里，不同组件读到了 store 的不同版本」，UI 不一致——这就是 tearing。
- **解法**：React 18 提供 `useSyncExternalStore`，强制订阅外部 store 的读取是**同步一致**的，避免撕裂。所有主流状态库现在内部都用它对接 React。

```tsx
const state = useSyncExternalStore(
  store.subscribe,      // 订阅
  store.getSnapshot,    // 读快照（保证一致）
  store.getServerSnapshot  // SSR 快照
);
```

### 21.8 性能优化：从「会用」到「懂原理」

**① 定位问题再优化（不要盲目 memo）**
- 用 **React DevTools Profiler** 录制，看每个组件的渲染耗时和「为什么渲染」（Why did this render）。
- 关注 **wasted render**（props 没变却重渲染的组件）。

**② memo 的浅比较边界**
```tsx
const Child = React.memo(function Child({ data, onClick }) { ... });
// 失效场景：父组件每次渲染都传新引用
<Child data={{ x: 1 }} onClick={() => {}} />   // ❌ 每次都是新对象/新函数 → memo 失效
```
解法：`useMemo` 稳定 data、`useCallback` 稳定 onClick。或自定义比较函数 `React.memo(Child, (prev, next) => ...)`。

**③ 状态下沉 & 内容提升**
- **状态下沉**：把频繁变化的 state 移到尽量小的叶子组件，缩小重渲染范围。
- **内容提升（children as props）**：把不依赖该 state 的部分作为 `children` 传入，父 state 变化时 children 不会重渲染：
  ```tsx
  function Parent({ children }) {
    const [n, setN] = useState(0);
    return <div onClick={() => setN(n+1)}>{n}{children}</div>;
  }
  // children 在更上层创建，Parent 的 n 变化不会重渲染 children
  ```

**④ 虚拟列表**：长列表只渲染可视区（react-window / react-virtuoso），把 DOM 节点数从上万降到几十。

**⑤ 代码分割**：`React.lazy` + `Suspense` 或路由级 dynamic import，减小首屏包体。

**⑥ React Compiler（React 19，前沿加分）**
- 官方编译器（原 React Forget）能在**构建期自动插入 memo**，自动缓存组件和值，理论上让开发者**不再手写 useMemo/useCallback**。
- 原理：编译期分析依赖，生成等价的记忆化代码。
- 现状：已随 React 19 逐步推广。面试提一句「未来手动 memo 会被编译器接管」很加分。

### 21.9 深水区速答清单

- **Fiber 是什么**：可中断的工作单元（JS 对象+链表），支持双缓冲和优先级调度。
- **两阶段**：Render 可中断纯计算 / Commit 同步刷 DOM。副作用只能在 commit 后（useEffect）。
- **为什么可中断**：链表遍历 + Scheduler 时间切片（~5ms 让出，基于 MessageChannel）。
- **Lane 模型**：31 位优先级，高优打断低优。
- **transition/deferredValue**：把更新降级到 TransitionLane，保交互优先。
- **Suspense**：读未就绪资源时 throw Promise，边界显示 fallback。
- **Tearing**：并发下外部 store 不一致，用 `useSyncExternalStore` 解决。
- **优化顺序**：先 Profiler 定位 → 稳定引用（memo/useMemo/useCallback）→ 状态下沉/内容提升 → 虚拟列表/代码分割 → 未来交给 React Compiler。

### 21.10 参考资料（深入原理）

- [React 官方：Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) —— 重渲染与 state 保留
- [acdlite/react-fiber-architecture](https://github.com/acdlite/react-fiber-architecture) —— Fiber 作者的架构说明
- [jser.dev React 源码解析系列](https://jser.dev/) —— 深入 Fiber/Lane/调度源码
- [React 官方：useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) —— 撕裂与外部 store
- [React Compiler 文档](https://react.dev/learn/react-compiler) —— 自动记忆化

---

## 学习建议
1. 先吃透 **2/3 节（useState、useEffect）**——90% 的 React 面试和 bug 都在这。
2. 再 **10 节（重渲染&优化）+ 4 节（memo 系列）**——资深岗分水岭。
3. **11/12 节（原理&并发）** 背关键词能讲清即可；冲高级/架构岗再深挖 **21 节（Fiber/并发/性能深水区）**。
4. 最后过 **19 节 Q&A + 20 节升华回答**。

> 对着本项目读：`components/search/SearchBox.tsx`（useState/useEffect/useRef/防抖/竞态/受控）、`components/drama/DramasClient.tsx`（useState/useEffect/useCallback/缓存 ref）、`components/home/BannerCarousel.tsx`（定时器 ref/自动播放/键盘事件）、`lib/track/exposure` 的 `useExposure`（自定义 hook）。
