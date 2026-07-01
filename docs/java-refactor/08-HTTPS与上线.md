# 08 · HTTPS 与上线

最后一公里：怎么把服务对外提供，以及 HTTPS 到底该在哪一层做。

## 一、先厘清一个事实

**应用本身从不做 HTTPS**，无论旧 Nuxt 还是新的 React+Java。TLS 一直是在**最外层一道 Nginx** 上终止的。旧项目容器里的 nginx 也只监听 80，证书在宿主机那层。

架构是这样：

```
用户 ──443/HTTPS──> 宿主机 Nginx(证书) ──80/HTTP──> web 容器 ──> app ──> db
```

所以我们的容器栈保持"纯 HTTP"是对的，HTTPS 交给外层。

## 二、没有域名时怎么办

**推荐：先不折腾 HTTPS，用 `http://服务器IP` 跑。** 原因：

- Let's Encrypt **不给纯 IP 签证书**，必须有域名。
- 大陆服务器要对公网开 80/443，域名还得先 **ICP 备案**。
- 学习/自用阶段，HTTP + IP 完全够用。

如果就是想练 HTTPS 又不想买域名：可以用 **DuckDNS / sslip.io** 这类免费域名 + Let's Encrypt（能签真证书），但大陆服务器同样受备案限制，海外服务器才顺畅。

## 三、有了（备案）域名后：加 HTTPS

思路：宿主机装 Nginx + certbot，反代到 web 容器的 80。

### 1) 让 web 容器只绑本机

`docker-compose.prod.yml` 里：

```yaml
  web:
    image: ghcr.io/pingw9606/ouyang-web:latest
    ports:
      - "127.0.0.1:80:80"   # 只给宿主机 Nginx 反代，不直接对公网
```

### 2) 装 Nginx + certbot（Ubuntu）

```bash
sudo apt-get update
sudo apt-get -y install nginx certbot python3-certbot-nginx
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw reload
# 云控制台的安全组也要放行 80/443
```

### 3) 写站点配置

```nginx
# /etc/nginx/sites-available/ouyang
server {
    listen 80;
    server_name novel.example.com;      # 换成你的域名
    client_max_body_size 5m;
    location / {
        proxy_pass http://127.0.0.1:80;  # 转给 web 容器
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/ouyang /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4) 一条命令签证书 + 自动续期

```bash
sudo certbot --nginx -d novel.example.com
```

certbot 会自动改写 Nginx 配置加上 443 和证书，并设置定时续期。

### 5) 让后端 CORS 放行域名

部署目录 `.env`：

```bash
APP_CORS_ORIGINS=https://novel.example.com
```

`docker-compose -f docker-compose.prod.yml up -d` 让后端重载。

## 四、上线检查清单

```bash
curl -I http://127.0.0.1:80         # web 容器本身正常？
curl -I https://novel.example.com   # 200 且证书有效？
curl -I http://novel.example.com    # 一般会 301 跳 https
```

排查顺序：**容器本身 → ufw/安全组 → DNS 解析 → 备案 → 证书**。

## 五、Spring Boot 侧的小配置

反代在前面时，让应用正确识别真实协议/IP（否则重定向可能拼错 http/https）：

```yaml
# application-prod.yml
server:
  forward-headers-strategy: framework
```

## 六、整条链路回顾

到这里，从旧 Nuxt 到新架构的完整链路就通了：

```
本地开发(H2) → Flyway 迁移 → Docker 镜像 → CI 测试
   → GHCR 发布镜像 → SSH 自动部署 → Nginx + HTTPS 对外
```

- **本地开发**：H2 零配置，`mvn spring-boot:run` + `npm run dev`。
- **数据库**：Flyway 管迁移，`ddl-auto=validate` 保证实体与表一致。
- **打包**：多阶段 Docker 镜像，compose 一键起全栈。
- **交付**：CI 保质量，GHCR 存镜像，push 即自动部署。
- **对外**：无域名先用 IP+HTTP，有域名再加最外层 Nginx + Let's Encrypt。

用一个熟悉的业务把这条链路走一遍，比背八股高效得多。回到 [系列总览](./index.md)。
