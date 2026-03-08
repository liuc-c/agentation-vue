<img src="./package/logo.svg" alt="agentation-vue" width="56" />

# agentation-vue

[English](./README.md)

`agentation-vue` 是 Agentation 的 Vue 版本：一个面向 Vue 3 应用的开发态批注
覆盖层。它可以让你直接在页面上点击元素、拖拽选择区域、写下结构化反馈，并把
这些反馈导出或同步给 AI 编码代理，同时附带足够准确的源码上下文，帮助代理定位
到你真正指的组件和代码行。

仓库地址：`https://github.com/liuc-c/agentation-vue`

这个仓库是一个 `pnpm` monorepo。对大多数使用者来说，推荐直接从
`vite-plugin-agentation-vue` 接入。

## 功能概览

- 在 `vite dev` 阶段自动注入批注工具栏，生产构建默认关闭
- 支持点击元素批注，也支持拖拽区域进行多元素选择
- 通过 `vite-plugin-vue-tracer` 将页面元素映射回 Vue 组件文件和行号
- 支持导出 Markdown 和 JSON，方便直接发给 AI 编码代理
- 支持 `compact`、`standard`、`detailed`、`forensic` 四档导出详情
- 支持暂停动画，便于标注过渡态、悬浮态、轮播态等瞬时界面
- 内置主题、语言、标记显隐、标记颜色、交互拦截等设置
- 可选接入 MCP 服务端，让代理直接消费批注数据

## 这个项目解决什么问题

只靠自然语言告诉代理“右边那个蓝色卡片的间距不对”，代理仍然要猜你指的是哪段
代码。`agentation-vue` 会把反馈绑定到真实页面元素，并补充选择器、附近文本、
位置信息、Vue 源码位置等上下文，让反馈从“视觉描述”变成“可定位的代码线索”。

## 包结构说明

| 包 | 作用 |
| --- | --- |
| `vite-plugin-agentation-vue` | 推荐入口。负责在开发态注入运行时，并开启 Vue 源码追踪。 |
| `@liuovo/agentation-vue-ui` | Vue 3 覆盖层 UI、工具栏、弹窗、高亮层、标记层和相关 composables。 |
| `@liuovo/agentation-vue-core` | 与框架无关的 DOM 识别、存储、传输、导出等核心能力。 |
| `agentation-vue-mcp` | 可选的 MCP + HTTP 服务端，用于把批注同步给编码代理。 |
| `playgrounds/vue-vite-demo` | 最小 Vite + Vue 示例。 |
| `playgrounds/nuxt-demo` | Nuxt 接入示例。 |

补充说明：仓库里仍然保留了 `package/` 下的旧 React 包。当前 Vue 版的主要实现
都在 `packages/*` 和 `playgrounds/*` 下。

## 快速开始

### 1. 安装 Vite 插件

```bash
pnpm add -D vite-plugin-agentation-vue
```

### 2. 在 `vue()` 之后注册插件

```ts
// vite.config.ts
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import agentation from "vite-plugin-agentation-vue"

export default defineConfig({
  plugins: [
    vue(),
    agentation({
      locale: "zh-CN",
      outputDetail: "standard",
    }),
  ],
})
```

`agentation()` 必须放在 `vue()` 之后，这样 Vue SFC 的源码追踪顺序才是正确的。

### 3. 启动项目

```bash
pnpm dev
```

开发模式下，右下角会出现浮动工具栏。生产构建时该插件默认不会启用。

## 兼容性

- Vue `^3.5.0`
- Vite `^6.0.0 || ^7.0.0`
- Nuxt 项目可通过 Vite 层接入，参考
  [`playgrounds/nuxt-demo`](./playgrounds/nuxt-demo)

## 怎么使用

1. 用开发模式启动你的 Vue 应用。
2. 打开右下角浮动工具栏。
3. 点击页面元素进行批注，或者拖拽一个区域来选择多个元素。
4. 在弹出的输入框里填写反馈内容。
5. 将结果复制为 Markdown 或 JSON，或者同步到 MCP 服务端。

