# 07 · CI/CD 与镜像发布（GHCR + 自动部署）

三步走：**CI**（push 自动构建测试）→ **发布镜像到 GHCR**（GitHub 自带的镜像仓库）→ **自动部署**（SSH 到服务器 pull & up）。

## 一、CI：每次 push 自动构建 + 测试

后端 `.github/workflows/ci.yml`：

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - run: mvn -B clean verify          # 编译 + 测试（local/H2，无需外部库）
      - run: docker build -t ouyang-server:ci .   # 校验镜像可构建
```

前端把 `mvn verify` 换成 `npm ci && npm run build` 即可。

> CI 的价值：**坏代码进不了 main**。后端测试用 H2 profile，CI 环境不用额外起数据库。

## 二、发布镜像到 GHCR

GHCR = GitHub Container Registry（`ghcr.io`），和仓库同源，不用额外账号。

`.github/workflows/release.yml`：

```yaml
name: Release image
on:
  push:
    branches: [main]
    tags: ['v*']
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}     # pingw9606/ouyang-server
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write                      # 推镜像到 GHCR 需要
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # 自带，无需手配
      - id: meta
        uses: docker/metadata-action@v5      # 自动生成标签
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
```

push 到 main 后，就会有 `ghcr.io/pingw9606/ouyang-server:latest` 和 `:main`。前端仓库同理产出 `ouyang-web:latest`。

> 私有仓库产出的镜像默认也是私有的，服务器拉之前要 `docker login ghcr.io`（用一个带 `read:packages` 的 PAT）。

## 三、自动部署：镜像推完 SSH 上服务器

在 release 工作流里加一个 `deploy` job，`needs: publish` 保证镜像先就绪。用**开关变量**控制，没配好之前自动跳过（流水线不报红）：

```yaml
  deploy:
    needs: publish
    runs-on: ubuntu-latest
    if: ${{ vars.DEPLOY_ENABLED == 'true' && github.ref == 'refs/heads/main' }}
    steps:
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: ${{ secrets.SSH_PORT || '22' }}
          script: |
            set -e
            cd "${{ secrets.DEPLOY_PATH }}"
            echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d
            docker image prune -f
```

服务器上用「拉镜像」版的 compose（不现场 build）：

```yaml
# docker-compose.prod.yml —— app/web 直接用镜像
  app:
    image: ghcr.io/pingw9606/ouyang-server:latest
  web:
    image: ghcr.io/pingw9606/ouyang-web:latest
    ports: ["80:80"]
```

### 需要配的 Secrets / 变量

在**两个仓库**的 Settings → Secrets and variables → Actions：

| 类型 | 名称 | 说明 |
|------|------|------|
| Variable | `DEPLOY_ENABLED` | `true` 才启用部署 |
| Secret | `SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY` | 服务器 SSH |
| Secret | `SSH_PORT` | 可选，默认 22 |
| Secret | `DEPLOY_PATH` | 服务器上 compose + .env 目录 |
| Secret | `GHCR_TOKEN` | 含 `read:packages` 的 PAT，供服务器拉镜像 |

用 gh CLI 批量设置：

```bash
gh variable set DEPLOY_ENABLED -b true -R pingw9606/ouyang-server
gh secret set SSH_PRIVATE_KEY < deploy_key -R pingw9606/ouyang-server
# ...两个仓库都要设
```

## 四、验证工作流

推代码后看运行状态：

```bash
gh run list -R pingw9606/ouyang-server --limit 3
# 看某次 run 的各 job 结论
gh run view <run-id> -R pingw9606/ouyang-server --json jobs -q '.jobs[] | "\(.name): \(.conclusion)"'
# publish: success
# deploy: skipped        ← 没开 DEPLOY_ENABLED 时安全跳过，不报红
```

确认镜像真的推上去了（看 Build & push 日志）：

```
#21 pushing ... DONE
image.name: ghcr.io/pingw9606/ouyang-server:main,ghcr.io/pingw9606/ouyang-server:latest
```

## 五、要点小结

- **CI 和 Release 分开**：CI 管质量（PR 也跑），Release 管发布（只在 main/tag）。
- **`GITHUB_TOKEN` 够用**：推 GHCR 不用自己配密码，给 job 加 `permissions: packages: write` 即可。
- **部署用开关变量**：`DEPLOY_ENABLED` 没开就跳过，方便先把 CI/发布跑通、服务器就绪后再开部署。

## 六、两个真实坑

- **CPU 架构要对齐**：开发机若是 Apple Silicon（**arm64**），本地 `docker build` 出来的镜像在 **amd64** 服务器上跑不起来。所以要么用 **CI 产出的镜像**（GitHub Actions 的 `ubuntu-latest` 是 amd64），要么直接**在服务器上 build**。跨架构本地构建可用 `docker buildx --platform linux/amd64`，但用 QEMU 模拟会很慢。
- **`docker compose` vs `docker-compose`**：前者是 Docker CLI 插件（带空格），后者是独立二进制（连字符）。不同机器装的可能不一样，脚本里别写死，先确认 `docker compose version` 能不能用。

最后一步，让它能用 HTTPS 对外：[08 · HTTPS 与上线](./08-HTTPS与上线.md)。
