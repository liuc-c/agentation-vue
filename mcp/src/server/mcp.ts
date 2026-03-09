import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { randomUUID } from "crypto"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import {
  filterSessionsByProject,
  groupSessionsByProject,
  inferProjectKey,
} from "./project-scope.js"
import type {
  AnnotationStatus,
  AnnotationV2,
  Session,
  SessionWithAnnotationsV2,
} from "../types.js"

let httpBaseUrl = "http://localhost:4747"
let apiKey: string | undefined

export function setHttpBaseUrl(url: string): void {
  httpBaseUrl = url.replace(/\/+$/, "")
}

export function setApiKey(key: string): void {
  apiKey = key
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

interface PendingResponse {
  count: number
  annotations: AnnotationV2[]
}

interface AgentContextMetadata {
  project_area?: string
  context_hints?: string[]
}

const ListProjectsSchema = z.object({
  projectFilter: z.string().optional(),
})

const GetSessionSchema = z.object({
  sessionId: z.string(),
})

const GetPendingSchema = z.object({
  sessionId: z.string().optional(),
  projectFilter: z.string().optional(),
})

const StatusSchema = z.object({
  annotationId: z.string(),
})

const ResolveSchema = z.object({
  annotationId: z.string(),
  summary: z.string().optional(),
})

const DismissSchema = z.object({
  annotationId: z.string(),
  reason: z.string().min(1),
})

const ReplySchema = z.object({
  annotationId: z.string(),
  message: z.string().min(1),
})

const WatchSchema = z.object({
  sessionId: z.string().optional(),
  projectFilter: z.string().optional(),
  batchWindowSeconds: z.number().optional().default(5),
  timeoutSeconds: z.number().optional().default(120),
})

const DeleteProjectSchema = z.object({
  projectFilter: z.string().min(1),
  confirm: z.boolean().optional().default(false),
})

export const TOOLS = [
  {
    name: "agentation_v2_list_projects",
    description: "List project groups currently tracked by the shared Agentation V2 server.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectFilter: {
          type: "string",
          description: "Optional fuzzy filter against projectId, host, origin, pathname, or inferred project key.",
        },
      },
      required: [],
    },
  },
  {
    name: "agentation_v2_get_session",
    description: "Get one V2 session with workflow fields, source mapping, and agent-friendly metadata.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Exact session ID to inspect.",
        },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "agentation_v2_get_pending",
    description: "Get pending V2 annotations. Requires an explicit project filter when multiple projects share the server.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Exact session ID to scope to.",
        },
        projectFilter: {
          type: "string",
          description: "Project filter to scope to when multiple projects share the server.",
        },
      },
      required: [],
    },
  },
  {
    name: "agentation_v2_acknowledge",
    description: "Mark an annotation as acknowledged so the browser reflects that the agent has picked it up.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotationId: {
          type: "string",
          description: "Exact annotation ID.",
        },
      },
      required: ["annotationId"],
    },
  },
  {
    name: "agentation_v2_resolve",
    description: "Resolve an annotation and optionally add a short completion summary to the thread.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotationId: {
          type: "string",
          description: "Exact annotation ID.",
        },
        summary: {
          type: "string",
          description: "Optional summary to append as an agent reply.",
        },
      },
      required: ["annotationId"],
    },
  },
  {
    name: "agentation_v2_dismiss",
    description: "Dismiss an annotation and record the reason in the thread.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotationId: {
          type: "string",
          description: "Exact annotation ID.",
        },
        reason: {
          type: "string",
          description: "Why the annotation is being dismissed.",
        },
      },
      required: ["annotationId", "reason"],
    },
  },
  {
    name: "agentation_v2_reply",
    description: "Reply to an annotation thread without changing its workflow status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        annotationId: {
          type: "string",
          description: "Exact annotation ID.",
        },
        message: {
          type: "string",
          description: "Reply text.",
        },
      },
      required: ["annotationId", "message"],
    },
  },
  {
    name: "agentation_v2_watch_annotations",
    description: "Block until pending V2 annotations are available, then return a scoped batch. Requires explicit scope when multiple projects share the server.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "Exact session ID to watch.",
        },
        projectFilter: {
          type: "string",
          description: "Project filter when using the shared server mode.",
        },
        batchWindowSeconds: {
          type: "number",
          description: "Seconds to keep collecting after the first annotation arrives. Default 5, max 30.",
        },
        timeoutSeconds: {
          type: "number",
          description: "Maximum wait time for the first annotation. Default 120, max 300.",
        },
      },
      required: [],
    },
  },
  {
    name: "agentation_v2_delete_project_annotations",
    description: "Dangerous operation. Preview or delete all annotations for one project filter. Requires confirm=true to execute.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectFilter: {
          type: "string",
          description: "Explicit project filter. Required for safety.",
        },
        confirm: {
          type: "boolean",
          description: "Set true to actually delete. Omit or false for preview.",
        },
      },
      required: ["projectFilter"],
    },
  },
] as const

