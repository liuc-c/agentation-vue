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
})
