import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "@liuovo/agentation-vue-core",
          root: "./packages/core",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [vue()],
        test: {
          name: "@liuovo/agentation-vue-ui",
          root: "./packages/ui-vue",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "vite-plugin-agentation-vue",
          root: "./packages/vite-plugin-agentation-vue",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
