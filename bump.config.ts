import { defineConfig } from "bumpp"

export default defineConfig({
  files: [
    "package.json",
    "packages/core/package.json",
    "packages/ui-vue/package.json",
    "packages/vite-plugin-agentation-vue/package.json",
    "mcp/package.json",
    "mcp/src/server/acp-runtime.ts",
  ],
})
