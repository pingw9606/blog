# 04 · CI/CD 与 Docker 部署

## 一、CI/CD 是什么
- **CI（持续集成）**：每次 push/PR 自动跑构建、测试，保证代码没坏。
- **CD（持续部署）**：代码合并后自动部署到服务器。

GitHub Actions 工作流放在 `.github/workflows/*.yml`。

### CI 示例（构建检查）
```yaml
name: CI
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
```
> Java 项目类比：把 `npm ci/build` 换成 `mvn verify` 或 `gradle build`，其它一样。

### CD 示例（SSH 部署到服务器）
```yaml
name: Deploy
on: { workflow_dispatch: {} }   # 先手动触发，配好后改成 push 自动
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd ${{ secrets.APP_DIR }}
            git pull --ff-only
            docker compose up -d --build
```
所需 Secrets 在仓库 Settings → Secrets and variables → Actions 配置。**部署私钥建议新生成一把专用 deploy key**，别用个人密钥。

## 二、Docker 部署架构
```
公网用户
   │ 443/80
┌──▼────────┐
│   Nginx   │  反向代理 + TLS（唯一对外）
└──┬────────┘
   │ 127.0.0.1:3000
┌──▼────────┐
│  app 容器  │  应用（仅 docker 内网）
└──┬────────┘
   │ db:5432（docker 内网）
┌──▼────────┐
│  db 容器   │  数据库（数据卷持久化，不对外）
└───────────┘
```
要点：
- **只有 Nginx 暴露 80/443**，app 和 db 只在 Docker 内网，不发布到宿主机。
- `docker compose up -d --build` 一键起全套。
- 数据库用 **named volume** 持久化，重建容器不丢数据。

## 三、⚠️ 两个高频坑
1. **Docker 发布端口会绕过 ufw**：`-p 0.0.0.0:80:80` 的容器端口，ufw 挡不住（Docker 直接改 iptables）。要么端口只绑 `127.0.0.1`，要么用云安全组控制。
2. **大陆服务器用域名必须 ICP 备案**：没备案前只能 `http://IP` 访问；备案 + 域名解析后再用 certbot 配 HTTPS。

## 四、上线后访问
- 无域名阶段：`http://服务器公网IP`
- 有域名 + 备案 + HTTPS：`https://你的域名`
