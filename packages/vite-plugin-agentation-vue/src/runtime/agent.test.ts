import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

class FakeEventSource {
  static CLOSED = 2

  readyState = 1
  addEventListener = vi.fn()
  close = vi.fn()
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null

  constructor(_url: string) {}
}

describe("createRuntimeAgentBridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("EventSource", FakeEventSource)
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
    })
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "http://localhost:4748/v2/agents?projectId=demo-app") {
        return new Response(JSON.stringify({
          projectId: "demo-app",
          agents: [{
            id: "claude",
            label: "Claude",
            kind: "claude",
            icon: "vscode-icons:file-type-claude",
            availability: "installed",
            available: true,
            status: "ready",
            isDefault: true,
            isActive: true,
          }],
        }))
      }

      if (url === "http://localhost:4748/v2/agents/select") {
        expect(init?.method).toBe("POST")
        return new Response(JSON.stringify({
          projectId: "demo-app",
          agents: [{
            id: "claude",
            label: "Claude",
            kind: "claude",
            icon: "vscode-icons:file-type-claude",
            availability: "installed",
            available: true,
            status: "ready",
            isDefault: true,
            isActive: true,
          }],
        }))
      }

      if (url === "http://localhost:4748/v2/dispatch") {
        expect(init?.method).toBe("POST")
        return new Response(JSON.stringify({
          projectId: "demo-app",
          agents: [{
            id: "claude",
            label: "Claude",
            kind: "claude",
            icon: "vscode-icons:file-type-claude",
            availability: "installed",
            available: true,
            status: "ready",
            isDefault: true,
            isActive: true,
          }],
          dispatch: {
            projectId: "demo-app",
            agentId: "claude",
            mode: "manual",
            trigger: "manual.send",
            state: "succeeded",
            message: "Turn completed",
            updatedAt: "2026-03-10T00:00:00.000Z",
          },
        }))
      }

      if (url === "http://localhost:4748/v2/sessions?projectFilter=demo-app") {
        return new Response(JSON.stringify({
          projectId: "demo-app",
          sessions: [{
            id: "sess-1",
            url: "http://localhost:5173/",
            status: "active",
            createdAt: "2026-03-10T00:00:00.000Z",
            updatedAt: "2026-03-10T00:10:00.000Z",
            projectId: "demo-app",
            annotationCount: 2,
          }],
        }))
      }

      if (url === "http://localhost:4748/v2/sessions/sess-1" && !init?.method) {
        return new Response(JSON.stringify({
          id: "sess-1",
          url: "http://localhost:5173/",
          status: "active",
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:10:00.000Z",
          projectId: "demo-app",
          annotations: [{
            id: "annotation-1",
            schemaVersion: 1,
            timestamp: "2026-03-10T00:00:00.000Z",
            url: "http://localhost:5173/",
            elementSelector: "button.primary",
            comment: "Fix spacing",
            status: "resolved",
            resolvedBy: "agent",
            source: {
              framework: "vue",
              componentName: "HeroCard",
              file: "src/components/HeroCard.vue",
              line: 42,
              resolver: "vue-tracer",
            },
            thread: [{
              id: "thread-1",
              role: "agent",
              content: "Adjusted button spacing.",
              timestamp: "2026-03-10T00:05:00.000Z",
            }],
          }],
        }))
      }

      if (url === "http://localhost:4748/v2/sessions/sess-1" && init?.method === "PATCH") {
        expect(init?.method).toBe("PATCH")
        return new Response(JSON.stringify({
          id: "sess-1",
          url: "http://localhost:5173/",
          status: "closed",
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:12:00.000Z",
          projectId: "demo-app",
        }))
      }

      throw new Error(`Unexpected fetch ${url}`)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads agents and dispatches manual sends through the V2 API", async () => {
    const { createRuntimeAgentBridge } = await import("./agent.ts")
    const bridge = createRuntimeAgentBridge({
      endpoint: "http://localhost:4748",
      projectId: "demo-app",
    })

    await bridge.init("claude", false)
    const list = await bridge.listAgents()
    expect(list.agents).toHaveLength(1)
    expect(list.agents[0]?.id).toBe("claude")

    await bridge.selectAgent("claude")
    const dispatched = await bridge.dispatch("manual", "manual.send")
    expect(dispatched.dispatch?.state).toBe("succeeded")

    bridge.dispose()
  })

  it("lists project sessions and closes a session through the V2 API", async () => {
    const { createRuntimeAgentBridge } = await import("./agent.ts")
    const bridge = createRuntimeAgentBridge({
      endpoint: "http://localhost:4748",
      projectId: "demo-app",
    })

    await bridge.init("claude", false)

    const sessions = await bridge.listSessions()
    expect(sessions.sessions).toHaveLength(1)
    expect(sessions.sessions[0]?.annotationCount).toBe(2)

    const refreshed = await bridge.closeSession("sess-1")
    expect(refreshed.sessions[0]?.id).toBe("sess-1")

    bridge.dispose()
  })

  it("filters closed empty sessions from the session list", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === "http://localhost:4748/v2/agents?projectId=demo-app") {
        return new Response(JSON.stringify({
          projectId: "demo-app",
          agents: [{
            id: "claude",
            label: "Claude",
            kind: "claude",
            availability: "installed",
            available: true,
            status: "ready",
            isDefault: true,
            isActive: true,
          }],
        }))
      }

      if (url === "http://localhost:4748/v2/sessions?projectFilter=demo-app") {
        return new Response(JSON.stringify({
          projectId: "demo-app",
          sessions: [{
            id: "sess-active",
            url: "http://localhost:5173/",
            status: "active",
            createdAt: "2026-03-10T00:00:00.000Z",
            annotationCount: 0,
          }, {
            id: "sess-empty-closed",
            url: "http://localhost:5173/",
            status: "closed",
            createdAt: "2026-03-09T00:00:00.000Z",
            annotationCount: 0,
          }, {
            id: "sess-with-data",
            url: "http://localhost:5173/",
            status: "closed",
            createdAt: "2026-03-08T00:00:00.000Z",
            annotationCount: 2,
          }],
        }))
      }

      throw new Error(`Unexpected fetch ${url}`)
    }))

    const { createRuntimeAgentBridge } = await import("./agent.ts")
    const bridge = createRuntimeAgentBridge({
      endpoint: "http://localhost:4748",
      projectId: "demo-app",
    })

    await bridge.init("claude", false)

    const sessions = await bridge.listSessions()
    expect(sessions.sessions.map((session) => session.id)).toEqual([
      "sess-active",
      "sess-with-data",
    ])

    bridge.dispose()
  })

  it("loads session details through the V2 API", async () => {
    const { createRuntimeAgentBridge } = await import("./agent.ts")
    const bridge = createRuntimeAgentBridge({
      endpoint: "http://localhost:4748",
      projectId: "demo-app",
    })

    await bridge.init("claude", false)

    const detail = await bridge.getSessionDetail("sess-1")
    expect(detail.annotations).toHaveLength(1)
    expect(detail.annotations[0]?.resolvedBy).toBe("agent")

    bridge.dispose()
  })

  it("skips stale stored agent ids before selecting the current agent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "http://localhost:4748/v2/agents/select") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { agentId?: string }
        if (body.agentId === "codex-acp") {
          return new Response(JSON.stringify({
            projectId: "demo-app",
            agents: [{
              id: "codex-acp",
              label: "Codex CLI",
              kind: "codex",
              availability: "installed",
              available: true,
              status: "ready",
              isDefault: false,
              isActive: true,
            }],
          }))
        }
      }

      if (url === "http://localhost:4748/v2/agents?projectId=demo-app") {
        return new Response(JSON.stringify({
          projectId: "demo-app",
          agents: [{
            id: "codex-acp",
            label: "Codex CLI",
            kind: "codex",
            availability: "installed",
            available: true,
            status: "ready",
            isDefault: false,
            isActive: true,
          }],
        }))
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    vi.stubGlobal("fetch", fetchMock)
    vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify({
      "demo-app": "claude",
    }))

    const { createRuntimeAgentBridge } = await import("./agent.ts")
    const bridge = createRuntimeAgentBridge({
      endpoint: "http://localhost:4748",
      projectId: "demo-app",
    })

    await bridge.init("codex-acp", false)

    const selectCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "http://localhost:4748/v2/agents/select")
    expect(selectCalls).toHaveLength(0)
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "agentation-vue-agent-selection-by-project",
      JSON.stringify({
        "demo-app": "codex-acp",
      }),
    )

    bridge.dispose()
  })
})
