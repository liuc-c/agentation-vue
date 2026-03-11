import { once } from "node:events"
import { createServer, type Server } from "node:http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startMcpHttpServer } from "./mcp.js"

function getServerPort(server: Server): number {
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address")
  }

  return address.port
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1")
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

describe("startMcpHttpServer", () => {
  const servers: Server[] = []

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(async () => {
    while (servers.length > 0) {
      await closeServer(servers.pop()!)
    }
    vi.restoreAllMocks()
  })

  it("returns JSON tool responses that rmcp clients can decode", async () => {
    const apiServer = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost")

      if (req.method === "GET" && url.pathname === "/v2/sessions") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify([
          {
            id: "sess-1",
            url: "http://localhost:5173/",
            status: "active",
            createdAt: "2026-03-09T00:00:00.000Z",
            updatedAt: null,
            projectId: "agentation-vue/playgrounds/vue-vite-demo",
            metadata: null,
          },
        ]))
        return
      }

      if (req.method === "GET" && url.pathname === "/v2/pending") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          count: 1,
          annotations: [{
            id: "annotation-1",
            schemaVersion: 1,
            timestamp: "2026-03-09T00:00:00.000Z",
            url: "http://localhost:5173/",
            elementSelector: "p.eyebrow",
            comment: "Need copy update",
            source: {
              framework: "vue",
              componentName: "FeaturePanel",
              file: "src/components/FeaturePanel.vue",
              line: 29,
              resolver: "vue-tracer",
            },
            status: "pending",
            metadata: {
              project_area: "/ :: FeaturePanel :: header",
              context_hints: ["route: /"],
            },
          }],
        }))
        return
      }

      if (req.method === "POST" && url.pathname === "/v2/annotations/annotation-1/claim") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          claimed: true,
          runId: "run-1",
          ttlSeconds: 600,
          annotation: {
            id: "annotation-1",
            schemaVersion: 1,
            timestamp: "2026-03-09T00:00:00.000Z",
            url: "http://localhost:5173/",
            elementSelector: "p.eyebrow",
            comment: "Need copy update",
            source: {
              framework: "vue",
              componentName: "FeaturePanel",
              file: "src/components/FeaturePanel.vue",
              line: 29,
              resolver: "vue-tracer",
            },
            status: "processing",
            processingByAgentId: "codex",
            processingByRunId: "run-1",
            processingStartedAt: "2026-03-09T00:00:00.000Z",
            processingExpiresAt: "2026-03-09T00:10:00.000Z",
            metadata: {
              project_area: "/ :: FeaturePanel :: header",
              context_hints: ["route: /"],
            },
          },
        }))
        return
      }

      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
    })
    servers.push(apiServer)

    let apiPort: number
    try {
      apiPort = await listen(apiServer)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return
      }
      throw error
    }
    const mcpServer = startMcpHttpServer(0, `http://localhost:${apiPort}`)
    servers.push(mcpServer)

    if (!mcpServer.listening) {
      try {
        await Promise.race([
          once(mcpServer, "listening"),
          once(mcpServer, "error").then(([error]) => Promise.reject(error)),
        ])
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EPERM") {
          return
        }
        throw error
      }
    }
    const mcpPort = getServerPort(mcpServer)
    const mcpUrl = `http://localhost:${mcpPort}/mcp`
    const commonHeaders = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    }

    const initializeResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    })

    expect(initializeResponse.headers.get("content-type")).toContain("application/json")
    const sessionId = initializeResponse.headers.get("mcp-session-id")
    expect(sessionId).toBeTruthy()

    const listProjectsResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Mcp-Session-Id": sessionId!,
        "Mcp-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "agentation_v2_list_projects",
          arguments: {
            projectFilter: "agentation-vue/playgrounds/vue-vite-demo",
          },
        },
      }),
    })

    expect(listProjectsResponse.headers.get("content-type")).toContain("application/json")
    const listProjectsJson = await listProjectsResponse.json() as {
      result: { content: Array<{ text: string }> }
    }
    expect(JSON.parse(listProjectsJson.result.content[0].text)).toMatchObject({
      count: 1,
    })

    const pendingResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Mcp-Session-Id": sessionId!,
        "Mcp-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "agentation_v2_get_pending",
          arguments: {
            projectFilter: "agentation-vue/playgrounds/vue-vite-demo",
          },
        },
      }),
    })

    expect(pendingResponse.headers.get("content-type")).toContain("application/json")
    const pendingJson = await pendingResponse.json() as {
      result: { content: Array<{ text: string }> }
    }
    expect(JSON.parse(pendingJson.result.content[0].text)).toMatchObject({
      count: 1,
      annotations: [
        expect.objectContaining({
          component: "FeaturePanel",
          comment: "Need copy update",
        }),
      ],
    })

    const claimResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Mcp-Session-Id": sessionId!,
        "Mcp-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "agentation_v2_claim",
          arguments: {
            annotationId: "annotation-1",
            agentId: "codex",
          },
        },
      }),
    })

    expect(claimResponse.headers.get("content-type")).toContain("application/json")
    const claimJson = await claimResponse.json() as {
      result: { content: Array<{ text: string }> }
    }
    expect(JSON.parse(claimJson.result.content[0].text)).toMatchObject({
      claimed: true,
      runId: "run-1",
      annotation: {
        status: "processing",
        processingByAgentId: "codex",
      },
    })
  })

  it("wakes watch_annotations when a claimed annotation is requeued to pending", async () => {
    const apiServer = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost")

      if (req.method === "GET" && url.pathname === "/v2/sessions") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify([
          {
            id: "sess-1",
            url: "http://localhost:5173/",
            status: "active",
            createdAt: "2026-03-09T00:00:00.000Z",
            updatedAt: null,
            projectId: "agentation-vue/playgrounds/vue-vite-demo",
            metadata: null,
          },
        ]))
        return
      }

      if (req.method === "GET" && url.pathname === "/v2/pending") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          count: 0,
          annotations: [],
        }))
        return
      }

      if (req.method === "GET" && url.pathname === "/v2/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
        res.write(": connected\n\n")

        const timer = setTimeout(() => {
          res.write("event: annotation.updated\n")
          res.write("id: 1\n")
          res.write(`data: ${JSON.stringify({
            type: "annotation.updated",
            sessionId: "sess-1",
            sequence: 1,
            payload: {
              id: "annotation-1",
              schemaVersion: 1,
              timestamp: "2026-03-09T00:00:00.000Z",
              url: "http://localhost:5173/",
              elementSelector: "p.eyebrow",
              comment: "Need copy update",
              source: {
                framework: "vue",
                componentName: "FeaturePanel",
                file: "src/components/FeaturePanel.vue",
                line: 29,
                resolver: "vue-tracer",
              },
              status: "pending",
              metadata: {
                project_area: "/ :: FeaturePanel :: header",
                context_hints: ["route: /"],
              },
            },
          })}\n\n`)
          setTimeout(() => {
            res.end()
          }, 10)
        }, 10)

        req.on("close", () => {
          clearTimeout(timer)
        })
        return
      }

      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
    })
    servers.push(apiServer)

    let apiPort: number
    try {
      apiPort = await listen(apiServer)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return
      }
      throw error
    }

    const mcpServer = startMcpHttpServer(0, `http://localhost:${apiPort}`)
    servers.push(mcpServer)

    if (!mcpServer.listening) {
      try {
        await Promise.race([
          once(mcpServer, "listening"),
          once(mcpServer, "error").then(([error]) => Promise.reject(error)),
        ])
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EPERM") {
          return
        }
        throw error
      }
    }

    const mcpPort = getServerPort(mcpServer)
    const mcpUrl = `http://localhost:${mcpPort}/mcp`
    const commonHeaders = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    }

    const initializeResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    })
    const sessionId = initializeResponse.headers.get("mcp-session-id")
    expect(sessionId).toBeTruthy()

    const watchResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Mcp-Session-Id": sessionId!,
        "Mcp-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "agentation_v2_watch_annotations",
          arguments: {
            projectFilter: "agentation-vue/playgrounds/vue-vite-demo",
            batchWindowSeconds: 1,
            timeoutSeconds: 5,
          },
        },
      }),
    })

    expect(watchResponse.headers.get("content-type")).toContain("application/json")
    const watchJson = await watchResponse.json() as {
      result: { content: Array<{ text: string }> }
    }
    expect(JSON.parse(watchJson.result.content[0].text)).toMatchObject({
      timeout: false,
      count: 1,
      annotations: [
        expect.objectContaining({
          id: "annotation-1",
          status: "pending",
          comment: "Need copy update",
        }),
      ],
    })
  })

  it("allows private-network CORS preflights for MCP transport routes", async () => {
    const mcpServer = startMcpHttpServer(0)
    servers.push(mcpServer)

    if (!mcpServer.listening) {
      try {
        await Promise.race([
          once(mcpServer, "listening"),
          once(mcpServer, "error").then(([error]) => Promise.reject(error)),
        ])
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EPERM") {
          return
        }
        throw error
      }
    }

    const mcpPort = getServerPort(mcpServer)
    const response = await fetch(`http://localhost:${mcpPort}/mcp`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://proxy.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Mcp-Session-Id",
        "Access-Control-Request-Private-Network": "true",
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    expect(response.headers.get("access-control-allow-private-network")).toBe("true")
    expect(response.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id")
  })
})
