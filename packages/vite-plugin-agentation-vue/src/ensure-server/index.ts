import { randomUUID, createHash } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { AgentationVueSyncOptions } from "../types.ts"
import {
  hasSessionEventsCapability,
  isServerHealthy,
  normalizeUrl,
  parsePort,
  waitForSharedServer,
} from "./health.ts"
import { spawnSharedServer } from "./spawn.ts"

const COORDINATOR_VERSION = 1
const LOCK_RETRY_MS = 60
const LOCK_TIMEOUT_MS = 5000
const STALE_LOCK_MS = 5000
const WATCHDOG_INTERVAL_MS = 1500

interface SharedCompanionInstanceMeta {
  projectId?: string
  projectRoot?: string
}

export interface SharedCompanionRegistration {
  dispose(): Promise<void>
}

interface SharedServerInstanceRecord {
  id: string
  pid: number
  projectId?: string
  projectRoot?: string
  createdAt: string
  updatedAt: string
}

interface SharedServerRegistry {
  version: number
  endpoint: string
  ownerInstanceId?: string
  ownerPid?: number
  ownerProjectId?: string
  ownerProjectRoot?: string
  childPid?: number
  instances: Record<string, SharedServerInstanceRecord>
}

interface SharedCompanionChildHandle {
  pid?: number
  kill?(signal?: NodeJS.Signals | number): boolean
  once?(event: "error" | "exit", listener: (...args: any[]) => void): void
}

interface EnsureSharedServerDeps {
  registryRootDir: string
  createInstanceId(): string
  now(): number
  setInterval: typeof globalThis.setInterval
  clearInterval: typeof globalThis.clearInterval
  isServerHealthy: typeof isServerHealthy
  hasSessionEventsCapability: typeof hasSessionEventsCapability
  waitForSharedServer: typeof waitForSharedServer
  spawnSharedServer(port: number): SharedCompanionChildHandle | null
  isProcessAlive(pid: number): boolean
  killProcess(pid: number, signal?: NodeJS.Signals): boolean
}

const defaultDeps: EnsureSharedServerDeps = {
  registryRootDir: join(tmpdir(), "agentation-vue", "shared-companion"),
  createInstanceId: () => randomUUID(),
  now: () => Date.now(),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  isServerHealthy,
  hasSessionEventsCapability,
  waitForSharedServer,
  spawnSharedServer,
  isProcessAlive: (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  },
  killProcess: (pid, signal = "SIGTERM") => {
    try {
      process.kill(pid, signal)
      return true
    } catch {
      return false
    }
  },
}

export async function ensureSharedCompanionServer(
  sync: AgentationVueSyncOptions,
  log: (message: string, detail?: string) => void,
  meta: SharedCompanionInstanceMeta = {},
  depsOverride: Partial<EnsureSharedServerDeps> = {},
): Promise<SharedCompanionRegistration> {
  if (sync.ensureServer === false) {
    return { dispose: async () => {} }
  }

  const registration = new SharedCompanionCoordinator(
    sync,
    log,
    meta,
    {
      ...defaultDeps,
      ...depsOverride,
    },
  )

  await registration.start()
  return registration
}

class SharedCompanionCoordinator implements SharedCompanionRegistration {
  private readonly endpoint: string
  private readonly instance: SharedServerInstanceRecord
  private readonly registryPaths: { file: string; lock: string }
  private readonly instanceLabel: string
  private readonly sync: AgentationVueSyncOptions
  private readonly log: (message: string, detail?: string) => void
  private readonly deps: EnsureSharedServerDeps

  private disposed = false
  private child: SharedCompanionChildHandle | null = null
  private watchdog: ReturnType<typeof setInterval> | null = null
  private reconcilePromise: Promise<void> | null = null
  private lastStateKey: string | null = null

