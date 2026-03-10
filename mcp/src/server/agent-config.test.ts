import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  readEmbeddedRegistryManifest: vi.fn(),
}))

vi.mock("./registry/index.js", () => ({
  readEmbeddedRegistryManifest: mocks.readEmbeddedRegistryManifest,
}))

describe("loadAgentCatalog", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("uses the first available agent in snapshot order when no default is configured", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentation-agent-config-"))
    const auggieCommand = join(tempDir, "auggie")
    const claudeCommand = join(tempDir, "claude")
    const codexCommand = join(tempDir, "codex")

    writeFileSync(auggieCommand, "", "utf8")
    writeFileSync(claudeCommand, "", "utf8")
    writeFileSync(codexCommand, "", "utf8")

    mocks.readEmbeddedRegistryManifest.mockReturnValue({
      version: 1,
      source: "embedded",
      generatedAt: "2026-03-10T00:00:00.000Z",
      agents: [
        {
          id: "auggie",
          label: "Auggie CLI",
          kind: "auggie",
          command: auggieCommand,
        },
        {
          id: "claude-acp",
          label: "Claude Agent",
          kind: "claude",
          command: claudeCommand,
        },
        {
          id: "codex-acp",
          label: "Codex CLI",
          kind: "codex",
          command: codexCommand,
        },
      ],
    })

    try {
      const { loadAgentCatalog } = await import("./agent-config.js")
      const catalog = loadAgentCatalog(join(tempDir, "missing-agents.json"))

      expect(catalog.defaultAgentId).toBe("auggie")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
