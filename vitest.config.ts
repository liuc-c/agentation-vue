import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

function projectRoot(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "@liuovo/agentation-vue-core",
          root: projectRoot("./packages/core"),
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [vue()],
        test: {
          name: "@liuovo/agentation-vue-ui",
          root: projectRoot("./packages/ui-vue"),
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "vite-plugin-agentation-vue",
          root: projectRoot("./packages/vite-plugin-agentation-vue"),
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
})
