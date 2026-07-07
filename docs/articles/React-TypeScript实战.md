---
---
# React + TypeScript 实战 —— 从 Props 到类型体操

> 配合 `React面试学习-对比Vue.md` 一起看：那篇讲 React 本身，这篇专攻「怎么把 React 写成类型安全的 TypeScript」。内容参考社区圣经 [typescript-cheatsheets/react](https://github.com/typescript-cheatsheets/react)（~45k star）与 [type-challenges](https://github.com/type-challenges/type-challenges)（~44k star），并按面试深水区重新组织。

---

## 0. 为什么 React 要上 TypeScript（面试开场）

| 痛点（纯 JS） | TS 的解法 |
|--------------|----------|
| props 传错名字/类型，运行时才炸 | 编译期报错，IDE 直接标红 |
| 后端接口字段改了，前端不知道 | 定义 `interface`，字段对不上立刻报错 |
| 重构改函数签名，漏改调用点 | 全项目类型检查，漏改就编译不过 |
| hooks 返回值类型靠猜 | 泛型推导，`useState`/`useRef` 自动带类型 |

> 一句话：**TS 把「运行时错误」提前成「编译时错误」**，React 组件树越大，收益越明显。

---

## 1. 组件与 Props 类型（最高频）

### 函数组件的两种写法

```tsx
// 写法 A：直接标注 props（推荐 ✅）
interface ButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;          // ? = 可选
}

function Button({ text, onClick, disabled = false }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{text}</button>;
}

// 写法 B：React.FC（社区已不推荐，了解即可）
const Button: React.FC<ButtonProps> = ({ text }) => <button>{text}</button>;
```

> **面试点：为什么不推荐 `React.FC`？**
> 1. 早期它隐式带上 `children`，容易让不该有 children 的组件也能塞 children；
> 2. 泛型组件用 `React.FC` 写起来别扭；
> 3. 官方 cheatsheet 现在默认推荐「直接标注 props 参数」。

### interface vs type 怎么选

| | `interface` | `type` |
|---|-----------|--------|
| 对象/props 形状 | ✅ 首选（可 `extends`、可声明合并） | 也行 |
| 联合类型 `A \| B` | ❌ 不行 | ✅ 只能用 type |
| 工具类型组合 | 一般 | ✅ 强 |

经验法则：**props 用 `interface`，联合/工具类型用 `type`**。

### children 的正确类型

```tsx
interface CardProps {
  children: React.ReactNode;   // ✅ 万能，接受 JSX/字符串/数组/null
}
```
> 别用 `JSX.Element`（不接受字符串/数组）、别用 `any`。`React.ReactNode` 是标准答案。

---

## 2. Hooks 的类型（面试重灾区）

### useState

```tsx
const [count, setCount] = useState(0);          // 自动推导为 number
const [user, setUser] = useState<User | null>(null);  // 初始 null，必须显式泛型
const [list, setList] = useState<Item[]>([]);   // 空数组要标注元素类型，否则是 never[]
```
> **陷阱**：`useState(null)` 不给泛型 → 类型被推成 `null`，之后 setUser(realUser) 报错。凡是初值为 `null`/空数组，都要手动写泛型。

### useRef 的三种场景（高频对比题）

```tsx
// 1. 存 DOM 节点：初值 null + 只读 ref
const inputRef = useRef<HTMLInputElement>(null);
// inputRef.current 类型是 HTMLInputElement | null

// 2. 存可变值（类似实例变量）：会写入，用非 null 初值
const timer = useRef<number>(0);
timer.current = window.setTimeout(...);   // 可直接改，不报错

// 3. 存 DOM 但你确定不为 null（少用）
const ref = useRef<HTMLDivElement>(null!);  // null! 断言，慎用
```
> 区别核心：**给 DOM 用 `useRef<T>(null)`（React 视为只读，可挂到 `ref=`）**；**存可变值用非 null 初值**。

### useReducer（带 discriminated union，展示 TS 功底）

```tsx
type State = { count: number };
type Action =
  | { type: 'increment'; step: number }
  | { type: 'reset' };                    // 可辨识联合

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment':
      return { count: state.count + action.step };  // 此分支才有 step
    case 'reset':
      return { count: 0 };
    default:
      return state;
  }
}
const [state, dispatch] = useReducer(reducer, { count: 0 });
```
> **面试亮点**：可辨识联合（discriminated union）让 TS 在每个 `case` 分支里**收窄**出对应字段。`increment` 分支能访问 `step`，`reset` 分支访问会报错——这是 TS 类型收窄最经典的应用。

### 自定义 Hook：用 as const 固定元组

```tsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = () => setOn(o => !o);
  return [on, toggle] as const;   // ✅ 推成 [boolean, () => void] 元组
}                                 // 不加 as const 会推成 (boolean | (()=>void))[]

const [open, toggleOpen] = useToggle();  // 解构出来类型精确
```

---

## 3. 事件类型（写表单必踩）

```tsx
// 输入框 onChange
const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
};

// 表单提交
const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
};

// 点击
const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {};

// 键盘
const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') submit();
};
```

> **速记表**（面试可能让你默写）：

| 场景 | 事件类型 |
|------|---------|
| input/textarea 变化 | `React.ChangeEvent<HTMLInputElement>` |
| 表单提交 | `React.FormEvent<HTMLFormElement>` |
| 点击 | `React.MouseEvent<HTMLButtonElement>` |
| 键盘 | `React.KeyboardEvent<...>` |
| 失焦 | `React.FocusEvent<...>` |

> 小技巧：直接把处理函数写在 JSX 里（`onChange={e => ...}`），TS 会**自动推导** e 的类型，不用手写——手写类型只在把函数抽离出去时才需要。

---

## 4. 泛型组件（进阶，能讲清就是加分项）

写一个类型安全的通用列表，`item` 的类型随传入数据自动推导：

```tsx
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map(item => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// 使用：T 被推导为 User，renderItem 的 u 自动是 User
<List
  items={users}
  keyExtractor={u => u.id}
  renderItem={u => <span>{u.name}</span>}
/>
```
> **面试点**：泛型组件让「容器组件」既通用又类型安全。传 `User[]` 进去，`renderItem` 的回调参数就自动收窄为 `User`，改错字段立刻报错。

---

## 5. 常用工具类型（TS 内置，必背）

| 工具类型 | 作用 | 例子 |
|---------|------|------|
| `Partial<T>` | 所有字段变可选 | 更新表单：`Partial<User>` |
| `Required<T>` | 所有字段变必填 | |
| `Pick<T, K>` | 挑几个字段 | `Pick<User, 'id' \| 'name'>` |
| `Omit<T, K>` | 排除几个字段 | `Omit<User, 'password'>` |
| `Record<K, V>` | 构造键值对象 | `Record<string, number>` |
| `Readonly<T>` | 全部只读 | |
| `ReturnType<F>` | 取函数返回值类型 | `ReturnType<typeof useToggle>` |
| `Parameters<F>` | 取函数参数类型元组 | |
| `NonNullable<T>` | 去掉 null/undefined | |

实战组合（后端返回 User，前端表单只编辑部分字段）：
```tsx
interface User { id: number; name: string; email: string; password: string; }

type UserProfile = Omit<User, 'password'>;          // 展示用，去掉密码
type UserUpdate  = Partial<Pick<User, 'name' | 'email'>>;  // 更新用，name/email 可选
```

---

## 6. 接口数据类型（对接后端的关键）

```tsx
// 1. 定义响应结构
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
interface Drama { id: number; title: string; cover: string; }

// 2. 请求时带上泛型，data 自动带类型
async function getDramas(): Promise<Drama[]> {
  const res = await fetch('/api/dramas');
  const json: ApiResponse<Drama[]> = await res.json();
  return json.data;   // json.data 已是 Drama[]
}
```
> **进阶提醒**：`res.json()` 返回的是 `any`，运行时并不保证结构。要真正安全，用 **zod** 做运行时校验 + 类型推导：
> ```tsx
> import { z } from 'zod';
> const DramaSchema = z.object({ id: z.number(), title: z.string(), cover: z.string() });
> type Drama = z.infer<typeof DramaSchema>;   // 类型从 schema 自动推导，单一数据源
> ```
> 这是「类型 + 运行时校验一体化」，大厂前端常见考点。

---

## 7. Context 的类型（避免到处判空）

```tsx
interface AuthContextValue {
  user: User | null;
  login: (u: User) => void;
  logout: () => void;
}

// 用 null 初始 + 自定义 hook 收敛判空
const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return ctx;   // 返回值已收窄为非 null
}
```
> **技巧**：Context 初值给 `null`，再用自定义 hook 统一判空抛错。这样组件里 `useAuth()` 拿到的永远是非空值，不用每次 `?.`。

---

## 8. 类型体操入门（type-challenges 精选）

面试偶尔会考「手写工具类型」，展示 TS 深度。挑三个最典型的：

```ts
// 1. 自己实现 Pick
type MyPick<T, K extends keyof T> = { [P in K]: T[P] };

// 2. 自己实现 Partial
type MyPartial<T> = { [P in keyof T]?: T[P] };

// 3. 条件类型 + infer：取数组元素类型
type ElementOf<T> = T extends (infer U)[] ? U : never;
type A = ElementOf<string[]>;   // string
```
> 关键字：`keyof`（取键联合）、映射类型 `[P in K]`、条件类型 `T extends U ? X : Y`、`infer`（模式提取）。把这四个讲明白，类型体操就入门了。

---

## 9. 扩展原生 HTML 属性（组件库必备）

自己封装 `<Button>`，希望它既有自定义 props，又能透传所有原生 `<button>` 属性（`onClick`、`type`、`aria-*`…）。手写不可能列全，用 `ComponentPropsWithoutRef`：

```tsx
import { ComponentPropsWithoutRef } from 'react';

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'ghost';   // 自定义 props
  loading?: boolean;
}

function Button({ variant = 'primary', loading, children, ...rest }: ButtonProps) {
  return (
    <button className={variant} disabled={loading || rest.disabled} {...rest}>
      {loading ? '加载中…' : children}
    </button>
  );
}

// 使用：原生属性全部有类型提示
<Button variant="ghost" type="submit" onClick={e => {}} aria-label="提交" />
```

> **三个相关工具类型区别（高频）**：
> | 类型 | 含义 |
> |------|------|
> | `ComponentProps<'button'>` | 元素全部 props（含 ref） |
> | `ComponentPropsWithoutRef<'button'>` | 不含 ref（**最常用**，避免 ref 冲突） |
> | `ComponentPropsWithRef<'button'>` | 明确含 ref |
>
> 取「另一个组件」的 props：`ComponentProps<typeof SomeComponent>`。

---

## 10. 多态组件：`as` prop（设计系统核心难点）

一个 `<Text>` 组件，想让调用者决定它渲染成 `<p>`、`<h1>` 还是 `<a>`，且**对应的原生属性类型也跟着变**（渲染成 `a` 时才有 `href`）。这是面试区分度极高的题：

```tsx
import { ElementType, ComponentPropsWithoutRef } from 'react';

type TextProps<T extends ElementType> = {
  as?: T;
  children: React.ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

function Text<T extends ElementType = 'span'>({ as, children, ...rest }: TextProps<T>) {
  const Tag = as || 'span';
  return <Tag {...rest}>{children}</Tag>;
}

// 使用：
<Text>普通文本</Text>                          // 默认 span
<Text as="a" href="/home">链接</Text>          // ✅ 有 href
<Text as="button" onClick={() => {}}>按钮</Text> // ✅ 有 onClick
// <Text as="p" href="/x" />                    // ❌ p 没有 href，报错
```

> **原理**：用泛型 `T extends ElementType` 捕获传入的标签，`ComponentPropsWithoutRef<T>` 动态取出该标签的属性集合。这是几乎所有 UI 库（Chakra、MUI、Radix）实现 `as`/`component` prop 的方式。

---

## 11. 互斥 Props（用可辨识联合约束非法组合）

有些 props 是「二选一」的：要么传 `href`（渲染成链接），要么传 `onClick`（渲染成按钮），不能同时也不能都不传。纯 `interface` 做不到，用**联合类型**：

```tsx
type BaseProps = { children: React.ReactNode };
type LinkProps = BaseProps & { href: string; onClick?: never };
type ButtonProps = BaseProps & { onClick: () => void; href?: never };
type Props = LinkProps | ButtonProps;

function Clickable(props: Props) {
  if ('href' in props) return <a href={props.href}>{props.children}</a>;
  return <button onClick={props.onClick}>{props.children}</button>;
}

<Clickable href="/x">链接</Clickable>        // ✅
<Clickable onClick={() => {}}>按钮</Clickable> // ✅
// <Clickable href="/x" onClick={()=>{}} />   // ❌ 用了 never，报错
```

> **技巧**：`onClick?: never` 表示「这个分支里不允许出现 onClick」。可辨识联合 + `never` 是表达互斥 props 的标准手法。

---

## 12. forwardRef 与 useImperativeHandle 的类型

### forwardRef 泛型标注

```tsx
import { forwardRef } from 'react';

interface InputProps { label: string }

// forwardRef<Ref 的类型, Props 的类型>
const Input = forwardRef<HTMLInputElement, InputProps>(({ label }, ref) => (
  <label>{label}<input ref={ref} /></label>
));

// 使用
const ref = useRef<HTMLInputElement>(null);
<Input ref={ref} label="用户名" />
```
> React 19 起 `ref` 可作为普通 prop，可省去 forwardRef；但面试和存量代码仍高频出现，必须会写。

### useImperativeHandle：暴露自定义方法（≈ Vue defineExpose）

```tsx
interface ModalHandle {
  open: () => void;
  close: () => void;
}

const Modal = forwardRef<ModalHandle>((_props, ref) => {
  const [visible, setVisible] = useState(false);
  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }), []);
  return visible ? <div className="modal">…</div> : null;
});

// 父组件
const modalRef = useRef<ModalHandle>(null);
modalRef.current?.open();   // 类型安全的命令式调用
```

---

## 13. 类型守卫、收窄与 `satisfies`

### 用户自定义类型守卫

```tsx
interface Cat { meow: () => void }
interface Dog { bark: () => void }

// 返回值 `x is Cat` = 类型谓词，收窄类型
function isCat(animal: Cat | Dog): animal is Cat {
  return 'meow' in animal;
}

function handle(animal: Cat | Dog) {
  if (isCat(animal)) animal.meow();   // 这里 animal 已收窄为 Cat
  else animal.bark();
}
```

### `satisfies` 运算符（TS 4.9，现代必会）

```tsx
// 问题：想要类型检查，又想保留字面量的精确推导
const config = {
  endpoint: '/api',
  method: 'GET',
} satisfies { endpoint: string; method: 'GET' | 'POST' };

config.method;   // 类型是 'GET'（精确），不是宽泛的 string
// 若写成 `: {…}` 注解，method 会被拓宽成 'GET' | 'POST'
```
> **一句话**：`satisfies` 让你「校验一个值符合某类型，但不丢失它更窄的推导结果」。面试问「`as` / 类型注解 / `satisfies` 区别」时，这是加分答案。

### `as const` 与联合类型派生

```tsx
const ROLES = ['admin', 'editor', 'viewer'] as const;
type Role = typeof ROLES[number];   // 'admin' | 'editor' | 'viewer'
```
> 用运行时数组派生出联合类型，单一数据源，避免类型和常量两处维护。

---

## 14. 样式的类型化

```tsx
// 1. 内联样式
const style: React.CSSProperties = { color: 'red', marginTop: 8 };

// 2. CSS Modules（配 typed-css-modules 或 vite 插件生成 .d.ts）
import styles from './Card.module.css';   // styles.title 有类型

// 3. styled-components / emotion：给样式组件传 props 类型
import styled from 'styled-components';
const Box = styled.div<{ $active: boolean }>`
  color: ${p => (p.$active ? 'blue' : 'gray')};
`;
<Box $active />   // $active 有类型校验
```

---

## 15. 表单实战：react-hook-form + zod（生产标配）

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('邮箱格式错误'),
  age: z.number().min(18, '需满 18 岁'),
});
type FormData = z.infer<typeof schema>;   // 类型从 schema 推导，单一数据源

