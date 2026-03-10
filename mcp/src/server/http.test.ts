import { once } from "node:events"
import type { Server } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  AgentManager: vi.fn(() => ({
    getAvailableAgentCount: vi.fn(() => 0),
    listAgents: vi.fn(() => []),
    getDispatchState: vi.fn(() => undefined),
    selectAgent: vi.fn(() => []),
    connect: vi.fn(async () => []),
    disconnect: vi.fn(async () => []),
    dispatch: vi.fn(async () => undefined),
    cancelDispatch: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => {}),
  })),
}))

vi.mock("./agent-manager.js", () => ({
  AgentManager: mocks.AgentManager,
}))

function getServerPort(server: Server): number {
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address")
  }

  return address.port
}

async function waitForServer(server: Server): Promise<number> {
  if (server.listening) {
    return getServerPort(server)
  }

  await Promise.race([
    once(server, "listening"),
    once(server, "error").then(([error]) => Promise.reject(error)),
  ])

  return getServerPort(server)
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function makeAnnotation(id: string, comment = "Needs work") {
  return {
    id,
    schemaVersion: 1 as const,
    timestamp: "2026-03-10T00:00:00.000Z",
    url: "http://localhost:5173/",
    elementSelector: "button.primary",
    comment,
    source: {
      framework: "vue" as const,
      componentName: "HeroCard",
      file: "src/components/HeroCard.vue",
      line: 42,
      resolver: "vue-tracer",
    },
  }
}

describe("startHttpServer", () => {
  const resources: Array<{ server: Server; clearAll: () => void }> = []

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.AGENTATION_STORE = "memory"
  })

  afterEach(async () => {
    while (resources.length > 0) {
      const { server, clearAll } = resources.pop()!
      clearAll()
      await closeServer(server)
    }
    delete process.env.AGENTATION_STORE
  })

  async function createApiBaseUrl(): Promise<string | null> {
    const { startHttpServer } = await import("./http.js")
    const { clearAll } = await import("./store.js")
    const server = startHttpServer(0)
    resources.push({ server, clearAll })
    let port: number
    try {
      port = await waitForServer(server)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return null
      }
      throw error
    }
    return `http://127.0.0.1:${port}`
  }

  it("allows PATCH updates that echo the current processing status", async () => {
    const baseUrl = await createApiBaseUrl()
    if (!baseUrl) return

    const sessionResponse = await fetch(`${baseUrl}/v2/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "http://localhost:5173/",
        projectId: "demo-app",
      }),
    })
    const session = await sessionResponse.json() as { id: string }

    await fetch(`${baseUrl}/v2/sessions/${session.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeAnnotation("annotation-1")),
    })

    const claimResponse = await fetch(`${baseUrl}/v2/annotations/annotation-1/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "codex",
        runId: "run-1",
      }),
    })
    const claimPayload = await claimResponse.json() as {
      annotation: ReturnType<typeof makeAnnotation> & {
        status: "processing"
        processingByAgentId: string
        processingByRunId: string
        processingStartedAt: string
        processingExpiresAt: string
      }
    }

    const patchResponse = await fetch(`${baseUrl}/v2/annotations/annotation-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...claimPayload.annotation,
        comment: "Updated while processing",
      }),
    })

    expect(patchResponse.status).toBe(200)
    const updated = await patchResponse.json() as {
      comment: string
      status: string
      processingByRunId: string
    }
    expect(updated).toMatchObject({
      comment: "Updated while processing",
      status: "processing",
      processingByRunId: "run-1",
    })
  })

  it("still rejects entering processing through PATCH", async () => {
    const baseUrl = await createApiBaseUrl()
    if (!baseUrl) return

    const sessionResponse = await fetch(`${baseUrl}/v2/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "http://localhost:5173/",
        projectId: "demo-app",
      }),
    })
    const session = await sessionResponse.json() as { id: string }

    await fetch(`${baseUrl}/v2/sessions/${session.id}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeAnnotation("annotation-2")),
    })

    const patchResponse = await fetch(`${baseUrl}/v2/annotations/annotation-2`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...makeAnnotation("annotation-2"),
        status: "processing",
      }),
    })

    expect(patchResponse.status).toBe(400)
    expect(await patchResponse.json()).toEqual({
      error: "Use POST /v2/annotations/:id/claim to enter processing state",
    })
  })
})
