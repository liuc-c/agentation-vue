import { EventEmitter } from "node:events"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentationVueSyncOptions } from "../types.ts"
import { ensureSharedCompanionServer } from "./index.ts"

class FakeChildProcess extends EventEmitter {
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.onKill?.()
    this.emit("exit", 0, signal)
    return true
  })

  constructor(
    readonly pid: number,
    private readonly onKill?: () => void,
    private readonly recentStderr?: string,
  ) {
    super()
  }

  getRecentStderr() {
    return this.recentStderr
  }
}

describe("ensureSharedCompanionServer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("lets a single owner start the companion and keeps reuse instances from stopping it", async () => {
    const harness = createHarness()

    const owner = await harness.register("playgrounds/a")
    const firstChild = harness.spawnedChildren[0]
    const startedLog = harness.findLog("shared companion started")

    expect(harness.spawnSharedServer).toHaveBeenCalledTimes(1)
    expect(startedLog).toContain("startedBy=playgrounds/a")
    expect(startedLog).toContain("root=/workspace/playgrounds/a")

    harness.resetLogs()

    const follower = await harness.register("playgrounds/b")
    const reusedLog = harness.findLog("shared companion reused")

    expect(harness.spawnSharedServer).toHaveBeenCalledTimes(1)
    expect(reusedLog).toContain("owner=playgrounds/a")
    expect(reusedLog).toContain("requestedBy=playgrounds/b")
    expect(reusedLog).toContain("root=/workspace/playgrounds/a")

    await follower.dispose()

    expect(firstChild?.kill).not.toHaveBeenCalled()
    expect(harness.findLog("shared companion detached")).toContain("detached=playgrounds/b")

    harness.resetLogs()
    await owner.dispose()

    expect(firstChild?.kill).toHaveBeenCalledTimes(1)
    expect(harness.findLog("shared companion owner stopped")).toContain("stoppedBy=playgrounds/a")

    harness.cleanup()
  })

  it("allows a remaining plugin instance to take over after the owner unloads", async () => {
    const harness = createHarness()

    const owner = await harness.register("playgrounds/a")
    const initialChild = harness.spawnedChildren[0]
    const follower = await harness.register("playgrounds/b")

    harness.resetLogs()
    await owner.dispose()

    expect(initialChild?.kill).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1700)

    expect(harness.spawnSharedServer).toHaveBeenCalledTimes(2)
    expect(harness.logs.some((entry) => entry.includes("shared companion restarted"))).toBe(true)

    const takeoverChild = harness.spawnedChildren[1]
    await follower.dispose()

    expect(takeoverChild?.kill).toHaveBeenCalledTimes(1)

    harness.cleanup()
  })

  it("treats healthy unmanaged services as reusable until they disappear", async () => {
    const harness = createHarness({
      healthy: true,
      compatible: true,
    })

    const registration = await harness.register("playgrounds/a")

    expect(harness.spawnSharedServer).not.toHaveBeenCalled()
    expect(harness.findLog("shared companion reused")).toContain("owner=external-service")

    harness.resetLogs()
    harness.healthy = false

    await vi.advanceTimersByTimeAsync(1700)

    expect(harness.spawnSharedServer).toHaveBeenCalledTimes(1)
    expect(harness.logs.some((entry) => entry.includes("shared companion restarted"))).toBe(true)

    await registration.dispose()
    harness.cleanup()
  })

  it("refuses to adopt incompatible services", async () => {
    const harness = createHarness({
      healthy: true,
      compatible: false,
    })

    const registration = await harness.register("playgrounds/a")

    expect(harness.spawnSharedServer).not.toHaveBeenCalled()
    expect(harness.logs.some((entry) => entry.includes("shared companion incompatible"))).toBe(true)

    await registration.dispose()
    harness.cleanup()
  })

  it("reports likely causes when the auto-started child never becomes healthy", async () => {
    const harness = createHarness({
      waitReady: false,
    })

    const registration = await harness.register("playgrounds/a")

    const startupLog = harness.findLog("shared companion still starting")
    const exitLog = harness.findLog("shared companion exited")

    expect(startupLog).toContain("childPid=7001")
    expect(startupLog).toContain("loopback host resolves differently")
    expect(exitLog).toContain("childPid=7001")
    expect(exitLog).toContain("signal=SIGTERM")

    await registration.dispose()
    harness.cleanup()
  })

  it("includes captured child stderr in shared companion failure logs", async () => {
    const harness = createHarness({
      waitReady: false,
      recentStderr: "[HTTP] Server error: listen EPERM: operation not permitted 127.0.0.1:4748",
    })

    const registration = await harness.register("playgrounds/windows")

    const startupLog = harness.findLog("shared companion still starting")
    const exitLog = harness.findLog("shared companion exited")

    expect(startupLog).toContain("child stderr: [HTTP] Server error: listen EPERM")
    expect(exitLog).toContain("stderr=\"[HTTP] Server error: listen EPERM: operation not permitted 127.0.0.1:4748\"")

    await registration.dispose()
    harness.cleanup()
  })
})

function createHarness(options?: {
  healthy?: boolean
  compatible?: boolean
  waitReady?: boolean
  recentStderr?: string
}) {
  const registryRootDir = mkdtempSync(join(tmpdir(), "agentation-shared-server-"))
  const logs: string[] = []
  const activeChildPids = new Set<number>()
  const spawnedChildren: FakeChildProcess[] = []
  let healthy = options?.healthy ?? false
  let compatible = options?.compatible ?? true
  let waitReady = options?.waitReady
  let childPid = 7000
  let instanceId = 0

  const spawnSharedServer = vi.fn((port: number) => {
    const child = new FakeChildProcess(++childPid, () => {
      healthy = false
      activeChildPids.delete(child.pid)
    }, options?.recentStderr)

    activeChildPids.add(child.pid)
    healthy = true
    compatible = true
    spawnedChildren.push(child)
    return child
  })

  const deps = {
    registryRootDir,
    createInstanceId: () => `instance-${++instanceId}`,
    now: () => Date.now(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    isServerHealthy: vi.fn(async () => healthy),
    hasSessionEventsCapability: vi.fn(async () => compatible),
    waitForSharedServer: vi.fn(async () => waitReady ?? healthy),
    spawnSharedServer,
    isProcessAlive: (pid: number) => pid === process.pid || activeChildPids.has(pid),
    killProcess: vi.fn((pid: number) => {
      if (!activeChildPids.has(pid)) {
        return false
      }

      activeChildPids.delete(pid)
      healthy = false
      return true
    }),
  }

  const sync: AgentationVueSyncOptions = {
    endpoint: "http://localhost:4748",
    autoSync: true,
    debounceMs: 400,
    ensureServer: true,
  }

  return {
    deps,
    logs,
    spawnedChildren,
    spawnSharedServer,
    get healthy() {
      return healthy
    },
    set healthy(value: boolean) {
      healthy = value
    },
    async register(projectId: string) {
    return ensureSharedCompanionServer(
        sync,
        (message, detail) => logs.push(detail ? `${message} ${detail}` : message),
        {
          projectId,
          projectRoot: `/workspace/${projectId}`,
        },
        deps,
      )
    },
    resetLogs() {
      logs.length = 0
    },
    findLog(fragment: string) {
      const entry = logs.find((line) => line.includes(fragment))
      expect(entry, `expected log containing ${fragment}`).toBeTruthy()
      return entry as string
    },
    cleanup() {
      rmSync(registryRootDir, { recursive: true, force: true })
    },
  }
}
