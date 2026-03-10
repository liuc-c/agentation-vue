import { describe, expect, it } from "vitest"
import { readEmbeddedRegistryManifest } from "./index.js"

describe("readEmbeddedRegistryManifest", () => {
  it("loads the embedded snapshot manifest for the current platform", () => {
    const manifest = readEmbeddedRegistryManifest()

    expect(manifest.version).toBe(1)
    expect(manifest.agents.length).toBeGreaterThan(10)
    expect(manifest.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "claude-acp",
        command: "npx",
      }),
      expect.objectContaining({
        id: "fast-agent",
        command: "uvx",
      }),
    ]))
  })
})
