# 全栈重构实战：把 Nuxt 项目改造成 Java + React

> 记录一次真实重构：把「欧阳一族」小说站从 **Nuxt 3 全栈**（Vue + Nitro + Prisma）拆成 **Java 后端 + React 前端**，目的是**用一个熟悉业务的项目来学 Java**。
> 系列偏教程向：贴命令、贴配置，能照着做一遍。

## 为什么这么做

- 已经有一个跑通的 Nuxt 全栈项目，业务熟、需求清楚——**拿它练 Java 比从零想 demo 更高效**。
- 前后端分离是主流工程形态，顺便把 **Spring Boot / JPA / Spring Security / Docker / CI/CD** 一条链路走通。
- 旧项目保留成"业务参照物"，重构时对着搬，不怕跑偏。

## 目标架构

```
      浏览器 (React SPA)
          │  /api  (axios + JWT)
   ┌──────▼───────┐
   │  ouyang-web  │  Vite + React + TS，Nginx 托管 + 反代
   └──────┬───────┘
          │  REST
   ┌──────▼───────┐
   │ ouyang-server│  Spring Boot 3 + JPA + Security(JWT)
   └──────┬───────┘
          │  JDBC
   ┌──────▼───────┐
   │  PostgreSQL  │  （本地开发可用 H2 零配置）
   └──────────────┘
```

## 新旧对照

| 关注点 | 旧（Nuxt 全栈） | 新（重构版） |
|--------|----------------|--------------|
| 架构 | 前后端一体 | 前后端分离 |
| 后端 | `server/api`（Nitro） | Spring Boot REST |
| 前端 | `pages/`（Vue 3） | React 18（Vite） |
| ORM | Prisma | Spring Data JPA (Hibernate) |
| 鉴权 | nuxt-auth-utils（会话 Cookie） | Spring Security + JWT |
| 迁移 | prisma migrate | Flyway |
| 数据库 | PostgreSQL | PostgreSQL（本地 H2） |

## 链路地图（也是本系列目录）

| 篇 | 内容 |
|----|------|
| [01 重构总览与项目结构](./01-重构总览与项目结构.md) | 单体→分离、仓库拆分、目录设计 |
| [02 Java 后端搭建](./02-Java后端搭建.md) | Spring Boot + JPA 实体（对应 Prisma）+ 分层 + DTO |
| [03 鉴权重构 Session→JWT](./03-鉴权重构-Session到JWT.md) | Spring Security + JWT + 三角色权限 |
| [04 数据库与 Flyway 迁移](./04-数据库与Flyway迁移.md) | H2/PostgreSQL、profile、ddl-auto、Flyway |
| [05 React 前端搭建](./05-React前端搭建.md) | Vite + Router + axios + Context 鉴权 |
| [06 Docker 与本地全栈联调](./06-Docker与本地全栈联调.md) | 多阶段镜像、compose、端到端验证 |
| [07 CI/CD 与镜像发布](./07-CICD与镜像发布.md) | Actions + GHCR + SSH 自动部署 |
| [08 HTTPS 与上线](./08-HTTPS与上线.md) | Nginx + certbot、无域名策略、CORS |

## 相关仓库

- `ouyang-server`：Java 后端
- `ouyang-web`：React 前端
- `ouyang-saga-nuxt-legacy`：旧 Nuxt 版（归档参照）

## 环境要求

- JDK 21、Maven 3.9+
- Node.js 20+、npm
- Docker（部署/整体验证用；本地开发可不装，用 H2）
