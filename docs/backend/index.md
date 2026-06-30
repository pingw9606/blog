# 后端 & 运维学习笔记（前端视角）

> 整理自 2026-06-30 搭建「欧阳一族」小说站的实战过程。
> 面向：有前端基础、想补后端与运维知识的同学。
> 公司栈是 **Java + MySQL**，本项目栈是 **Nuxt + Prisma + PostgreSQL**——但下面的**原理和流程是通用的**，已尽量做了对照。

## 目录

| 篇 | 文件 | 内容 |
|----|------|------|
| 01 | [服务器安全加固](./01-服务器安全加固.md) | SSH 密钥登录、ufw 防火墙、fail2ban、SSH 加固 |
| 02 | [Linux 运维：apt 卡死排查](./02-Linux运维-apt卡死排查.md) | 升级卡死的诊断、sudo 环境变量坑、进程树排查 |
| 03 | [Git 与 GitHub 协作](./03-Git与GitHub协作.md) | git init、gh CLI、推送、Dependabot、分支保护 |
| 04 | [CI/CD 与 Docker 部署](./04-CICD与Docker部署.md) | GitHub Actions、Docker、Nginx 反代、HTTPS、备案 |
| 05 | [全栈项目结构与鉴权原理](./05-全栈架构与鉴权原理.md) | Nuxt 全栈、登录会话机制、权限守卫 |
| 06 | [数据库：选型与运维](./06-数据库选型与运维.md) | PostgreSQL vs MySQL、ORM、迁移、连接池 |
| 07 | [后端查库找问题的流程](./07-后端查库找问题流程.md) | 日志→SQL→直连→EXPLAIN，Java/MySQL 实战流程 |
| 08 | [JVM 调优与排查](./08-JVM调优与排查.md) | 内存区域、GC、jstack/jmap/Arthas、线上问题对照 |
| 09 | [MySQL 索引优化](./09-MySQL索引优化.md) | 索引原理、EXPLAIN、最左前缀、索引失效、优化流程 |
| 10 | [前端转后端学习路线图](./10-前端转后端学习路线图.md) | Java 方向分阶段路线 + 学习方法 |

## 核心结论速记

- **运维直连数据库（psql/mysql）≠ 后端正常查库**：前者是调试/修补，后者走 ORM + API。
- **概念全通用**：Prisma≈JPA/MyBatis，PostgreSQL≈MySQL，Flyway≈Prisma migrate，HikariCP≈连接池。
- **安全三板斧**：只用密钥登录、防火墙只开必要端口、改 SSH 前先 `sshd -t` 校验。
- **服务器跑 apt 别用 `export` 设环境变量**——`sudo` 会清掉，要直接挂在 sudo 命令上。
- **Docker 发布端口会绕过 ufw**：靠 ufw 挡不住容器端口，要用端口绑定或云安全组。
