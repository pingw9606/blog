# 06 · Docker 与本地全栈联调

把后端、前端各自打成镜像，再用 docker-compose 把「前端 + 后端 + 数据库」一键起起来，端到端验证。

## 一、后端镜像：多阶段构建

多阶段的意义：第一阶段用 Maven 编译打 jar，第二阶段只带 JRE 运行——**最终镜像不含 Maven 和源码**，小且安全。

```dockerfile
# ---- 构建阶段 ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline      # 先下依赖，利用层缓存
COPY src ./src
RUN mvn -q clean package -DskipTests

# ---- 运行阶段 ----
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app   # 非 root 运行
COPY --from=build /app/target/ouyang-server-*.jar app.jar
USER app
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-jar", "app.jar"]
```

> **层缓存技巧**：先 `COPY pom.xml` 再下依赖，最后才 `COPY src`。只改代码不改依赖时，依赖层直接命中缓存，构建快很多。

## 二、前端镜像：Node 构建 → Nginx 托管

前端产物是静态文件，用 Nginx 托管，并把 `/api` 反代给后端：

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://ouyang-server:8080
EXPOSE 80
```

Nginx 配置用**模板**，后端地址可通过环境变量注入（官方镜像会用 `envsubst` 把 `${BACKEND_URL}` 替换掉）：

```nginx
# nginx.conf.template
server {
    listen 80;
    root /usr/share/nginx/html;
    location / { try_files $uri $uri/ /index.html; }   # SPA 路由回退
    location /api/ {
        proxy_pass ${BACKEND_URL};
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> `try_files ... /index.html` 是 SPA 的关键：刷新 `/novel/xxx` 这种前端路由时，Nginx 找不到文件就回退到 index.html，交给 React Router 处理。

## 三、docker-compose：一键起全栈

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER:-ouyang}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-ouyang_dev_pwd}
      POSTGRES_DB: ${DB_NAME:-ouyang}
    volumes: [ouyang-pgdata:/var/lib/postgresql/data]
    healthcheck:                       # 让 app 等 db 真正就绪
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-ouyang} -d ${DB_NAME:-ouyang}"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: ./ouyang-server
    depends_on:
      db: { condition: service_healthy }
    environment:
      SPRING_PROFILES_ACTIVE: prod
      DATABASE_URL: jdbc:postgresql://db:5432/${DB_NAME:-ouyang}
      DB_USER: ${DB_USER:-ouyang}
      DB_PASSWORD: ${DB_PASSWORD:-ouyang_dev_pwd}
      APP_JWT_SECRET: ${APP_JWT_SECRET:?请设置至少32字节的密钥}
      APP_CORS_ORIGINS: ${APP_CORS_ORIGINS:-http://localhost}

  web:
    build: ./ouyang-web
    depends_on: [app]
    environment:
      BACKEND_URL: http://app:8080     # 容器间用服务名互访
    ports: ["80:80"]

volumes: { ouyang-pgdata: {} }
```

要点：
- **服务名即主机名**：容器间 `db:5432`、`app:8080` 直接用服务名访问（Docker 内置 DNS）。
- **healthcheck + depends_on**：确保 app 在 db 真正 ready 之后才启动。
- **数据卷**：`ouyang-pgdata` 持久化，重建容器不丢数据。
- **敏感值走 `.env`**：`APP_JWT_SECRET: ${...:?...}` 里的 `:?` 表示没设就报错，避免拿默认弱密钥上线。

## 四、跑起来 & 端到端验证

```bash
cp ouyang-server/.env.example .env    # 改密钥/密码
docker compose up -d --build

# 等就绪后，通过前端(80)访问后端接口，验证 web→app→db 全通
curl http://localhost/api/categories
curl -X POST http://localhost/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e@ouyang.local","username":"e2euser","password":"password123"}'
```

再确认数据真的落到容器里的 PostgreSQL：

```bash
docker exec <db容器名> psql -U ouyang -d ouyang -c "select username,email from users;"
```

看 app 日志确认 Flyway 迁移执行了：

```bash
docker logs <app容器名> | grep -i flyway
# Successfully applied 1 migration to schema "public", now at version v1
```

## 五、踩过的坑

- **macOS 没装 Docker Desktop**：可以用轻量的 `colima`——`brew install colima docker docker-compose && colima start`。
- **`docker compose`（带空格）不识别**：如果 compose 是作为独立二进制装的，用连字符的 `docker-compose`。
- **JWT 密钥必须 ≥ 32 字节**：compose 里用 `${APP_JWT_SECRET:?...}` 强制要求设置，别用默认值上线。

下一篇让它自动化：[07 · CI/CD 与镜像发布](./07-CICD与镜像发布.md)。
