import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process"
import { Readable, Writable } from "node:stream"
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type InitializeResponse,
  type McpServerStdio,
  type PermissionOption,
  type PromptResponse,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk"

export interface AcpRuntimeOptions {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd: string
  spawnImpl?: typeof spawn
}

export type AcpInitializeResult = InitializeResponse
export type McpServerConfig = McpServerStdio
export type AcpPromptResult = PromptResponse
export type SessionUpdateNotification = SessionNotification

const CLIENT_VERSION = "0.0.12"

export function selectPermissionResponse(
  options: PermissionOption[],
): RequestPermissionResponse {
  const allowed = options.find((option) => option.kind === "allow_once")
    ?? options.find((option) => option.kind === "allow_always")

  if (!allowed) {
    return {
      outcome: { outcome: "cancelled" },
    }
  }

  return {
    outcome: {
      outcome: "selected",
      optionId: allowed.optionId,
    },
  }
}

export function shouldUseWindowsShell(
  command: string,
  platform = process.platform,
): boolean {
  if (platform !== "win32") return false

  const normalized = command.trim().toLowerCase()
  return normalized.endsWith(".cmd") || normalized.endsWith(".bat")
}

export function buildSpawnOptions(
  command: string,
  cwd: string,
  env: Record<string, string>,
  platform = process.platform,
): SpawnOptionsWithoutStdio {
  const useWindowsShell = shouldUseWindowsShell(command, platform)

  return {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "pipe",
    ...(useWindowsShell
      ? {
          shell: true,
          windowsHide: true,
        }
      : {}),
  }
}

export class AcpRuntime {
  private readonly command: string
  private readonly args: string[]
  private readonly env: Record<string, string>
  private readonly cwd: string
  private readonly spawnImpl: typeof spawn
  private readonly listeners = new Set<(notification: SessionUpdateNotification) => void>()

  private child: ChildProcessWithoutNullStreams | null = null
  private connection: ClientSideConnection | null = null
  private exitReason: Error | null = null
  private closePromise: Promise<void> | null = null
  private resolveClosePromise: (() => void) | null = null

  constructor(options: AcpRuntimeOptions) {
    this.command = options.command
    this.args = options.args ?? []
    this.env = options.env ?? {}
    this.cwd = options.cwd
    this.spawnImpl = options.spawnImpl ?? spawn
  }

  async start(): Promise<void> {
    if (this.connection) return

    const child = this.spawnImpl(this.command, this.args, buildSpawnOptions(this.command, this.cwd, this.env))

    this.child = child
    this.exitReason = null
    this.closePromise = new Promise<void>((resolve) => {
      this.resolveClosePromise = resolve
    })

    const client: Client = {
      requestPermission: async ({ options }) => selectPermissionResponse(options),
      sessionUpdate: async (params) => {
        for (const listener of this.listeners) {
          listener(params)
        }
      },
    }

    child.stderr.on("data", () => {
      // stderr is reserved for agent logs
    })
    child.on("error", (error) => {
      this.exitReason = error instanceof Error ? error : new Error(String(error))
      this.connection = null
      this.child = null
      this.resolveClosePromise?.()
    })
    child.on("exit", (code, signal) => {
      this.exitReason = new Error(`ACP agent exited (${signal ?? code ?? "unknown"})`)
      this.connection = null
      this.child = null
      this.resolveClosePromise?.()
    })

    const input = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
    const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
    this.connection = new ClientSideConnection(() => client, ndJsonStream(input, output))
    void this.connection.closed.finally(() => {
      this.connection = null
    })
  }

  private getConnection(): ClientSideConnection {
    if (!this.connection) {
      throw this.exitReason ?? new Error("ACP agent process is not running")
    }

    return this.connection
  }

  subscribe(listener: (notification: SessionUpdateNotification) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  isRunning(): boolean {
    return Boolean(this.child && this.connection)
  }

  async initialize(): Promise<AcpInitializeResult> {
    return this.getConnection().initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: {
        name: "agentation-vue",
        title: "Agentation Vue",
        version: CLIENT_VERSION,
      },
    })
  }

  async newSession(cwd: string, mcpServers: McpServerConfig[]): Promise<{ sessionId: string }> {
    return this.getConnection().newSession({
      cwd,
      mcpServers,
    })
  }

  async loadSession(sessionId: string, cwd: string, mcpServers: McpServerConfig[]): Promise<void> {
    await this.getConnection().loadSession({
      sessionId,
      cwd,
      mcpServers,
    })
  }

  async prompt(sessionId: string, promptText: string): Promise<AcpPromptResult> {
    return this.getConnection().prompt({
      sessionId,
      prompt: [
        {
          type: "text",
          text: promptText,
        },
      ],
    })
  }

  async cancel(sessionId: string): Promise<void> {
    await this.getConnection().cancel({ sessionId })
  }

  async close(): Promise<void> {
    this.listeners.clear()

    const child = this.child
    if (!child) return

    child.kill("SIGTERM")
    await Promise.race([
      this.closePromise ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          if (this.child === child) {
            child.kill("SIGKILL")
          }
          resolve()
        }, 500)
      }),
    ])
  }
}