function success(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  }
}

export function error(message: string, details?: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: details == null
          ? message
          : JSON.stringify({ error: message, details }, null, 2),
      },
    ],
    isError: true,
  }
}

async function httpRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (apiKey) {
    headers.set("x-api-key", apiKey)
  }

  const response = await fetch(`${httpBaseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status}: ${body}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

async function httpGet<T>(path: string): Promise<T> {
  return httpRequest<T>(path)
}

async function httpPatch<T>(path: string, body: unknown): Promise<T> {
  return httpRequest<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function httpPost<T>(path: string, body: unknown): Promise<T> {
  return httpRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function httpDelete<T>(path: string): Promise<T> {
  return httpRequest<T>(path, {
    method: "DELETE",
  })
}

function annotationMetadata(annotation: AnnotationV2): AgentContextMetadata {
  return (annotation.metadata ?? {}) as AgentContextMetadata
}

function summarizeAnnotation(annotation: AnnotationV2) {
  const metadata = annotationMetadata(annotation)
  const source = annotation.source
  const location = source.line != null
    ? `${source.file}:${source.line}${source.column != null ? `:${source.column}` : ""}`
    : source.file

  return {
    id: annotation.id,
    status: annotation.status ?? "pending",
    intent: annotation.intent ?? null,
    severity: annotation.severity ?? null,
    element: annotation.elementSelector,
    comment: annotation.comment,
    projectArea: metadata.project_area ?? null,
    contextHints: metadata.context_hints ?? [],
    url: annotation.url,
    component: source.componentName,
    componentHierarchy: source.componentHierarchy ?? null,
    source: location,
    updatedAt: annotation.updatedAt ?? annotation.createdAt ?? annotation.timestamp,
  }
}

function summarizeSession(session: SessionWithAnnotationsV2) {
  const pendingCount = session.annotations.filter((annotation) =>
    (annotation.status ?? "pending") === "pending"
  ).length

  return {
    id: session.id,
    projectKey: inferProjectKey(session),
    projectId: session.projectId ?? null,
    url: session.url,
    status: session.status,
    createdAt: session.createdAt,
    annotationCount: session.annotations.length,
    pendingCount,
  }
}

async function fetchSessions(projectFilter?: string): Promise<Session[]> {
  const query = projectFilter?.trim()
    ? `?projectFilter=${encodeURIComponent(projectFilter)}`
    : ""

  return httpGet<Session[]>(`/v2/sessions${query}`)
}

async function fetchSession(sessionId: string): Promise<SessionWithAnnotationsV2> {
  return httpGet<SessionWithAnnotationsV2>(`/v2/sessions/${sessionId}`)
}

async function fetchPending(
  args: { sessionId?: string; projectFilter?: string },
): Promise<PendingResponse> {
  if (args.sessionId) {
    return httpGet<PendingResponse>(`/v2/sessions/${args.sessionId}/pending`)
  }

  const query = args.projectFilter?.trim()
    ? `?projectFilter=${encodeURIComponent(args.projectFilter)}`
    : ""

  return httpGet<PendingResponse>(`/v2/pending${query}`)
}

function buildScopeError(projects: ReturnType<typeof groupSessionsByProject>): ToolResult {
  return error(
    "Multiple projects share this Agentation server. Pass projectFilter (or sessionId) explicitly before reading pending annotations.",
    {
      requiresExplicitScope: true,
      projects,
      suggestion: {
        tool: "agentation_v2_list_projects",
      },
    },
  )
}

async function resolvePendingScope(args: {
  sessionId?: string
  projectFilter?: string
}): Promise<
  | { ok: true; sessions: Session[]; projectFilter?: string }
  | { ok: false; response: ToolResult }
> {
  if (args.sessionId) {
    const session = await fetchSession(args.sessionId)
    return {
      ok: true,
      sessions: [{
        id: session.id,
        url: session.url,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        projectId: session.projectId,
        metadata: session.metadata,
      }],
      projectFilter: args.projectFilter,
    }
  }

  const sessions = await fetchSessions()
  const projectGroups = groupSessionsByProject(sessions)

  if (args.projectFilter?.trim()) {
    const filtered = filterSessionsByProject(sessions, args.projectFilter)
    if (filtered.length === 0) {
      return {
        ok: false,
        response: error(`No sessions matched projectFilter "${args.projectFilter}"`, {
          projects: projectGroups,
        }),
      }
    }

    return {
      ok: true,
      sessions: filtered,
      projectFilter: args.projectFilter,
    }
  }

  if (projectGroups.length <= 1) {
    return {
      ok: true,
      sessions,
      projectFilter: projectGroups[0]?.projectKey,
    }
  }

  return {
    ok: false,
    response: buildScopeError(projectGroups),
  }
}

type WatchResult =
  | { type: "annotations"; annotations: AnnotationV2[]; sessionIds: string[] }
  | { type: "timeout" }
  | { type: "error"; message: string }

function watchForAnnotations(
  args: {
    sessionId?: string
    projectFilter?: string
  },
  batchWindowMs: number,
  timeoutMs: number,
): Promise<WatchResult> {
  return new Promise((resolve) => {
    let aborted = false
    const controller = new AbortController()
    let batchTimer: ReturnType<typeof setTimeout> | null = null
    const collected = new Map<string, AnnotationV2>()
    const sessionIds = new Set<string>()

    const sseUrl = args.sessionId
      ? `${httpBaseUrl}/v2/sessions/${args.sessionId}/events`
      : `${httpBaseUrl}/v2/events${args.projectFilter ? `?projectFilter=${encodeURIComponent(args.projectFilter)}` : ""}`

    const finish = (result: WatchResult) => {
      if (aborted) return
      aborted = true
      controller.abort()
      if (batchTimer) {
        clearTimeout(batchTimer)
      }
      clearTimeout(timeoutId)
      resolve(result)
    }

    const timeoutId = setTimeout(() => {
      finish({ type: "timeout" })
    }, timeoutMs)

    fetch(sseUrl, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    })
      .then(async (response) => {
        if (!response.ok) {
          finish({
            type: "error",
            message: `MCP event stream failed with HTTP ${response.status}`,
          })
          return
        }

        if (!response.body) {
          finish({
            type: "error",
            message: "MCP event stream returned no body",
          })
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) {
            if (collected.size > 0) {
              finish({
                type: "annotations",
                annotations: [...collected.values()],
                sessionIds: [...sessionIds],
              })
            } else {
              finish({
                type: "error",
                message: "MCP event stream closed unexpectedly",
              })
            }
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split("\n\n")
          buffer = events.pop() || ""

          for (const rawEvent of events) {
            const dataLine = rawEvent
              .split("\n")
              .find((line) => line.startsWith("data: "))

            if (!dataLine) continue

            try {
              const event = JSON.parse(dataLine.slice(6)) as {
                type?: string
                sessionId?: string
                payload?: AnnotationV2
                sequence?: number
              }

              if (event.type !== "annotation.created") continue
              if (!event.payload?.id) continue
              if (event.sequence === 0) continue

              collected.set(event.payload.id, event.payload)
              if (event.sessionId) {
                sessionIds.add(event.sessionId)
              }

              if (!batchTimer) {
                batchTimer = setTimeout(() => {
                  finish({
                    type: "annotations",
                    annotations: [...collected.values()],
                    sessionIds: [...sessionIds],
                  })
                }, batchWindowMs)
              }
            } catch {
              // Ignore individual malformed events.
            }
          }
        }
      })
      .catch((err) => {
        if (aborted) return
        finish({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown event stream error",
        })
      })
  })
}

export async function handleTool(name: string, args: unknown): Promise<ToolResult> {
  switch (name) {
    case "agentation_v2_list_projects": {
      const { projectFilter } = ListProjectsSchema.parse(args ?? {})
      const sessions = await fetchSessions(projectFilter)
      const projects = groupSessionsByProject(sessions)
      return success({
        count: projects.length,
        projects,
      })
    }

    case "agentation_v2_get_session": {
      const { sessionId } = GetSessionSchema.parse(args)
      try {
        const session = await fetchSession(sessionId)
        return success({
          session: summarizeSession(session),
          annotations: session.annotations.map(summarizeAnnotation),
        })
      } catch (err) {
        if ((err as Error).message.includes("404")) {
          return error(`Session not found: ${sessionId}`)
        }
        throw err
      }
    }

    case "agentation_v2_get_pending": {
      const parsed = GetPendingSchema.parse(args ?? {})
      const scope = await resolvePendingScope(parsed)
      if (!scope.ok) {
        return scope.response
      }

      const pending = await fetchPending({
        sessionId: parsed.sessionId,
        projectFilter: parsed.sessionId ? undefined : scope.projectFilter,
      })

      return success({
        count: pending.count,
        scopedSessions: scope.sessions.map((session) => ({
          id: session.id,
          projectKey: inferProjectKey(session),
          url: session.url,
        })),
        annotations: pending.annotations.map(summarizeAnnotation),
      })
    }

    case "agentation_v2_acknowledge": {
      const { annotationId } = StatusSchema.parse(args)
      try {
        const annotation = await httpPatch<AnnotationV2>(`/v2/annotations/${annotationId}`, {
          status: "acknowledged" satisfies AnnotationStatus,
        })
        return success({
          acknowledged: true,
          annotation: summarizeAnnotation(annotation),
        })
      } catch (err) {
        if ((err as Error).message.includes("404")) {
          return error(`Annotation not found: ${annotationId}`)
        }
        throw err
      }
    }

    case "agentation_v2_resolve": {
      const { annotationId, summary } = ResolveSchema.parse(args)
      try {
        const annotation = await httpPatch<AnnotationV2>(`/v2/annotations/${annotationId}`, {
          status: "resolved" satisfies AnnotationStatus,
          resolvedBy: "agent",
        })
        if (summary?.trim()) {
          await httpPost(`/v2/annotations/${annotationId}/thread`, {
            role: "agent",
            content: summary.trim(),
          })
        }
        return success({
          resolved: true,
          annotation: summarizeAnnotation(annotation),
          summary: summary ?? null,
        })
      } catch (err) {
        if ((err as Error).message.includes("404")) {
          return error(`Annotation not found: ${annotationId}`)
        }
        throw err
      }
    }

    case "agentation_v2_dismiss": {
      const { annotationId, reason } = DismissSchema.parse(args)
      try {
        const annotation = await httpPatch<AnnotationV2>(`/v2/annotations/${annotationId}`, {
          status: "dismissed" satisfies AnnotationStatus,
          resolvedBy: "agent",
        })
        await httpPost(`/v2/annotations/${annotationId}/thread`, {
          role: "agent",
          content: reason.trim(),
        })
        return success({
          dismissed: true,
          annotation: summarizeAnnotation(annotation),
          reason,
        })
      } catch (err) {
        if ((err as Error).message.includes("404")) {
          return error(`Annotation not found: ${annotationId}`)
        }
        throw err
      }
    }

    case "agentation_v2_reply": {
      const { annotationId, message } = ReplySchema.parse(args)
      try {
        const annotation = await httpPost<AnnotationV2>(`/v2/annotations/${annotationId}/thread`, {
          role: "agent",
          content: message.trim(),
        })
        return success({
          replied: true,
          annotation: summarizeAnnotation(annotation),
          message,
        })
      } catch (err) {
        if ((err as Error).message.includes("404")) {
          return error(`Annotation not found: ${annotationId}`)
        }
        throw err
      }
    }

    case "agentation_v2_watch_annotations": {
      const parsed = WatchSchema.parse(args ?? {})
      const batchWindowSeconds = Math.min(30, Math.max(1, parsed.batchWindowSeconds ?? 5))
      const timeoutSeconds = Math.min(300, Math.max(1, parsed.timeoutSeconds ?? 120))

      const scope = await resolvePendingScope(parsed)
      if (!scope.ok) {
        return scope.response
      }

      const pending = await fetchPending({
        sessionId: parsed.sessionId,
        projectFilter: parsed.sessionId ? undefined : scope.projectFilter,
      })

      if (pending.count > 0) {
        return success({
          timeout: false,
          count: pending.count,
          scopedSessions: scope.sessions.map((session) => ({
            id: session.id,
            projectKey: inferProjectKey(session),
            url: session.url,
          })),
          annotations: pending.annotations.map(summarizeAnnotation),
        })
      }

      const result = await watchForAnnotations(
        {
          sessionId: parsed.sessionId,
          projectFilter: parsed.sessionId ? undefined : scope.projectFilter,
        },
        batchWindowSeconds * 1000,
        timeoutSeconds * 1000,
      )

      switch (result.type) {
        case "annotations":
          return success({
            timeout: false,
            count: result.annotations.length,
            sessionIds: result.sessionIds,
            annotations: result.annotations.map(summarizeAnnotation),
          })
        case "timeout":
          return success({
            timeout: true,
            message: `No new annotations within ${timeoutSeconds} seconds`,
          })
        case "error":
          return error(result.message)
      }
    }

    case "agentation_v2_delete_project_annotations": {
      const { projectFilter, confirm } = DeleteProjectSchema.parse(args)
      const sessions = await fetchSessions(projectFilter)
      const grouped = groupSessionsByProject(sessions)

      if (sessions.length === 0) {
        return error(`No sessions matched projectFilter "${projectFilter}"`)
      }

      const sessionDetails = await Promise.all(sessions.map((session) => fetchSession(session.id)))
      const annotations = sessionDetails.flatMap((session) => session.annotations)

      if (!confirm) {
        return success({
          confirmRequired: true,
          projectFilter,
          projectGroups: grouped,
          sessionCount: sessionDetails.length,
          annotationCount: annotations.length,
          preview: annotations.slice(0, 20).map(summarizeAnnotation),
        })
      }

      for (const annotation of annotations) {
        await httpDelete(`/v2/annotations/${annotation.id}`)
      }

      return success({
        deleted: true,
        projectFilter,
        sessionCount: sessionDetails.length,
        annotationCount: annotations.length,
      })
    }

    default:
      return error(`Unknown tool: ${name}`)
  }
}

function createToolServer(): Server {
  const server = new Server(
    {
      name: "agentation-v2",
      version: "0.0.1",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS as any }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleTool(request.params.name, request.params.arguments)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      return error(message)
    }
  })

  return server
}

export async function startMcpServer(baseUrl?: string): Promise<void> {
  if (baseUrl) {
    setHttpBaseUrl(baseUrl)
  }

  const server = createToolServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[MCP] Agentation V2 stdio server connected (API: ${httpBaseUrl})`)
}

