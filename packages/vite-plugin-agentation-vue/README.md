# vite-plugin-agentation-vue

Vite plugin for one-line setup of `agentation-vue`.

It injects the Vue annotation overlay in dev mode and wires source resolution
through `vite-plugin-vue-tracer` so exported feedback can include component
file and line information.

## Installation

```bash
pnpm add -D vite-plugin-agentation-vue
```

## Setup

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue"
import { agentation } from "vite-plugin-agentation-vue"

export default defineConfig({
  plugins: [
    vue(),
    agentation(),  // Must come after vue()
  ],
})
```

The plugin automatically injects the annotation overlay in dev mode. It's disabled during production builds.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` in dev | Enable/disable the plugin |
| `locale` | `"en" \| "zh-CN"` | `"en"` | Default UI locale |
| `storagePrefix` | `string` | `"agentation-vue-"` | localStorage key prefix |
| `outputDetail` | `"compact" \| "standard" \| "detailed" \| "forensic"` | `"standard"` | Level of detail in export output |
| `sync` | `{ endpoint?: string, mcpEndpoint?: string, projectId?: string, autoSync?: boolean, debounceMs?: number, ensureServer?: boolean } \| false` | enabled in dev | Unified Agentation companion sync configuration |
| `agent` | `{ enabled?: boolean, autoSend?: boolean } \| false` | disabled by default, `autoSend` off | Local ACP companion bridge and auto-dispatch defaults |
| `inspector` | `"tracer"` | `"tracer"` | Source resolution strategy |

## Sync Configuration

Sync is enabled by default during `vite dev`. To disable it entirely:

```ts
agentation({
  sync: false,
})
```

To customize the shared Agentation server endpoints:

```ts
agentation({
  sync: {
    endpoint: "http://localhost:4748",
    projectId: "demo-app", // defaults to the Vite root folder name
    autoSync: true,     // default
    debounceMs: 400,    // default
    ensureServer: true, // default
  },
})
```

When `ensureServer` is enabled, the plugin health-checks the configured
companion endpoint, reuses an existing Agentation server if one is already
running, and otherwise launches the bundled `agentation-vue-mcp` CLI with the
current Node runtime during `vite dev`. If auto-start is unavailable, the
plugin logs a warning and continues so you can start the server manually.

## Local Agent Bridge

The local agent bridge is disabled by default and uses the shared
Agentation API as a companion process when enabled. Configure it like this:

```ts
agentation({
  agent: {
    enabled: true,
    autoSend: false,
  },
})
```

Then initialize local ACP-compatible agents on your machine:

```bash
agentation-vue-mcp agents init
```

## Nuxt Setup

Nuxt also needs a client-only bootstrap plugin:

```ts
// plugins/agentation.client.ts
export default defineNuxtPlugin(() => {
  onNuxtReady(async () => {
    await import("virtual:agentation")
  })
})
```

See `playgrounds/nuxt-demo` in the repository for a complete example.

```ts
// nuxt.config.ts
import { agentation } from "vite-plugin-agentation-vue"

export default defineNuxtConfig({
  vite: {
    plugins: [agentation()],
  },
})
```

## CSS Variables

The overlay uses CSS custom properties that can be customized:

| Variable | Dark Mode | Light Mode | Description |
|----------|-----------|------------|-------------|
| `--ag-bg` | `#1e293b` | `#ffffff` | Base background |
| `--ag-bg-surface` | `rgba(30,41,59,0.96)` | `rgba(255,255,255,0.96)` | Surface background |
| `--ag-bg-elevated` | `rgba(15,23,42,0.72)` | `rgba(241,245,249,0.72)` | Elevated background |
| `--ag-text` | `#e2e8f0` | `#1e293b` | Text color |
| `--ag-muted` | `#94a3b8` | `#64748b` | Muted text |
| `--ag-border` | `rgba(148,163,184,0.24)` | `rgba(148,163,184,0.3)` | Border color |
| `--ag-accent` | `#3b82f6` | `#3b82f6` | Accent (blue) |
| `--ag-selected` | `#f59e0b` | `#f59e0b` | Selection (amber) |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Shift+F` | Toggle annotation mode |
| `P` | Pause or resume animations |
| `H` | Hide or show markers |
| `C` | Copy Markdown |
| `X` | Clear all annotations |
| `Escape` | Dismiss popover / deselect / disable annotation mode |

## Release Flow

Workspace versions are managed from the repository root with `bumpp`.


## License

PolyForm Shield 1.0.0
