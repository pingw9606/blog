# 03 · Git 与 GitHub 协作

从本地初始化到推上 GitHub，以及 Dependabot、分支保护。

## 一、本地初始化 + 首次提交
```bash
cd 项目目录
git init -b main          # 初始化，默认分支叫 main
git add -A                # 暂存所有（受 .gitignore 约束）
git commit -m "chore: initial commit"
```

### ⚠️ 提交前安全检查：别把密钥传上去
```bash
# 确认 .env 没被加入暂存区（应为空）
git diff --cached --name-only | grep -E '(^|/)\.env$'
```
`.gitignore` 必须包含：`.env`、`.env.*`（但 `!.env.example` 保留模板）、`node_modules`、构建产物等。

## 二、连接并推送到 GitHub（用官方 CLI gh）
```bash
brew install gh                    # 装 GitHub CLI
gh auth login                      # 交互式登录（选 SSH、自动上传公钥、浏览器授权）
# 一键建仓库 + 设 origin + 推送
gh repo create <仓库名> --private --source=. --remote=origin --push
```
之后日常：
```bash
git add -A && git commit -m "描述改了啥" && git push
```

### gh token 权限坑
`gh auth login` 默认 token **没有 `workflow` 权限**，无法合并/推送改动 `.github/workflows/` 的内容。需要时补权限：
```bash
gh auth refresh -h github.com -s workflow
```

## 三、Dependabot（自动依赖升级）
配置 `.github/dependabot.yml` 后，它会自动给过期依赖提 PR：
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
```
**处理原则**：
- ✅ 补丁/小版本、且 CI 绿 → 可合
- 🚫 **大版本（major，如 6→7）** → 别盲合，有破坏性改动，要专门开分支做迁移
- CI 能帮你**自动拦下会让项目跑挂的升级**（这就是 CI 的价值）

## 四、分支保护
- **免费私有仓库不支持**经典分支保护和 Rulesets（提示 Upgrade to Pro / make public）。
- 选择：升级 GitHub Pro / 仓库改公开 / 暂不做。
- 对"AI 或个人直接 push main"的工作流，强制 PR 反而碍事，多人协作时再开。

## 常用对照（Java 同学一样用）
Git/GitHub 是语言无关的，Java 项目用法完全一致，只是构建/CI 步骤换成 Maven/Gradle。
