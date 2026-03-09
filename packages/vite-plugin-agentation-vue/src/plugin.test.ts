import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"

const spawnMock = vi.fn()
const useMock = vi.fn()

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock("vite-plugin-vue-tracer", () => ({
  default: () => [],
}))

vi.mock("./shared-server.ts", () => ({
  createSharedServerSpawnSpec: () => ({
    command: process.execPath,
    args: ["/tmp/agentation-vue-mcp-cli.js", "server"],
  }),
}))

describe("agentation plugin shared server startup", () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    useMock.mockReset()
    useMock.mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
  })

  it("does not crash vite dev when background MCP spawn fails", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn EINVAL")
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const { agentation } = await import("./plugin.ts")
    const [shell] = agentation()
    const configResolvedHook = getHookHandler<ResolvedConfig>(shell, "configResolved")
    const configureServerHook = getHookHandler<ViteDevServer>(shell, "configureServer")

    configResolvedHook?.({ command: "serve" } as never)

    await expect(configureServerHook?.({
      middlewares: {
        use: useMock,
      },
    } as never)).resolves.toBeUndefined()

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ["/tmp/agentation-vue-mcp-cli.js", "server"],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }),
    )
    expect(useMock).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })
})

function getHookHandler<TArg>(
  plugin: Plugin,
  key: "configResolved" | "configureServer",
): ((arg: TArg) => void | Promise<void>) | undefined {
  const hook = plugin[key]
  if (typeof hook === "function") {
    return hook as (arg: TArg) => void | Promise<void>
  }
  if (hook && typeof hook === "object" && "handler" in hook) {
    return hook.handler as (arg: TArg) => void | Promise<void>
  }
  return undefined
}
