import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const client = {
    start: vi.fn(),
    isRunning: vi.fn(),
    initialize: vi.fn(),
    newSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    subscribe: vi.fn(),
  }

  return {
    loadAgentCatalog: vi.fn(),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    getPendingAnnotationsV2: vi.fn(),
    claimAnnotationV2: vi.fn(),
    releaseAnnotationV2: vi.fn(),
    requeueExpiredProcessingAnnotationsV2: vi.fn(),
    filterSessionsByProject: vi.fn(),
    AcpRuntime: vi.fn(() => client),
    client,
  }
})

vi.mock("./agent-config.js", () => ({
  loadAgentCatalog: mocks.loadAgentCatalog,
}))

vi.mock("./store.js", () => ({
  listSessions: mocks.listSessions,
  getSession: mocks.getSession,
  getPendingAnnotationsV2: mocks.getPendingAnnotationsV2,
  claimAnnotationV2: mocks.claimAnnotationV2,
  releaseAnnotationV2: mocks.releaseAnnotationV2,
  requeueExpiredProcessingAnnotationsV2: mocks.requeueExpiredProcessingAnnotationsV2,
  getSessionWithAnnotationsV2: vi.fn(),
}))

vi.mock("./project-scope.js", () => ({
  filterSessionsByProject: mocks.filterSessionsByProject,
}))

vi.mock("./acp-runtime.js", () => ({
  AcpRuntime: mocks.AcpRuntime,
}))

