# 05 · React 前端搭建

把旧的 Nuxt `pages/`（Vue）搬到 React：Vite + TypeScript + React Router + axios。重点是**鉴权态管理**和**统一请求封装**。

## 一、脚手架与依赖

```json
// package.json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

## 二、开发代理：/api 转给后端

Vite 开发服务器把 `/api` 代理到 Spring Boot（8080），省掉本地跨域烦恼：

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
})
```

前端所有请求都写相对路径 `/api/...`，开发走代理、生产走 Nginx 反代，代码不用改。

## 三、类型：和后端 DTO 对齐

```ts
// types.ts
export type Role = 'reader' | 'author' | 'admin'
export interface User { id: number; username: string; email: string; role: Role; status: string }
export interface AuthResponse { token: string; user: User }
export interface Novel {
  id: number; title: string; slug: string; category: string
  serialStatus: 'serializing' | 'completed'; status: 'draft' | 'published'
  author: { id: number; username: string }; publishedChapterCount: number
}
```

## 四、axios 封装：自动带 token + 统一错误

```ts
// api.ts
import axios from 'axios'

const TOKEN_KEY = 'ouyang_token'
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const http = axios.create({ baseURL: '/api' })

// 请求拦截器：自动加 JWT
http.interceptors.request.use((config) => {
  const t = tokenStore.get()
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

// 把后端 { message } 错误体抽出来
export function errMsg(e: unknown, fallback = '请求失败'): string {
  if (axios.isAxiosError(e)) return (e.response?.data as any)?.message || e.message || fallback
  return fallback
}

export const authApi = {
  login: (account: string, password: string) =>
    http.post<AuthResponse>('/auth/login', { account, password }).then(r => r.data),
  me: () => http.get<{ user: User | null }>('/auth/me').then(r => r.data.user),
}
export const novelApi = {
  list: (category?: string, sort?: string) =>
    http.get<{ novels: Novel[] }>('/novels', { params: { category, sort } }).then(r => r.data.novels),
  detail: (idOrSlug: string) => http.get(`/novels/${idOrSlug}`).then(r => r.data),
}
```

> 对照旧 Nuxt：`useFetch/$fetch` → `axios` 实例；旧的会话 Cookie 浏览器自动带 → 现在拦截器手动加 `Bearer`。

## 五、鉴权态：Context 替代 Nuxt 的 useAuth

```tsx
// auth.tsx
const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!tokenStore.get()) return setUser(null)
    try { setUser(await authApi.me()) } catch { setUser(null) }
  }
  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const login = async (account: string, password: string) => {
    const res = await authApi.login(account, password)
    tokenStore.set(res.token)
    setUser(res.user)
  }
  const logout = () => { tokenStore.clear(); setUser(null) }

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>
}
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内')
  return ctx
}
```

## 六、路由与登录守卫

React Router v6 集中式路由（对应 Nuxt 的文件路由 + middleware）：

```tsx
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div>加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/novel/:idOrSlug" element={<NovelDetail />} />
      <Route path="/chapter/:id" element={<ChapterRead />} />
      <Route path="/login" element={<Login />} />
      <Route path="/author" element={<RequireAuth><AuthorDashboard /></RequireAuth>} />
      <Route path="/admin/applications" element={<RequireAuth><AdminApplications /></RequireAuth>} />
    </Routes>
  )
}
```

页面组织对应旧 `pages/`：`Home`（书架）、`NovelDetail`（详情+目录）、`ChapterRead`（阅读+评论+进度）、`Login/Register/Account`、`AuthorDashboard`（创作台）、`AdminApplications`（审批）。

## 七、跑起来 & 构建

```bash
# 后端先起（另一个终端）：cd ../ouyang-server && mvn spring-boot:run
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc 类型检查 + 打包到 dist/
```

> `build` 里先跑 `tsc --noEmit` 做类型检查——类型不过就不打包，能在本地提前抓错。

下一篇把前后端都装进容器：[06 · Docker 与本地全栈联调](./06-Docker与本地全栈联调.md)。