const streamableTransports = new Map<string, StreamableHTTPServerTransport>()
const sseTransports = new Map<string, SSEServerTransport>()

function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  })
  res.end()
}

function createStreamableSession(): {
  server: Server
  transport: StreamableHTTPServerTransport
} {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  const server = createToolServer()
  server.connect(transport)
  return { server, transport }
}

async function handleStreamableHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET"
  const sessionId = req.headers["mcp-session-id"] as string | undefined

  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id")
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id")

  if (method === "POST") {
    let transport: StreamableHTTPServerTransport

    if (sessionId) {
      if (!streamableTransports.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found. Please re-initialize." },
          id: null,
        }))
        return
      }

      transport = streamableTransports.get(sessionId)!
    } else {
      const { transport: newTransport } = createStreamableSession()
      transport = newTransport
    }

    try {
      const body = await new Promise<string>((resolve, reject) => {
        let data = ""
        req.on("data", (chunk) => {
          data += chunk
        })
        req.on("end", () => resolve(data))
        req.on("error", reject)
      })

      const parsedBody = body ? JSON.parse(body) : undefined
      await transport.handleRequest(req, res, parsedBody)

      const newSessionId = transport.sessionId
      if (newSessionId && !streamableTransports.has(newSessionId)) {
        streamableTransports.set(newSessionId, transport)
        console.error(`[MCP] Streamable HTTP session created: ${newSessionId}`)
      }
    } catch (err) {
      console.error("[MCP] Streamable HTTP request error:", err)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Internal server error" }))
      }
    }
    return
  }

  if (method === "GET") {
    if (!sessionId || !streamableTransports.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Missing or invalid Mcp-Session-Id" }))
      return
    }

    const transport = streamableTransports.get(sessionId)!
    try {
      await transport.handleRequest(req, res)
    } catch (err) {
      console.error("[MCP] Streamable HTTP SSE error:", err)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Internal server error" }))
      }
    }
    return
  }

  if (method === "DELETE") {
    if (!sessionId || !streamableTransports.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Session not found" }))
      return
    }

    const transport = streamableTransports.get(sessionId)!
    await transport.close()
    streamableTransports.delete(sessionId)
    res.writeHead(204)
    res.end()
    return
  }

  res.writeHead(405, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Method not allowed" }))
}

