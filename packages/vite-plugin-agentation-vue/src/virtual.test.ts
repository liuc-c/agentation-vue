import { describe, expect, it } from "vitest"
import { resolveRuntimeEntryFilePath } from "./virtual.ts"

describe("resolveRuntimeEntryFilePath", () => {
  it("prefers source runtime when loaded from src during workspace development", () => {
    const entryPath = resolveRuntimeEntryFilePath(
      "/tmp/agentation-vue/src",
      (path) => path === "/tmp/agentation-vue/src/runtime/entry.ts",
    )

    expect(entryPath).toBe("/tmp/agentation-vue/src/runtime/entry.ts")
  })

  it("prefers built runtime when loaded from dist in a published package", () => {
    const entryPath = resolveRuntimeEntryFilePath(
      "/tmp/agentation-vue/dist",
      (path) => [
        "/tmp/agentation-vue/dist/runtime/entry.js",
        "/tmp/agentation-vue/src/runtime/entry.ts",
      ].includes(path),
    )

    expect(entryPath).toBe("/tmp/agentation-vue/dist/runtime/entry.js")
  })

  it("falls back to source runtime when dist output is unavailable", () => {
    const entryPath = resolveRuntimeEntryFilePath(
      "/tmp/agentation-vue/dist",
      (path) => path === "/tmp/agentation-vue/src/runtime/entry.ts",
    )

    expect(entryPath).toBe("/tmp/agentation-vue/src/runtime/entry.ts")
  })
})