## 导出的内容包含什么

根据导出详情等级不同，导出的反馈可能包含：

- CSS 选择器和元素路径
- 选中文本或附近文本上下文
- Vue 组件文件路径和行号
- 组件层级、类名和元素位置
- 计算样式与可访问性元数据
- 在 `forensic` 模式下附带 URL、视口、时间戳、User Agent 等页面环境信息

并不是每次选择都能拿到所有字段。格式化输出会只包含当前页面状态下实际可解析到
的数据。

## Nuxt 接入

Nuxt 场景除了注册 Vite 插件之外，还需要一个只在客户端执行的 bootstrap 插件。

```ts
// nuxt.config.ts
import agentation from "vite-plugin-agentation-vue"

export default defineNuxtConfig({
  vite: {
    plugins: [agentation()],
  },
})
```

```ts
// plugins/agentation.client.ts
export default defineNuxtPlugin(() => {
  onNuxtReady(async () => {
    await import("virtual:agentation")
  })
})
```

可以直接参考 [`playgrounds/nuxt-demo`](./playgrounds/nuxt-demo)。

## MCP 同步

如果你希望代理直接读取批注，而不是依赖手工复制 Markdown，可以把覆盖层连接到
`agentation-vue-mcp`。

```ts
agentation({
  sync: {
    endpoint: "http://localhost:4747",
    autoSync: true,
    debounceMs: 400,
  },
})
```

在当前仓库里启动 MCP 服务：

```bash
pnpm mcp
```

或者直接使用 MCP 包：

```bash
npx agentation-vue-mcp server
```

## 插件配置项

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `serve` 时为 `true`，`build` 时为 `false` | 控制插件是否启用。 |
| `locale` | `"en" \| "zh-CN"` | `"en"` | 默认界面语言。 |
| `storagePrefix` | `string` | `"agentation-vue-"` | 本地存储 key 前缀。 |
| `outputDetail` | `"compact" \| "standard" \| "detailed" \| "forensic"` | `"standard"` | 控制导出内容包含多少元数据。 |
| `sync` | `{ endpoint: string, autoSync?: boolean, debounceMs?: number } \| false` | `false` | 把批注同步到 MCP/HTTP 服务端。 |
| `inspector` | `"tracer"` | `"tracer"` | 源码定位策略，目前保留 `tracer`。 |

## 导出详情等级

| 等级 | 适用场景 |
| --- | --- |
| `compact` | 适合快速复制、最小化上下文。 |
| `standard` | 默认推荐，适合大部分评审和实现任务。 |
| `detailed` | 补充更多源码、布局和 DOM 上下文。 |
| `forensic` | 提供最完整的上下文，包括环境信息和计算样式。 |

## 键盘快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Cmd/Ctrl+Shift+F` | 切换批注模式 |
| `P` | 暂停或恢复动画 |
| `H` | 隐藏或显示标记 |
| `C` | 复制 Markdown |
| `X` | 清空所有批注 |
| `Escape` | 关闭弹窗、取消选择或退出批注模式 |

## 仓库开发

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

常用命令：

- `pnpm --filter ./playgrounds/vue-vite-demo dev`
- `pnpm --filter ./playgrounds/nuxt-demo dev`
- `pnpm --filter @liuovo/agentation-vue-ui test`
- `pnpm mcp`

发版相关：

- `pnpm release:patch`
- `pnpm release:minor`
- `pnpm release:major`

仓库目录：

- `packages/core`：框架无关的运行时核心能力
- `packages/ui-vue`：Vue 覆盖层 UI 与 composables
- `packages/vite-plugin-agentation-vue`：Vite 集成与运行时 bootstrap
- `playgrounds/*`：手动验证示例
- `mcp`：MCP 服务端

## License

PolyForm Shield 1.0.0
