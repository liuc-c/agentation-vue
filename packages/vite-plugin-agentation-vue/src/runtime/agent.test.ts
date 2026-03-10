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

      if (url === "http://localhost:4748/v2/sessions/sess-1") {
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

  it("falls back to the current selected agent when a stored legacy agent id is stale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "http://localhost:4748/v2/agents/select") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { agentId?: string }
        if (body.agentId === "claude") {
          return new Response(JSON.stringify({
            error: "Unknown agent: claude",
          }), {
            status: 400,
          })
        }

        if (body.agentId === "codex-acp") {
          return new Response(JSON.stringify({
            projectId: "demo-app",
            agents: [{
              id: "codex-acp",
              label: "Codex CLI",
              kind: "codex",
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

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4748/v2/agents/select",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-app",
          agentId: "claude",
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4748/v2/agents/select",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          projectId: "demo-app",
          agentId: "codex-acp",
        }),
      }),
    )
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "agentation-vue-agent-selection-by-project",
      JSON.stringify({
        "demo-app": "codex-acp",
      }),
    )

    bridge.dispose()
  })
})
