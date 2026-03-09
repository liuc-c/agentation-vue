import { beforeEach, describe, expect, it, vi } from "vitest"

const resolveMock = vi.fn<(id: string) => string>()
const accessSyncMock = vi.fn<(path: string) => void>()

vi.mock("node:module", () => ({
  createRequire: () => ({
    resolve: resolveMock,
  }),
}))

vi.mock("node:fs", () => ({
  accessSync: (path: string) => accessSyncMock(path),
  constants: {
    R_OK: 4,
  },
}))

describe("shared server spawn helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    resolveMock.mockReset()
    accessSyncMock.mockReset()
  })

  it("resolves the installed MCP CLI next to the package entry", async () => {
    resolveMock.mockReturnValue("/virtual/node_modules/agentation-vue-mcp/dist/index.js")
    accessSyncMock.mockImplementation(() => undefined)

    const { resolveInstalledMcpCliPath } = await import("./shared-server.ts")

    expect(resolveInstalledMcpCliPath()).toBe("/virtual/node_modules/agentation-vue-mcp/dist/cli.js")
  })

  it("falls back to the workspace MCP build when the package is not linked yet", async () => {
    resolveMock.mockImplementation(() => {
      throw new Error("missing package")
    })
    accessSyncMock.mockImplementation((path) => {
      if (String(path).includes("/mcp/dist/cli.js")) {
        return
      }
      throw new Error("missing file")
    })

    const { resolveMcpCliPath } = await import("./shared-server.ts")

    expect(resolveMcpCliPath()).toMatch(/\/mcp\/dist\/cli\.js$/)
  })

  it("creates a node-based spawn spec for the bundled MCP CLI", async () => {
    const { createSharedServerSpawnSpec } = await import("./shared-server.ts")

    expect(createSharedServerSpawnSpec(4747, 4748, () => "/tmp/agentation-vue-mcp-cli.js")).toEqual({
      command: process.execPath,
      args: [
        "/tmp/agentation-vue-mcp-cli.js",
        "server",
        "--port",
        "4747",
        "--mcp-port",
        "4748",
        "--no-stdio",
      ],
    })
  })

  it("skips auto-start when no MCP CLI can be resolved", async () => {
    const { createSharedServerSpawnSpec } = await import("./shared-server.ts")

    expect(createSharedServerSpawnSpec(4747, 4748, () => null)).toBeNull()
  })
})
