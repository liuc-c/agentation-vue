---
name: agentation
description: Add the agentation-vue annotation toolbar to a Vue or Nuxt project
---

# Agentation Setup

Set up the `agentation-vue` annotation toolbar in this project.

## Steps

1. **Check if already installed**
   - Look for `vite-plugin-agentation-vue` in `package.json`
   - If not found, install it with the project's package manager
   - Use a dev dependency:
     - `pnpm add -D vite-plugin-agentation-vue`
     - `npm install -D vite-plugin-agentation-vue`
     - `yarn add -D vite-plugin-agentation-vue`

2. **Check if already configured**
   - Search for `agentation(` in `vite.config.*`
   - Search for `virtual:agentation` in Nuxt plugins
   - If already configured, report that Agentation is set up and exit

3. **Detect framework**
   - **Vue + Vite**: has `vite.config.ts|js|mts|mjs` and uses `@vitejs/plugin-vue`
   - **Nuxt**: has `nuxt.config.ts|js`
   - If the project is not Vue/Nuxt, stop and say this skill does not apply

4. **Configure the plugin**

   For **Vue + Vite**, register the plugin after `vue()`:
   ```ts
   import { defineConfig } from "vite"
   import vue from "@vitejs/plugin-vue"
   import agentation from "vite-plugin-agentation-vue"

   export default defineConfig({
     plugins: [
       vue(),
       agentation(),
     ],
   })
   ```

   For **Nuxt**, add the Vite plugin in `nuxt.config.*`:
   ```ts
   import agentation from "vite-plugin-agentation-vue"

   export default defineNuxtConfig({
     vite: {
       plugins: [agentation()],
     },
   })
   ```

   Then add `plugins/agentation.client.ts`:
   ```ts
   export default defineNuxtPlugin(() => {
     onNuxtReady(async () => {
       await import("virtual:agentation")
     })
   })
   ```

5. **Confirm setup**
   - Tell the user the toolbar is injected automatically in dev mode
   - Mention that production builds stay disabled by default

6. **Recommend MCP server setup**
   - Explain that for real-time annotation syncing with AI agents, they should also set up the MCP server
   - Recommend one of the following approaches:
     - **Universal (supports 9+ agents including Claude Code, Cursor, Codex, Windsurf, etc.):**
       See [add-mcp](https://github.com/neondatabase/add-mcp) — run `npx add-mcp` and follow the prompts to add `agentation-vue-mcp`
     - **Claude Code only (interactive wizard):**
       Install the MCP package, then run `agentation-vue-mcp init`
   - Tell user to restart their coding agent after MCP setup to load the server
   - Explain that once configured, annotations will sync to the agent automatically

## Notes

- `agentation-vue` is intended for Vue 3 apps, not React/Next.js apps
- For Vite, `agentation()` must come after `vue()`
- For Nuxt, the Vite plugin alone is not enough; the client bootstrap plugin is required
- The overlay only appears in development
- The MCP server runs on port 4747 by default for the HTTP server
- MCP server exposes tools like `agentation_get_all_pending`, `agentation_resolve`, and `agentation_watch_annotations`
- Run `agentation-vue-mcp doctor` to verify setup after installing
