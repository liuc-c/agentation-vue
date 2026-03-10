import { describe, expect, it } from "vitest"
import { createSnapshot } from "../../../scripts/update-registry-snapshot.mjs"

describe("createSnapshot", () => {
  it("converts upstream registry entries into the embedded snapshot format", () => {
    const snapshot = createSnapshot({
      agents: [
        {
          id: "claude-acp",
          name: "Claude Agent",
          description: "ACP wrapper",
          repository: "https://github.com/example/claude-acp",
          distribution: {
            npx: {
              package: "@example/claude-acp@1.2.3",
            },
          },
        },
        {
          id: "fast-agent",
          name: "fast-agent",
          distribution: {
            uvx: {
              package: "fast-agent-acp==0.5.9",
              args: ["-x"],
            },
          },
        },
        {
          id: "binary-only",
          name: "Binary Only",
          distribution: {
            binary: {
              "linux-x86_64": {
                archive: "https://example.com/tool.tar.gz",
                cmd: "./tool",
              },
            },
          },
        },
      ],
    }, {
      generatedAt: "2026-03-10T00:00:00.000Z",
      source: "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json",
    })

    expect(snapshot).toEqual({
      version: 1,
      generatedAt: "2026-03-10T00:00:00.000Z",
      source: "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json",
      agents: [
        {
          id: "claude-acp",
          label: "Claude Agent",
          kind: "claude",
          command: "npx",
          args: ["-y", "@example/claude-acp@1.2.3"],
          env: [],
          transport: "stdio",
          icon: "vscode-icons:file-type-claude",
          description: "ACP wrapper",
          homepage: "https://github.com/example/claude-acp",
          installHint: "Runs via npx -y @example/claude-acp@1.2.3.",
        },
        {
          id: "fast-agent",
          label: "fast-agent",
          kind: "fast-agent",
          command: "uvx",
          args: ["fast-agent-acp==0.5.9", "-x"],
          env: [],
          transport: "stdio",
          installHint: "Runs via uvx fast-agent-acp==0.5.9 -x.",
        },
      ],
    })
  })
})
