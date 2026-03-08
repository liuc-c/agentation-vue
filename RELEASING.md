# 发版说明

这份文档只覆盖当前仓库的 Vue 版发版流程。

目标 GitHub 仓库：

- `https://github.com/liuc-c/agentation-vue`

发布策略已经调整为：

- 本地使用 `bumpp` 统一更新版本号、创建 release commit 和 git tag
- GitHub 在收到 `vX.Y.Z` tag 后自动执行 npm 发布
- 发布包限定为当前 Vue 版相关包，不会动 `package/` 里的旧 React 包

## 当前会发布哪些包

- `@liuovo/agentation-vue-core`
- `@liuovo/agentation-vue-ui`
- `vite-plugin-agentation-vue`
- `agentation-vue-mcp`


## 你需要手动完成的一次性配置

### 1. 确认 npm 包名和 scope 可用

当前配置会发布下面这些 npm 名称：

- `@liuovo/agentation-vue-core`
- `@liuovo/agentation-vue-ui`
- `vite-plugin-agentation-vue`
- `agentation-vue-mcp`

命名策略：

- 对外安装入口保持无 scope：`vite-plugin-agentation-vue`、`agentation-vue-mcp`
- 内部基础包放到你的个人 scope：`@liuovo/agentation-vue-core`、`@liuovo/agentation-vue-ui`

你需要确认：

- 你拥有 npm scope `@liuovo` 的发布权限
- `vite-plugin-agentation-vue` 这个非 scope 包名没有被别人占用
- `agentation-vue-mcp` 这个包名没有被别人占用，或者你确认要覆盖到你自己的账号下

如果这些名字在 npm 上不可用，先改 `package.json` 里的包名，再开始第一次发版。

### 2. 在 npm 创建 Automation Token

推荐使用 npm 的 Automation Token，不要用普通账号密码。

需要的能力：

- 能发布上述 4 个包
- 如果你的 npm 账号启用了 2FA，也要确保 token 允许 CI 发布

### 3. 在 GitHub 仓库配置 Secret

进入仓库 `https://github.com/liuc-c/agentation-vue` 的
`Settings -> Secrets and variables -> Actions`，新增：

- `NPM_TOKEN`：填入上一步创建的 npm Automation Token

### 4. 确认 GitHub Actions 已启用

当前仓库新增了两个 workflow：

- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`

其中：

- `CI`：在 `push` / `pull_request` 时执行 `pnpm verify`
- `Publish to npm`：在推送 `v*` tag 时自动发布到 npm

## 本地发版流程

先确保本地环境满足：

- Node.js `>= 20`
- `pnpm install` 已完成
- 工作区是干净的，`git status` 没有未提交改动
- `origin` 已指向 `https://github.com/liuc-c/agentation-vue.git`

如果你的本地仓库还没有 remote，可以执行：

```bash
git remote add origin https://github.com/liuc-c/agentation-vue.git
```

### 发布 patch 版本

```bash
pnpm release:patch
```

### 发布 minor 版本

```bash
pnpm release:minor
```

### 发布 major 版本

```bash
pnpm release:major
```

这些命令会做几件事：

1. 使用 `bumpp` 同时更新以下文件中的版本号：
   - `package.json`
   - `packages/core/package.json`
   - `packages/ui-vue/package.json`
   - `packages/vite-plugin-agentation-vue/package.json`
   - `mcp/package.json`
2. 创建 commit，格式为 `release: vX.Y.Z`
3. 创建 tag，格式为 `vX.Y.Z`
4. 推送 commit 和 tag 到远端

tag 推上去之后，GitHub 会自动触发 `Publish to npm` workflow。

## 建议的发版前检查

正式发版前，先在本地执行：

```bash
pnpm verify
```

它会执行：

- `pnpm build`
- `pnpm --filter agentation-vue-mcp build`
- `pnpm test`

## 发布成功后

你应该检查：

- GitHub Actions 里的 `Publish to npm` 是否成功
- npm 页面上 4 个包的版本是否都已经变成新的版本号
- `vite-plugin-agentation-vue`、`agentation-vue-mcp`、`@liuovo/agentation-vue-core`、`@liuovo/agentation-vue-ui` 的 README 和包信息是否正常显示

## 常见问题

### 1. GitHub Action 报 `NPM_TOKEN` 缺失

说明仓库还没有配置 `NPM_TOKEN` secret，按上面的 GitHub 配置步骤补上。

### 2. npm 返回 `403` 或 scope 无权限

通常是下面几种情况：

- 你没有 `@liuovo` scope 的发布权限
- 包名已经被其他账号占用
- token 权限不够

先处理 npm 权限和包名，再重试。

### 3. workflow 提示 tag 和版本号不一致

`publish.yml` 会校验：

- git tag 必须是 `vX.Y.Z`
- 根 `package.json` 的版本必须正好是 `X.Y.Z`

如果你手动推了一个不匹配的 tag，发布会被拦下。

### 4. 我只想先 bump 版本，不想立刻 push

当前仓库脚本默认会 push。

如果你要先本地演练，可以直接手动运行 `bumpp`，例如：

```bash
pnpm exec bumpp package.json packages/core/package.json packages/ui-vue/package.json packages/vite-plugin-agentation-vue/package.json mcp/package.json --all --git-check --release patch
```

这样你可以先确认版本修改结果，再决定是否提交和推送。
