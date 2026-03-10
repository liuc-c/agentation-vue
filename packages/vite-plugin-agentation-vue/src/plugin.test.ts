import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite"

const ensureSharedCompanionServerMock = vi.fn()
const useMock = vi.fn()
const inferredProjectId = "workspace-scope-z7k2m9p"
const workspaceScopedProjectId = "agentation-vue/playgrounds/vue-vite-demo"

vi.mock("vite-plugin-vue-tracer", () => ({
  default: () => [],
}))

vi.mock("./ensure-server/index.ts", () => ({
  ensureSharedCompanionServer: (...args: unknown[]) => ensureSharedCompanionServerMock(...args),
}))

describe("agentation plugin shared companion wiring", () => {
  beforeEach(() => {
    vi.resetModules()
    useMock.mockReset()
    useMock.mockImplementation(() => undefined)
    ensureSharedCompanionServerMock.mockReset()
    ensureSharedCompanionServerMock.mockResolvedValue({
      dispose: vi.fn().mockResolvedValue(undefined),
    })
  })

  it("registers the shared companion and releases it when the dev server closes", async () => {
    const disposeMock = vi.fn().mockResolvedValue(undefined)
    ensureSharedCompanionServerMock.mockResolvedValue({
      dispose: disposeMock,
    })

    const closeHandlers = new Map<string, () => void>()
    const httpServer = {
      once: vi.fn((event: "close", listener: () => void) => {
        closeHandlers.set(event, listener)
      }),
    }

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
      httpServer,
    } as never)).resolves.toBeUndefined()

    expect(ensureSharedCompanionServerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:4748",
      }),
      expect.any(Function),
      expect.objectContaining({
        projectId: inferredProjectId,
        projectRoot: `/tmp/${inferredProjectId}`,
      }),
    )

    closeHandlers.get("close")?.()
    await Promise.resolve()

    expect(disposeMock).toHaveBeenCalledTimes(1)
    expect(useMock).toHaveBeenCalledTimes(1)
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

  it("prefers a workspace-relative projectId for nested monorepo apps", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "agentation-vue-"))
    const workspaceRoot = join(tempRoot, "agentation-vue")
    const projectRoot = join(workspaceRoot, "playgrounds", "vue-vite-demo")

    mkdirSync(projectRoot, { recursive: true })
    writeFileSync(join(workspaceRoot, "pnpm-workspace.yaml"), "packages:\n  - 'playgrounds/*'\n")

    try {
      const { agentation } = await import("./plugin.ts")
      const [shell] = agentation()
      const configResolvedHook = getHookHandler<ResolvedConfig>(shell, "configResolved")
      const configureServerHook = getHookHandler<ViteDevServer>(shell, "configureServer")

      configResolvedHook?.({
        command: "serve",
        root: projectRoot,
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
      expect(end).toHaveBeenCalledWith(expect.stringContaining(`"projectId":"${workspaceScopedProjectId}"`))
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it("keeps shared-server startup disabled when sync is false", async () => {
    const { agentation } = await import("./plugin.ts")
    const [shell] = agentation({ sync: false })
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
    expect(end).toHaveBeenCalledWith(expect.stringContaining(`"projectId":"${inferredProjectId}"`))
    expect(end).toHaveBeenCalledWith(expect.stringContaining(`"sync":false`))
    expect(ensureSharedCompanionServerMock).not.toHaveBeenCalled()
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
