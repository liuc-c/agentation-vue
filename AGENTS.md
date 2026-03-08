# Repository Guidelines

## Project Structure & Module Organization
This repo is a `pnpm` workspace. `packages/core` contains framework-agnostic DOM, storage, transport, and export logic. `packages/ui-vue` holds the Vue 3 overlay UI, components, and composables. `packages/vite-plugin-agentation-vue` provides Vite integration and runtime bootstrap code. Use `playgrounds/vue-vite-demo` and `playgrounds/nuxt-demo` for manual verification. `mcp` ships the MCP server, while `package` contains the published React package and `package/example` its Next.js example app. Keep changes in `src/` and treat `dist/` as generated output.

## Build, Test, and Development Commands
Run commands from the repository root unless a package-specific workflow is needed.

- `pnpm dev` — starts playground dev servers in parallel.
- `pnpm build` — builds workspace packages under `packages/*`.
- `pnpm test` — runs the root Vitest workspace (`core`, `ui-vue`, and the Vite plugin).
- `pnpm --filter @liuovo/agentation-vue-ui test` — runs tests for one package.
- `pnpm --filter ./playgrounds/vue-vite-demo dev` — starts a single demo app.
- `pnpm mcp` — builds and starts the MCP server.

## Coding Style & Naming Conventions
TypeScript is configured in strict ESM mode. Match the existing style: 2-space indentation, double quotes, and no semicolons. Use `PascalCase` for Vue components such as `Toolbar.vue`, `camelCase` for helpers, and `useX.ts` naming for composables such as `useExport.ts`. Keep implementation and tests close together. Do not hand-edit generated artifacts in `dist/`.

## Testing Guidelines
Vitest is the standard test runner. The root config uses `node` for `packages/core` and `packages/vite-plugin-agentation-vue`, and `jsdom` for `packages/ui-vue`. The React package under `package/` has its own Vitest config for `.tsx` tests. Name tests `*.test.ts` or `*.test.tsx` and place them beside the code they cover. No coverage threshold is enforced today, so add focused tests for new behavior and edge cases before opening a PR.

## Commit & Pull Request Guidelines
Recent history includes terse subjects (`init`, `feat: ...`, and numeric placeholders like `6` or `5`). Prefer clear, imperative commit messages; Conventional Commit prefixes are welcome when useful, for example `feat: add markdown export toggle`. Pull requests should summarize affected packages, list verification commands, link related issues, and include screenshots or short recordings for UI changes in `packages/ui-vue` or the playgrounds. Call out breaking API or publish-impacting changes explicitly.