function SignupForm() {
  const { register, handleSubmit, formState: { errors } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => console.log(data);   // data 已强类型

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      <input type="number" {...register('age', { valueAsNumber: true })} />
      {errors.age && <span>{errors.age.message}</span>}
    </form>
  );
}
```
> **要点**：`z.infer` 让「校验规则」和「TS 类型」同源，改 schema 类型自动跟着变——这是当前 React 表单的主流范式。

---

## 16. 全局状态的类型化

### Zustand（轻量，TS 体验最好）

```tsx
import { create } from 'zustand';

interface CounterStore {
  count: number;
  inc: () => void;
}
const useCounter = create<CounterStore>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}));

const count = useCounter((s) => s.count);   // 选择器有类型
```

### Redux Toolkit（大型项目）

```tsx
// 定义 RootState / AppDispatch，封装带类型的 hooks
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppDispatch = () => useDispatch<AppDispatch>();
```
> 面试点：RTK 用 `createSlice` 自动推导 action 类型；`ReturnType<typeof store.getState>` 自动派生 RootState，无需手写。

---

## 17. 异步数据请求的类型化（React Query）

```tsx
import { useQuery } from '@tanstack/react-query';

interface Drama { id: number; title: string }

function useDramas() {
  return useQuery<Drama[], Error>({           // <数据类型, 错误类型>
    queryKey: ['dramas'],
    queryFn: async () => {
      const res = await fetch('/api/dramas');
      if (!res.ok) throw new Error('请求失败');
      return res.json() as Promise<Drama[]>;
    },
  });
}

