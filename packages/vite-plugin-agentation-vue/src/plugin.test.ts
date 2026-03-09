import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"

const spawnMock = vi.fn()
const useMock = vi.fn()
const inferredProjectId = "workspace-scope-z7k2m9p"

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

  it("does not reuse an incompatible API server that lacks session events", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === "http://localhost:4747/health") {
        return new Response(null, { status: 200 })
      }

      if (url === "http://localhost:4747/v2/sessions/__agentation_probe__/events") {
        return new Response('{"error":"Not found"}', {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (url === "http://localhost:4748/health") {
        return new Response(null, { status: 200 })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }))

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

    expect(spawnMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("shared MCP server incompatible"))
    expect(useMock).toHaveBeenCalledTimes(1)

    logSpy.mockRestore()
  })

  it("injects the inferred projectId from Vite root into the runtime config", async () => {
    const { agentation } = await import("./plugin.ts")
    const [shell] = agentation()
    const configResolvedHook = getHookHandler<ResolvedConfig>(shell, "configResolved")
    const configureServerHook = getHookHandler<ViteDevServer>(shell, "configureServer")

    configResolvedHook?.({
      command: "serve",
      root: `/tmp/${inferredProjectId}`,
    } as never)

    await expect(configureServerHook?.({
      middlewares: {
        use: useMock,
      },
    } as never)).resolves.toBeUndefined()

    const middleware = useMock.mock.calls[0]?.[0] as
      | ((req: { url?: string }, res: { statusCode: number; setHeader: (...args: unknown[]) => void; end: (body: string) => void }, next: () => void) => void)
      | undefined

    expect(middleware).toBeTypeOf("function")

    const setHeader = vi.fn()
    const end = vi.fn()
    const next = vi.fn()
    const res = {
      statusCode: 0,
      setHeader,
      end,
    }

    middleware?.({ url: "/@agentation-vue/init.js" }, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/javascript; charset=utf-8")
    expect(end).toHaveBeenCalledWith(expect.stringContaining(`"projectId":"${inferredProjectId}"`))
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
