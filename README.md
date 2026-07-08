# woody 的博客

woody 的技术学习笔记与实战记录，基于 [VitePress](https://vitepress.dev/) 构建。

## 🌐 在线访问

- **博客地址**：https://pingw9606.github.io/blog/

## 📚 内容板块

- **前端文章**：React / Next.js 面试与实战、TypeScript、SEO、手写题、TikTok 小程序、AI 工程化等
- **Agent 全栈教程**：从 Agent 开发基础到高级 RAG、可观测的完整课程
- **后端 & 运维笔记**：服务器加固、Linux 运维、CICD、数据库、JVM 调优等
- **全栈重构实战**：Java + React 从 0 交付并上线一个真项目

## 🛠️ 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 本地预览（热更新）
npm run build      # 构建静态站点到 docs/.vitepress/dist
npm run preview    # 预览构建产物
```

## 🚀 部署

- **GitHub Pages（自动）**：push 到 `main` 分支，由 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并部署。
- **Gitee Pages（手动）**：运行 `./deploy.sh`，将构建产物推送到 Gitee 仓库的 `gh-pages` 分支。