async function handleLegacySse(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET"
  const url = new URL(req.url || "/", "http://localhost")

  if (method === "GET") {
    const transport = new SSEServerTransport("/messages", res)
    const server = createToolServer()
    await server.connect(transport)

    const sessionId = transport.sessionId
    sseTransports.set(sessionId, transport)
    transport.onclose = () => {
      sseTransports.delete(sessionId)
    }

    console.error(`[MCP] SSE session created: ${sessionId}`)
    return
  }

  if (method === "POST") {
    const sessionId = url.searchParams.get("sessionId")
    if (!sessionId || !sseTransports.has(sessionId)) {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "SSE session not found" }))
      return
    }

    const transport = sseTransports.get(sessionId)!
    let parsedBody: unknown

    try {
      const body = await new Promise<string>((resolve, reject) => {
        let data = ""
        req.on("data", (chunk) => {
          data += chunk
        })
        req.on("end", () => resolve(data))
        req.on("error", reject)
      })
      parsedBody = body ? JSON.parse(body) : undefined
    } catch {
      parsedBody = undefined
    }

    await transport.handlePostMessage(req, res, parsedBody)
    return
  }

  res.writeHead(405, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Method not allowed" }))
}

export function startMcpHttpServer(port: number, baseUrl?: string): void {
  if (baseUrl) {
    setHttpBaseUrl(baseUrl)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`)
    const pathname = url.pathname
    const method = req.method || "GET"

    if (method === "OPTIONS") {
      return handleCors(res)
    }

    if (pathname === "/health" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify({
        status: "ok",
        transport: {
          streamableHttp: `${url.origin}/mcp`,
          sse: `${url.origin}/sse`,
        },
        apiBaseUrl: httpBaseUrl,
      }))
      return
    }

    if (pathname === "/mcp") {
      return handleStreamableHttp(req, res)
    }

    if (pathname === "/sse" || pathname === "/messages") {
      return handleLegacySse(req, res)
    }

    res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
    res.end(JSON.stringify({ error: "Not found" }))
  })

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[MCP] Port ${port} already in use — reusing existing MCP transport server`)
      return
    }

    console.error("[MCP] HTTP transport server error:", error.message)
  })

  server.listen(port, () => {
    console.error(
      `[MCP] Agentation V2 transport listening on http://localhost:${port} (/mcp, /sse) -> API ${httpBaseUrl}`,
    )
  })
}
