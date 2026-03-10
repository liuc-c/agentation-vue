<img src="./package/logo.svg" alt="agentation-vue" width="56" />

# agentation-vue

[简体中文](./README.zh-CN.md)

`agentation-vue` is the Vue implementation of Agentation: a dev-only
annotation overlay for Vue 3 applications. It lets you click elements,
drag-select regions, leave structured feedback, and export or sync that
feedback with enough source context for AI coding agents to find the exact
component and line you mean.

Repository: `https://github.com/liuc-c/agentation-vue`

This repository is a `pnpm` workspace. Most users only need
`vite-plugin-agentation-vue`.

## Acknowledgement

`agentation-vue` is a Vue-focused refactor and extension of
[`agentation`](https://github.com/benjitaylor/agentation) by
[benjitaylor](https://github.com/benjitaylor). The original project shaped the
core product direction and interaction model. This repository rebuilds that
idea for Vue 3 and Vite, reorganizes the implementation into a Vue-oriented
workspace, and adds Vue source tracing, a Vue overlay UI, and related tooling.

Thanks to benjitaylor for creating and open-sourcing the original project.
If you are comparing the two repositories, this one should be understood as a
Vue ecosystem rework rather than an unrelated implementation.

## Features

- Dev-only overlay injected automatically during `vite dev`
- Click-to-annotate element selection and drag-to-select multi-element regions
- Vue source mapping to component file and line via `vite-plugin-vue-tracer`
- Markdown and JSON export for sharing feedback with coding agents
- Multiple export detail levels: `compact`, `standard`, `detailed`,
  `forensic`
- Animation freezing for inspecting transient UI states
- Built-in UI settings for theme, locale, marker visibility, marker color, and
  interaction blocking
- Optional sync to an MCP server so agents can consume annotations directly

## Why It Exists

When you tell an agent "fix the spacing in the blue card on the right", the
agent still has to guess which component you mean. `agentation-vue` captures
structured context such as selectors, nearby text, bounding boxes, and Vue
source locations so the feedback stays tied to real code instead of vague
visual descriptions.

## Package Overview

| Package | Purpose |
| --- | --- |
| `vite-plugin-agentation-vue` | Recommended entry point. Injects the runtime and enables Vue source tracing in dev mode. |
| `@liuovo/agentation-vue-ui` | Vue 3 overlay UI, toolbar, popover, highlight and marker layers, and composables. |
| `@liuovo/agentation-vue-core` | Framework-agnostic DOM identification, storage, transport, and export logic. |
| `agentation-vue-mcp` | Optional MCP + HTTP server for syncing annotations to coding agents. |
| `playgrounds/vue-vite-demo` | Minimal Vite + Vue demo. |
| `playgrounds/nuxt-demo` | Nuxt integration example. |

## Quick Start

### 1. Install the Vite plugin

```bash
pnpm add -D vite-plugin-agentation-vue
```

### 2. Register it after `vue()`

```ts
// vite.config.ts
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import agentation from "vite-plugin-agentation-vue"

export default defineConfig({
  plugins: [
    vue(),
    agentation({
      locale: "en",
      outputDetail: "standard",
    }),
  ],
})
```

`agentation()` must come after `vue()` so Vue SFC tracing runs in the right
order.

### 3. Start your app

```bash
pnpm dev
```

In dev mode, the toolbar appears in the bottom-right corner. The plugin is
disabled during production builds.

## Compatibility

- Vue `^3.5.0`
- Vite `^6.0.0 || ^7.0.0`
- Nuxt projects can integrate through Vite. See
  [`playgrounds/nuxt-demo`](./playgrounds/nuxt-demo).

## How To Use

1. Start your Vue app in dev mode.
2. Open the floating toolbar.
3. Click an element to annotate it, or drag across a region to collect
   multiple elements.
4. Enter feedback in the popover.
5. Copy the result as Markdown or JSON, or sync it to an MCP server.

## What Gets Exported

Depending on the selected detail level, exported feedback can include:

- CSS selector and element path
- Selected text or nearby text context
- Vue component file path and line number
- Component hierarchy, classes, and bounding box
- Computed styles and accessibility metadata
- Page context such as URL, viewport, timestamp, and user agent in
  `forensic` mode

Not every field is available for every selection. The formatter only includes
data that could be resolved from the current page state.

## Nuxt Setup

Nuxt needs the Vite plugin plus a client-only bootstrap plugin.

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

See [`playgrounds/nuxt-demo`](./playgrounds/nuxt-demo) for a working example.

## MCP Sync

If you want agents to read annotations directly instead of relying on pasted
Markdown, connect the overlay to `agentation-vue-mcp`.

```ts
agentation({
  sync: {
    endpoint: "http://localhost:4748",
    projectId: "demo-app",                // optional, defaults to workspace-name/relative-path or the Vite root folder name
    autoSync: true,
    debounceMs: 400,
    ensureServer: true,
  },
})
```

`sync` is enabled by default during `vite dev`. If you do not want browser
annotations to sync anywhere, set `sync: false`.

In shared-server mode, multiple local projects can point to the same
companion endpoint. The Vite plugin health-checks that endpoint first and
reuses the existing process when one is already running.

Start the server manually from this repo:

```bash
pnpm mcp
```

Or use the published MCP package directly:

```bash
npx agentation-vue-mcp server --port 4748
```

The unified local companion listens on `4748` by default. Browser sync uses
`/v2/*`, and MCP clients connect over either streamable HTTP (`/mcp`), legacy
SSE (`/sse`), or stdio on the same port.

### Get Started Flow

The toolbar's `Get started` panel mirrors the runtime config and shows:

- The current browser sync API and MCP transport endpoints
- A ready-to-run CLI command for `agentation-vue-mcp server`
- A Claude CLI registration command
- The webhook environment variables the server reads

Recommended local setup:

1. Let all Vite projects share one Agentation server.
2. The Vite plugin defaults `projectId` to `workspace-name/relative-path` inside a monorepo, otherwise to the project folder name; set it explicitly only when you want a different scope.
3. When multiple projects share the server, scope agent reads with `projectFilter`.
4. Use webhook forwarding if you want external automations in addition to MCP.

## Plugin Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` in `serve`, `false` in `build` | Enables or disables the plugin. |
| `locale` | `"en" \| "zh-CN"` | `"en"` | Default UI locale. |
| `storagePrefix` | `string` | `"agentation-vue-"` | Prefix for persisted annotation data in storage. |
| `outputDetail` | `"compact" \| "standard" \| "detailed" \| "forensic"` | `"standard"` | Controls how much metadata is included in exports. |
| `sync` | `{ endpoint?: string, mcpEndpoint?: string, projectId?: string, autoSync?: boolean, debounceMs?: number, ensureServer?: boolean } \| false` | enabled in `serve` | Sends annotations to the unified Agentation companion. |
| `inspector` | `"tracer"` | `"tracer"` | Source resolution strategy. Reserved for future alternatives. |

## Output Detail Levels

| Level | Intended use |
| --- | --- |
| `compact` | Minimal output for quick copy-paste. |
| `standard` | Good default for most code review and implementation tasks. |
| `detailed` | Adds more source, layout, and DOM context. |
| `forensic` | Maximum context, including environment and computed-style data. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+Shift+F` | Toggle annotation mode |
| `P` | Pause or resume animations |
| `H` | Hide or show markers |
| `C` | Copy Markdown |
| `X` | Clear all annotations |
| `Escape` | Close popover, deselect, or disable annotation mode |

## Workspace Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

Useful package-specific commands:

- `pnpm --filter ./playgrounds/vue-vite-demo dev`
- `pnpm --filter ./playgrounds/nuxt-demo dev`
- `pnpm --filter @liuovo/agentation-vue-ui test`
- `pnpm mcp`

Release and npm publishing:

- `pnpm release:patch`
- `pnpm release:minor`
- `pnpm release:major`

Repository layout:

- `packages/core` - framework-agnostic runtime logic
- `packages/ui-vue` - Vue overlay UI and composables
- `packages/vite-plugin-agentation-vue` - Vite integration and runtime
  bootstrap
- `playgrounds/*` - manual verification apps
- `mcp` - MCP server

## License

PolyForm Shield 1.0.0