describe("AgentManager", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.loadAgentCatalog.mockReturnValue({
      configPath: "/tmp/agents.json",
      defaultAgentId: "claude",
      source: "snapshot",
      snapshotSource: "embedded",
      agents: [{
        id: "claude",
        label: "Claude",
        kind: "claude",
        enabled: true,
        transport: "stdio",
        command: "claude-code-acp",
        resolvedCommand: "claude-code-acp",
        args: [],
        env: [],
        cwdStrategy: "projectRoot",
        mcpMode: "inherit-agentation-server",
        available: true,
        status: "available",
      }],
    })
    mocks.listSessions.mockReturnValue([{
      id: "sess-1",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-10T00:00:00.000Z",
      projectId: "demo-app",
      metadata: {
        localProjectRoot: "/tmp/demo-app",
      },
    }])
    mocks.getSession.mockReturnValue({
      id: "sess-1",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-10T00:00:00.000Z",
      projectId: "demo-app",
      metadata: {
        localProjectRoot: "/tmp/demo-app",
      },
    })
    mocks.filterSessionsByProject.mockImplementation((sessions: unknown[]) => sessions)
    mocks.getPendingAnnotationsV2.mockReturnValue([{
      id: "annotation-1",
      schemaVersion: 1,
      timestamp: "2026-03-10T00:00:00.000Z",
      url: "http://localhost:5173/",
      elementSelector: "button.primary",
      comment: "Fix spacing",
      source: {
        framework: "vue",
        componentName: "HeroCard",
        file: "src/components/HeroCard.vue",
        line: 42,
        resolver: "vue-tracer",
      },
      status: "pending",
      metadata: {
        project_area: "/ :: HeroCard :: hero",
      },
    }])
    mocks.claimAnnotationV2.mockImplementation((id: string, claim: { agentId: string; runId: string; processingStartedAt: string; processingExpiresAt: string }) => ({
      id,
      schemaVersion: 1,
      timestamp: "2026-03-10T00:00:00.000Z",
      url: "http://localhost:5173/",
      elementSelector: "button.primary",
      comment: "Fix spacing",
      source: {
        framework: "vue",
        componentName: "HeroCard",
        file: "src/components/HeroCard.vue",
        line: 42,
        resolver: "vue-tracer",
      },
      status: "processing",
      processingByAgentId: claim.agentId,
      processingByRunId: claim.runId,
      processingStartedAt: claim.processingStartedAt,
      processingExpiresAt: claim.processingExpiresAt,
      metadata: {
        project_area: "/ :: HeroCard :: hero",
      },
    }))
    mocks.releaseAnnotationV2.mockReturnValue(undefined)
    mocks.requeueExpiredProcessingAnnotationsV2.mockReturnValue(0)
    mocks.client.subscribe.mockReturnValue(() => {})
    mocks.client.isRunning.mockReturnValue(true)
    mocks.client.start.mockResolvedValue(undefined)
    mocks.client.initialize.mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
      },
    })
    mocks.client.newSession.mockResolvedValue({
      sessionId: "agent-session-1",
    })
    mocks.client.prompt.mockResolvedValue({
      stopReason: "completed",
    })
  })

  it("lists available agents for the current project", async () => {
    const { AgentManager } = await import("./agent-manager.js")
    const manager = new AgentManager({
      httpBaseUrl: "http://localhost:4748",
    })

    const agents = manager.listAgents("demo-app")

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({
      id: "claude",
      isDefault: true,
      isActive: true,
      available: true,
    })
  })

  it("resolves the bundled CLI path from the dist directory layout", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agentation-mcp-dist-"))
    const distDir = join(tempDir, "dist")
    const cliPath = join(distDir, "cli.js")
    mkdirSync(distDir, { recursive: true })
    writeFileSync(cliPath, "", "utf8")

    try {
      const { resolveMcpCliPath } = await import("./agent-manager.js")

      expect(resolveMcpCliPath({
        argvCli: null,
        currentDir: distDir,
        cwd: "/tmp/agentation-mcp-nonexistent",
      })).toBe(cliPath)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("dispatches pending annotations through ACP", async () => {
    const { AgentManager } = await import("./agent-manager.js")
    const manager = new AgentManager({
      httpBaseUrl: "http://localhost:4748",
    })

    const result = await manager.dispatch({
      projectId: "demo-app",
      mode: "manual",
      trigger: "manual.send",
    })

    expect(mocks.client.start).toHaveBeenCalledTimes(1)
    expect(mocks.client.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.client.newSession).toHaveBeenCalledWith(
      "/tmp/demo-app",
      expect.arrayContaining([
        expect.objectContaining({
          name: "agentation",
        }),
      ]),
    )
    expect(mocks.client.prompt).toHaveBeenCalledWith(
      "agent-session-1",
      expect.stringContaining("Fix spacing"),
    )
    expect(mocks.claimAnnotationV2).toHaveBeenCalledWith(
      "annotation-1",
      expect.objectContaining({
        agentId: "claude",
      }),
    )
    expect(result).toMatchObject({
      agentId: "claude",
      state: "succeeded",
      claimedCount: 1,
    })
  })

  it("re-establishes an ACP session before dispatch when the runtime lost its session id", async () => {
    mocks.client.newSession
      .mockResolvedValueOnce({ sessionId: "agent-session-1" })
      .mockResolvedValueOnce({ sessionId: "agent-session-2" })

    const { AgentManager } = await import("./agent-manager.js")
    const manager = new AgentManager({
      httpBaseUrl: "http://localhost:4748",
    })

    await manager.connect("demo-app")
    const runtime = (manager as any).runtimes.get("demo-app::claude")
    runtime.sessionId = undefined

    const result = await manager.dispatch({
      projectId: "demo-app",
      mode: "manual",
      trigger: "manual.send",
    })

    expect(mocks.client.newSession).toHaveBeenCalledTimes(2)
    expect(mocks.client.prompt).toHaveBeenCalledWith(
      "agent-session-2",
      expect.stringContaining("Fix spacing"),
    )
    expect(result).toMatchObject({
      state: "succeeded",
      claimedCount: 1,
    })
  })

  it("skips dispatch when pending annotations are already processing elsewhere", async () => {
    mocks.claimAnnotationV2.mockReturnValue(undefined)

    const { AgentManager } = await import("./agent-manager.js")
    const manager = new AgentManager({
      httpBaseUrl: "http://localhost:4748",
    })

    const result = await manager.dispatch({
      projectId: "demo-app",
      mode: "manual",
      trigger: "manual.send",
    })

    expect(mocks.client.prompt).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      state: "skipped",
      claimedCount: 0,
    })
  })

  it("releases claimed annotations when prompting the agent fails", async () => {
    mocks.client.prompt.mockRejectedValueOnce(new Error("agent crashed"))

    const { AgentManager } = await import("./agent-manager.js")
    const manager = new AgentManager({
      httpBaseUrl: "http://localhost:4748",
    })

    const result = await manager.dispatch({
      projectId: "demo-app",
      mode: "manual",
      trigger: "manual.send",
    })

    expect(mocks.releaseAnnotationV2).toHaveBeenCalledWith("annotation-1", expect.objectContaining({
      agentId: "claude",
    }))
    expect(result).toMatchObject({
      state: "failed",
      claimedCount: 1,
      message: "agent crashed",
    })
  })
})
