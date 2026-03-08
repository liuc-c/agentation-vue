import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import agentation from "vite-plugin-agentation-vue"

export default defineConfig({
  plugins: [
    vue(),
    agentation({
      // Uncomment to enable sync to MCP server:
      // sync: { endpoint: "http://localhost:4747" },
    }),
  ],
})
