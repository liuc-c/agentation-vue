import { describe, expect, it } from "vitest"
import { DEFAULT_AGENT_REGISTRY_MANIFEST } from "./default-manifest.js"

describe("DEFAULT_AGENT_REGISTRY_MANIFEST", () => {
  it("ships the generated ACP registry snapshot", () => {
    const claude = DEFAULT_AGENT_REGISTRY_MANIFEST.agents.find((agent) => agent.id === "claude-acp")
    const codex = DEFAULT_AGENT_REGISTRY_MANIFEST.agents.find((agent) => agent.id === "codex-acp")

    expect(DEFAULT_AGENT_REGISTRY_MANIFEST.generatedAt).toBeTruthy()
    expect(DEFAULT_AGENT_REGISTRY_MANIFEST.source).toBeTruthy()
    expect(claude).toMatchObject({
      id: "claude-acp",
      label: "Claude Agent",
      command: "npx",
      icon: "vscode-icons:file-type-claude",
    })
    expect(codex).toMatchObject({
      id: "codex-acp",
      label: "Codex CLI",
      kind: "codex",
      command: "npx",
    })
    expect(codex?.icon).toBeUndefined()
  })
})
