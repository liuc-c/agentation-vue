# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Agentation?

An agent-agnostic visual feedback tool for web pages. Users click elements, add notes, and copy structured output (selectors, positions, context) that helps AI coding agents find the exact code being referenced. Licensed under PolyForm-Shield-1.0.0.

## Development Commands

```bash
pnpm install                              # Install all workspace dependencies
pnpm dev                                  # Run playground dev servers (vue-vite-demo + nuxt-demo)
pnpm dev:vite-demo                        # Run only the Vite Vue playground
pnpm dev:nuxt-demo                        # Run only the Nuxt playground
pnpm build                                # Build all packages/* (core, ui-vue, vite-plugin)
pnpm build:mcp                            # Build the MCP package
pnpm verify                               # Build publishable packages and run tests
pnpm test                                 # Run Vitest workspace (all 3 packages)
pnpm --filter @liuovo/agentation-vue-core test   # Run tests for a single package
pnpm --filter @liuovo/agentation-vue-ui test     # Run ui-vue tests (jsdom)
pnpm mcp                                  # Build and start MCP server (stdio + HTTP on port 4747)
pnpm release:patch                        # Bump publishable packages and push tag
pnpm release:minor                        # Same, minor version
pnpm release:major                        # Same, major version
```

## Monorepo Architecture

pnpm workspace with these packages:

```
packages/core                → @liuovo/agentation-vue-core (framework-agnostic)
    ↓                          DOM utilities, types, storage, transport, export
packages/ui-vue              → @liuovo/agentation-vue-ui (Vue 3 components)
    ↓                          Overlay, toolbar, markers, composables
packages/vite-plugin-agentation-vue → vite-plugin-agentation-vue
                                 One-line Vite plugin, virtual module, runtime bootstrap
                                 Composes vite-plugin-vue-tracer for source mapping

package/                     → agentation (legacy React package, kept outside the Vue release flow)
package/example/             → Legacy Next.js example/docs app
mcp/                         → agentation-vue-mcp (MCP server for AI agents)
playgrounds/vue-vite-demo    → Vite + Vue 3 manual testing
playgrounds/nuxt-demo        → Nuxt 3 manual testing
```

**Dependency flow:** `core` has no deps → `ui-vue` depends on `core` → `vite-plugin` depends on both. The legacy React `package/` is outside the Vue release flow. `mcp/` is published alongside the Vue packages.

## Build Tooling Per Package

| Package | Build Tool | Output |
|---------|-----------|--------|
| core | `tsc` (composite) | ESM only |
| ui-vue | `vite build` + `tsc --emitDeclarationOnly` | ESM library |
| vite-plugin | `tsc` (composite) | ESM only |
| package (React, legacy) | `tsup` (SCSS modules, CSS injection) | CJS + ESM |
| mcp | `tsup` | CJS + ESM + CLI bin |

## Testing

Vitest workspace defined in root `vitest.config.ts` with three projects:
- `@liuovo/agentation-vue-core` — environment: `node`
- `@liuovo/agentation-vue-ui` — environment: `jsdom` (with `@vitejs/plugin-vue`)
- `vite-plugin-agentation-vue` — environment: `node`

Tests are co-located with source as `*.test.ts`. The React `package/` has its own `vitest.config.ts`.

## Code Style

- TypeScript strict mode, ESM (`"type": "module"`)
- 2-space indentation, double quotes, no semicolons
- `PascalCase` for Vue SFC files, `camelCase` for utilities, `useX` for composables
- `verbatimModuleSyntax` enabled — use `import type` for type-only imports
- Target: ES2022, module resolution: bundler

## Key Architecture Patterns

**Vite plugin flow:** Plugin registers serve-mode hooks → composes `vite-plugin-vue-tracer` → resolves `virtual:agentation` to init script → injects `<script>` via `transformIndexHtml` → runtime mounts UI, bootstraps storage, optionally syncs with MCP server.

**Vue UI state:** Composition API with provide/inject pattern. Factory functions (`createAnnotationsStore`, `createSelectionState`, `createOverlayState`) create reactive stores injected via named keys (`ANNOTATIONS_STORE_KEY`, etc.).

**MCP tools:** The MCP server exposes tools like `agentation_get_pending`, `agentation_resolve`, `agentation_reply`, `agentation_watch_annotations` for AI agents to consume and respond to annotations.

## Critical Rules

- **NEVER publish** (`npm publish` / `pnpm publish`) without explicit instruction
- **NEVER bump versions** in any package.json without explicit instruction
- **NEVER modify exports** in any package's index.ts without discussing breaking changes
- Package size is critical — avoid bloat, no external binaries
- `src/` is source of truth — never hand-edit `dist/`
- Changes to `packages/` affect all Vue users; changes to `package/` affect only the legacy React package
- Changes to `package/example/` only affect the legacy example app

## Git Workflow

- Active branch: `master`, PR target: `main`
- Prefer clear imperative commit messages; Conventional Commit prefixes welcome
- UI changes in `packages/ui-vue` or playgrounds should include screenshots/recordings in PRs

## Annotations

Whenever the user brings up annotations, fetch all the pending annotations before doing anything else. And infer whether I am referencing any annotations.