function List() {
  const { data, isLoading, error } = useDramas();
  // data: Drama[] | undefined，isLoading: boolean，error: Error | null —— 全有类型
  if (isLoading) return <Spinner />;
  if (error) return <p>{error.message}</p>;
  return <ul>{data!.map(d => <li key={d.id}>{d.title}</li>)}</ul>;
}
```
> 结合第 6 节的 zod，`queryFn` 里用 `schema.parse(json)` 就能做到「请求 + 运行时校验 + 类型」三合一。

---

## 18. tsconfig 关键配置与常见报错速查

### 推荐的严格配置

```jsonc
{
  "compilerOptions": {
    "strict": true,                    // 一把梭开启所有严格检查
    "noUncheckedIndexedAccess": true,  // arr[i] 类型带 undefined，逼你判空（强烈推荐）
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx",                // 新 JSX transform，不用再 import React
    "moduleResolution": "bundler"
  }
}
```

### 高频报错与解法

| 报错 | 原因 | 解法 |
|------|------|------|
| `Object is possibly 'null'` | ref/context 初值为 null | 可选链 `ref.current?.x` 或先判空 |
| `Type 'string' is not assignable to '"GET"｜"POST"'` | 字面量被拓宽成 string | `as const` 或 `satisfies` |
| `Property 'x' does not exist on type '{}'` | 空对象/未标注 state | 给 `useState` 写泛型 |
| `'X' is declared but never read` | 未用变量 | 前缀 `_` 或删除 |
| `JSX element type ... has no construct/call signatures` | 组件类型不对 | 检查是否误把值当组件 |
| `Cannot find module './x.css'` | 缺声明文件 | 加 `declare module '*.css'` 到 `.d.ts` |

---

## 19. 对照 Vue：TS 支持差异（你熟 Vue，面试可对比）

| 方面 | Vue 3 + TS | React + TS |
|------|-----------|-----------|
| props 类型 | `defineProps<Props>()`（编译宏） | 直接标注参数 |
| 事件 | `defineEmits<{...}>()` | 手动标注 `React.XxxEvent` |
| 模板类型检查 | Volar 插件推导模板 | JSX 本身就是 JS，天然类型友好 |
| 心智负担 | 编译宏 + `<script setup>` 有学习成本 | 「就是 TS 函数」，更直观 |

> 常见结论：**React + TS 的融合更「自然」**，因为 JSX 本质是 JS 表达式，类型推导贯通；Vue 靠编译宏和 Volar 补齐，体验也很好但概念多一层。

---

## 20. 面试速答清单

- **`interface` vs `type`**：props/对象用 interface，联合/工具类型用 type。
- **children 类型**：`React.ReactNode`。
- **useState 初值为 null/空数组**：必须显式写泛型。
- **useRef 挂 DOM**：`useRef<T>(null)`；存可变值：非 null 初值。
- **事件类型**：抽离函数才手写，写在 JSX 内会自动推导。
- **useReducer**：用可辨识联合让分支自动收窄。
- **自定义 hook 返回元组**：加 `as const`。
- **工具类型**：`Partial/Pick/Omit/Record/ReturnType` 要能张口即来。
- **运行时安全**：`res.json()` 是 any，生产项目配 zod 做校验 + 类型推导。
- **扩展原生属性**：`ComponentPropsWithoutRef<'button'>`，取组件 props 用 `ComponentProps<typeof C>`。
- **多态组件**：泛型 `T extends ElementType` + `ComponentPropsWithoutRef<T>` 实现 `as` prop。
- **互斥 props**：可辨识联合 + `xxx?: never`。
- **forwardRef**：`forwardRef<RefType, PropsType>`；命令式方法用 `useImperativeHandle`。
- **类型守卫**：返回 `x is T` 的谓词函数做收窄。
- **`satisfies`**：既校验又保留精确字面量推导（vs 注解会拓宽、vs `as` 不校验）。
- **表单**：react-hook-form + zod，`z.infer` 让校验与类型同源。
- **tsconfig**：`strict` + `noUncheckedIndexedAccess` 是高质量项目标配。

---

## 参考资料（高 star）

> star 数为近似值，会随时间变化。

### React + TypeScript
- [typescript-cheatsheets/react](https://github.com/typescript-cheatsheets/react)（~45k★）—— React+TS 圣经，本文主要蓝本
- [type-challenges/type-challenges](https://github.com/type-challenges/type-challenges)（~44k★）—— 类型体操，从入门到地狱级
- [total-typescript / ts-reset](https://github.com/total-typescript/ts-reset)（~8k★）—— Matt Pocock 的现代 TS 实战技巧
- [React 官方 TS 文档](https://react.dev/learn/typescript) —— 权威入门

### React 深度学习
- [reactjs/react.dev](https://github.com/reactjs/react.dev)（~11k★）—— 官方新文档源码，讲「为什么」最透
- [alan2207/bulletproof-react](https://github.com/alan2207/bulletproof-react)（~30k★）—— 生产级 React 架构最佳实践，全 TypeScript
- [sudheerj/reactjs-interview-questions](https://github.com/sudheerj/reactjs-interview-questions)（~42k★）—— 最全 React 面试题库
- [enaqx/awesome-react](https://github.com/enaqx/awesome-react)（~66k★）—— React 生态总索引
- [harryheman/React-Total](https://github.com/harryheman/React-Total)（~5k★）—— 体系完整的 React 全景笔记
