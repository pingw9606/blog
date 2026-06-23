#!/bin/bash
# 构建并部署到 Gitee Pages
set -e

npm run build

cd docs/.vitepress/dist

git init
git add -A
git commit -m "deploy"

# 替换为你的码云仓库地址
git push -f git@gitee.com:woody_/blog.git main:gh-pages

cd -
echo "部署完成！去 Gitee 仓库 -> 服务 -> Gitee Pages -> 选择 gh-pages 分支 -> 部署"