  constructor(
    sync: AgentationVueSyncOptions,
    log: (message: string, detail?: string) => void,
    meta: SharedCompanionInstanceMeta,
    deps: EnsureSharedServerDeps,
  ) {
    this.sync = sync
    this.log = log
    this.deps = deps
    this.endpoint = normalizeUrl(sync.endpoint)
    this.instanceLabel = formatInstanceLabel({
      pid: process.pid,
      projectId: meta.projectId?.trim() || undefined,
      projectRoot: meta.projectRoot?.trim() || undefined,
    })

    const timestamp = this.toIso(this.deps.now())
    this.instance = {
      id: this.deps.createInstanceId(),
      pid: process.pid,
      projectId: meta.projectId?.trim() || undefined,
      projectRoot: meta.projectRoot?.trim() || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.registryPaths = createRegistryPaths(this.endpoint, this.deps.registryRootDir)
  }

  async start(): Promise<void> {
    await this.updateRegistry((registry) => {
      registry.instances[this.instance.id] = this.snapshotInstance()
    })

    await this.reconcile("initial")

    this.watchdog = this.deps.setInterval(() => {
      void this.reconcile("watchdog")
    }, WATCHDOG_INTERVAL_MS)
    if (typeof this.watchdog !== "number") {
      this.watchdog.unref?.()
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    if (this.watchdog) {
      this.deps.clearInterval(this.watchdog)
      this.watchdog = null
    }

    const unregisterResult = await this.updateRegistry((registry) => {
      const wasOwner = registry.ownerInstanceId === this.instance.id
      const childPid = wasOwner ? registry.childPid : undefined
      delete registry.instances[this.instance.id]

      if (wasOwner) {
        clearOwner(registry)
      }

      return {
        wasOwner,
        childPid,
        remainingInstances: Object.keys(registry.instances).length,
      }
    })

    if (unregisterResult.wasOwner) {
      this.stopOwnedChild(unregisterResult.childPid)
      this.report(
        "shared companion owner stopped 🛑",
        `${this.endpoint} stoppedBy=${this.instanceLabel}`,
        `dispose:owner:${this.endpoint}`,
        true,
      )
      return
    }

    this.report(
      "shared companion detached ♻️",
      `${this.endpoint} detached=${this.instanceLabel}`,
      `dispose:shared:${this.endpoint}`,
      true,
    )
  }

  private async reconcile(trigger: "initial" | "watchdog" | "child-exit"): Promise<void> {
    if (this.disposed) {
      return
    }

    if (this.reconcilePromise) {
      return this.reconcilePromise
    }

    const reconcilePromise = this.reconcileOnce(trigger)
      .catch((error) => {
        this.report(
          "shared companion coordinator failed ⚠️",
          error instanceof Error ? error.message : String(error),
          `error:${this.endpoint}`,
          true,
        )
      })
      .finally(() => {
        this.reconcilePromise = null
      })

    this.reconcilePromise = reconcilePromise
    return reconcilePromise
  }

  private async reconcileOnce(trigger: "initial" | "watchdog" | "child-exit"): Promise<void> {
    await this.updateRegistry((registry) => {
      registry.instances[this.instance.id] = this.snapshotInstance()
    })

    if (this.disposed) {
      return
    }

    const healthy = await this.deps.isServerHealthy(this.endpoint)
    const compatible = healthy ? await this.deps.hasSessionEventsCapability(this.endpoint) : false

    if (this.disposed) {
      return
    }

    const registry = await this.readRegistry()
    const owner = resolveOwner(registry)

    if (healthy && compatible) {
      if (owner?.id === this.instance.id) {
        if (trigger === "child-exit") {
          this.report(
            "shared companion restarted ✅",
            `${this.endpoint} startedBy=${this.instanceLabel}`,
            `healthy:owner:${this.endpoint}`,
            true,
          )
          return
        }

        this.report(
          "shared companion running ✅",
          `${this.endpoint} startedBy=${this.instanceLabel}`,
          `healthy:owner:${this.endpoint}`,
        )
        return
      }

      if (owner) {
        this.report(
          "shared companion reused ♻️",
          `${this.endpoint} owner=${formatInstanceLabel(owner)} requestedBy=${this.instanceLabel}`,
          `healthy:shared:${owner.id}`,
        )
        return
      }

      this.report(
        "shared companion reused ♻️",
        `${this.endpoint} owner=external-service (not tracked by agentation-vue) requestedBy=${this.instanceLabel}`,
        `healthy:external:${this.endpoint}`,
      )
      return
    }

    if (healthy && !compatible) {
      if (owner?.id === this.instance.id) {
        this.stopOwnedChild()
        await this.releaseOwnership()
      }

      this.report(
        "shared companion incompatible ⚠️",
        `${this.endpoint} answered /health but is missing the required /v2 session event API`,
        `incompatible:${this.endpoint}`,
      )
      return
    }

    const port = parsePort(this.endpoint)
    if (port == null) {
      this.report(
        "shared companion auto-start skipped ⚠️",
        "sync.endpoint must include an explicit port",
        `invalid-port:${this.endpoint}`,
      )
      return
    }

    const claim = await this.updateRegistry((current) => {
      current.instances[this.instance.id] = this.snapshotInstance()

      const activeOwner = resolveOwner(current)
      if (activeOwner && activeOwner.id !== this.instance.id) {
        return {
          claimed: false,
          owner: activeOwner,
        }
      }

      current.ownerInstanceId = this.instance.id
      current.ownerPid = this.instance.pid
      current.ownerProjectId = this.instance.projectId
      current.ownerProjectRoot = this.instance.projectRoot
      current.childPid = undefined

      return {
        claimed: true,
        owner: this.snapshotInstance(),
      }
    })

    if (!claim.claimed) {
      this.report(
        "shared companion startup deferred ♻️",
        `${this.endpoint} waitingFor=${formatInstanceLabel(claim.owner)} requestedBy=${this.instanceLabel}`,
        `deferred:${claim.owner.id}`,
      )
      return
    }

    if (this.disposed) {
      await this.releaseOwnership()
      return
    }

    const child = this.deps.spawnSharedServer(port)
    if (!child) {
      await this.releaseOwnership()
      this.report(
        "shared companion auto-start skipped ⚠️",
        "agentation-vue-mcp CLI not found; install the dependency or start the server manually",
        `cli-missing:${this.endpoint}`,
      )
      return
    }

    this.attachChild(child)
    await this.updateRegistry((registry) => {
      if (registry.ownerInstanceId === this.instance.id) {
        registry.childPid = child.pid
      }
    })

    const ready = await this.deps.waitForSharedServer(this.endpoint)
    const compatibleAfterWait = ready
      ? await this.deps.hasSessionEventsCapability(this.endpoint)
      : false

    if (this.disposed) {
      this.stopOwnedChild(child.pid)
      await this.releaseOwnership()
      return
    }

    if (!ready || !compatibleAfterWait) {
      this.stopOwnedChild(child.pid)
      await this.releaseOwnership()

      if (!ready) {
        this.report(
          "shared companion still starting ⏳",
          "health checks not ready yet; if this persists, start agentation-vue-mcp server manually",
          `starting:${this.endpoint}`,
        )
        return
      }

      this.report(
        "shared companion incompatible ⚠️",
        `${this.endpoint} answered /health but is missing the required /v2 session event API`,
        `incompatible:${this.endpoint}`,
      )
      return
    }

    this.report(
      trigger === "initial" ? "shared companion started ✅" : "shared companion restarted ✅",
      `${this.endpoint} startedBy=${this.instanceLabel}`,
      `healthy:owner:${this.endpoint}`,
      true,
    )
  }

  private attachChild(child: SharedCompanionChildHandle): void {
    this.child = child

    child.once?.("error", (error) => {
      this.report(
        "shared companion child error ⚠️",
        error instanceof Error ? error.message : String(error),
        `child-error:${this.endpoint}`,
        true,
      )
    })

    child.once?.("exit", (_code, signal) => {
      if (this.child === child) {
        this.child = null
      }

      if (this.disposed) {
        return
      }

      this.report(
        "shared companion exited ⚠️",
        `${this.endpoint} startedBy=${this.instanceLabel}${signal ? ` signal=${String(signal)}` : ""}`,
        `child-exit:${this.endpoint}`,
        true,
      )

      void this.reconcile("child-exit")
    })
  }

  private stopOwnedChild(fallbackPid?: number): void {
    const child = this.child
    this.child = null

    if (child?.kill) {
      try {
        child.kill("SIGTERM")
        return
      } catch {
        // Fall through to a PID kill if available.
      }
    }

    const pid = child?.pid ?? fallbackPid
    if (pid) {
      this.deps.killProcess(pid, "SIGTERM")
    }
  }

  private async releaseOwnership(): Promise<void> {
    await this.updateRegistry((registry) => {
      if (registry.ownerInstanceId === this.instance.id) {
        clearOwner(registry)
      }
    })
  }

  private async readRegistry(): Promise<SharedServerRegistry> {
    return this.updateRegistry((registry) => cloneRegistry(registry))
  }

  private async updateRegistry<T>(
    mutate: (registry: SharedServerRegistry) => T,
  ): Promise<T> {
    return withRegistryLock(this.registryPaths, async () => {
      const registry = pruneRegistry(
        readRegistryFile(this.registryPaths.file, this.endpoint),
        this.deps.isProcessAlive,
      )

      const result = mutate(registry)
      persistRegistry(this.registryPaths.file, registry)
      return result
    })
  }

  private snapshotInstance(): SharedServerInstanceRecord {
    return {
      ...this.instance,
      updatedAt: this.toIso(this.deps.now()),
    }
  }

  private report(
    message: string,
    detail: string,
    stateKey: string,
    force = false,
  ): void {
    if (!force && this.lastStateKey === stateKey) {
      return
    }

    this.lastStateKey = stateKey
    this.log(message, detail)
  }

  private toIso(value: number): string {
    return new Date(value).toISOString()
  }
}

function createRegistryPaths(
  endpoint: string,
  rootDir: string,
): { file: string; lock: string } {
  const key = createHash("sha1").update(endpoint).digest("hex")
  return {
    file: join(rootDir, `${key}.json`),
    lock: join(rootDir, `${key}.lock`),
  }
}

function formatInstanceLabel(instance: Pick<SharedServerInstanceRecord, "pid" | "projectId" | "projectRoot">): string {
  const primary = instance.projectId
    || instance.projectRoot
    || `pid=${instance.pid}`
  const details = [`pid=${instance.pid}`]

  if (instance.projectRoot && instance.projectRoot !== instance.projectId) {
    details.push(`root=${instance.projectRoot}`)
  }

  if (primary === `pid=${instance.pid}`) {
    return primary
  }

  return `${primary} (${details.join(", ")})`
}

function createEmptyRegistry(endpoint: string): SharedServerRegistry {
  return {
    version: COORDINATOR_VERSION,
    endpoint,
    instances: {},
  }
}

function clearOwner(registry: SharedServerRegistry): void {
  delete registry.ownerInstanceId
  delete registry.ownerPid
  delete registry.ownerProjectId
  delete registry.ownerProjectRoot
  delete registry.childPid
}

function resolveOwner(registry: SharedServerRegistry): SharedServerInstanceRecord | null {
  if (!registry.ownerInstanceId) {
    return null
  }

  return registry.instances[registry.ownerInstanceId] ?? null
}

function readRegistryFile(file: string, endpoint: string): SharedServerRegistry {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SharedServerRegistry>
    return normalizeRegistry(parsed, endpoint)
  } catch {
    return createEmptyRegistry(endpoint)
  }
}

function normalizeRegistry(
  raw: Partial<SharedServerRegistry>,
  endpoint: string,
): SharedServerRegistry {
  const instances: Record<string, SharedServerInstanceRecord> = {}
  for (const [id, instance] of Object.entries(raw.instances ?? {})) {
    const typed = instance as Partial<SharedServerInstanceRecord>
    if (!typed || typeof typed.pid !== "number") {
      continue
    }

    instances[id] = {
      id,
      pid: typed.pid,
      projectId: typed.projectId?.trim() || undefined,
      projectRoot: typed.projectRoot?.trim() || undefined,
      createdAt: typed.createdAt || new Date(0).toISOString(),
      updatedAt: typed.updatedAt || new Date(0).toISOString(),
    }
  }

  const normalized: SharedServerRegistry = {
    version: COORDINATOR_VERSION,
    endpoint,
    instances,
  }

  if (typeof raw.ownerInstanceId === "string") {
    normalized.ownerInstanceId = raw.ownerInstanceId
  }
  if (typeof raw.ownerPid === "number") {
    normalized.ownerPid = raw.ownerPid
  }
  if (typeof raw.ownerProjectId === "string" && raw.ownerProjectId.trim()) {
    normalized.ownerProjectId = raw.ownerProjectId.trim()
  }
  if (typeof raw.ownerProjectRoot === "string" && raw.ownerProjectRoot.trim()) {
    normalized.ownerProjectRoot = raw.ownerProjectRoot.trim()
  }
  if (typeof raw.childPid === "number") {
    normalized.childPid = raw.childPid
  }

  return normalized
}

function pruneRegistry(
  registry: SharedServerRegistry,
  isProcessAlive: (pid: number) => boolean,
): SharedServerRegistry {
  for (const [id, instance] of Object.entries(registry.instances)) {
    if (!isProcessAlive(instance.pid)) {
      delete registry.instances[id]
    }
  }

  if (registry.ownerInstanceId && !registry.instances[registry.ownerInstanceId]) {
    clearOwner(registry)
  }

  return registry
}

function cloneRegistry(registry: SharedServerRegistry): SharedServerRegistry {
  return {
    ...registry,
    instances: Object.fromEntries(
      Object.entries(registry.instances).map(([id, instance]) => [id, { ...instance }]),
    ),
  }
}

function persistRegistry(
  file: string,
  registry: SharedServerRegistry,
): void {
  mkdirSync(dirname(file), { recursive: true })

  if (!registry.ownerInstanceId && Object.keys(registry.instances).length === 0) {
    rmSync(file, { force: true })
    return
  }

  writeFileSync(file, JSON.stringify(registry, null, 2))
}

async function withRegistryLock<T>(
  paths: { file: string; lock: string },
  task: () => Promise<T>,
): Promise<T> {
  mkdirSync(dirname(paths.file), { recursive: true })
  const startedAt = Date.now()

  while (true) {
    try {
      mkdirSync(paths.lock)
      break
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== "EEXIST") {
        throw error
      }

      try {
        const age = Date.now() - statSync(paths.lock).mtimeMs
        if (age > STALE_LOCK_MS) {
          rmSync(paths.lock, { recursive: true, force: true })
          continue
        }
      } catch {
        // Ignore transient stat/unlink races and retry.
      }

      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for the shared companion lock at ${paths.lock}`)
      }

      await wait(LOCK_RETRY_MS)
    }
  }

  try {
    return await task()
  } finally {
    rmSync(paths.lock, { recursive: true, force: true })
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
