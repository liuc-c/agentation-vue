import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const client = {
    start: vi.fn(),
    initialize: vi.fn(),
    createSession: vi.fn(),
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
    filterSessionsByProject: vi.fn(),
    AcpClient: vi.fn(() => client),
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
  getSessionWithAnnotationsV2: vi.fn(),
}))

vi.mock("./project-scope.js", () => ({
  filterSessionsByProject: mocks.filterSessionsByProject,
}))

vi.mock("./acp-client.js", () => ({
  AcpClient: mocks.AcpClient,
}))

describe("AgentManager", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.loadAgentCatalog.mockReturnValue({
      configPath: "/tmp/agents.json",
      defaultAgentId: "claude",
      source: "discovered",
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
    mocks.client.subscribe.mockReturnValue(() => {})
    mocks.client.start.mockResolvedValue(undefined)
    mocks.client.initialize.mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
      },
    })
    mocks.client.createSession.mockResolvedValue({
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
    expect(mocks.client.createSession).toHaveBeenCalledWith(
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
    expect(result).toMatchObject({
      agentId: "claude",
      state: "succeeded",
    })
  })
})
