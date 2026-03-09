/**
 * HTTP server for the Agentation V2 API.
 * This process is the single source of truth for browser sync state.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http"
import {
  createSession,
  getAnnotationV2,
  getEventsSince,
  getPendingAnnotationsV2,
  getSession,
  getSessionWithAnnotationsV2,
  listSessions,
  addAnnotationV2,
  addThreadMessageV2,
  deleteAnnotationV2,
  updateAnnotationV2,
  updateAnnotationV2Status,
  updateSessionProjectId,
} from "./store.js"
import { eventBus } from "./events.js"
import {
  filterSessionsByProject,
  matchesProjectFilter,
} from "./project-scope.js"
import type {
  AFSEvent,
  AnnotationV2,
  Session,
  ThreadMessage,
} from "../types.js"

function log(message: string): void {
  process.stderr.write(message + "\n")
}

let cloudApiKey: string | undefined
const CLOUD_API_URL = "https://agentation-mcp-cloud.vercel.app/api"

export function setCloudApiKey(key: string | undefined): void {
  cloudApiKey = key
}

function isCloudMode(): boolean {
  return Boolean(cloudApiKey)
}

const sseConnections = new Set<ServerResponse>()

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>

interface WebhookEventPayload {
  type: "annotation.created" | "annotation.updated" | "annotation.deleted" | "thread.message"
  timestamp: string
  session: Session | undefined
  annotation?: AnnotationV2
  message?: ThreadMessage
}

function getWebhookUrls(): string[] {
  const urls: string[] = []
  const singleUrl = process.env.AGENTATION_WEBHOOK_URL
  if (singleUrl) {
    urls.push(singleUrl.trim())
  }

  const multipleUrls = process.env.AGENTATION_WEBHOOKS
  if (multipleUrls) {
    urls.push(
      ...multipleUrls
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
    )
  }

  return urls
}

function sendWebhooks(payload: WebhookEventPayload): void {
  const webhookUrls = getWebhookUrls()
  if (webhookUrls.length === 0) return

  const body = JSON.stringify(payload)

  for (const url of webhookUrls) {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Agentation-Webhook/2.0",
      },
      body,
    })
      .then((response) => {
        log(`[Webhook] POST ${url} -> ${response.status} ${response.statusText}`)
      })
      .catch((error) => {
        console.error(`[Webhook] POST ${url} failed:`, (error as Error).message)
      })
  }
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error("Invalid JSON"))
      }
    })
    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  })
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message })
}

function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Last-Event-ID",
    "Access-Control-Max-Age": "86400",
  })
  res.end()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAnnotationV2Payload(payload: unknown): payload is AnnotationV2 {
  return isPlainObject(payload)
    && payload.schemaVersion === 1
    && typeof payload.elementSelector === "string"
    && isPlainObject(payload.source)
}

function isSessionPayload(payload: unknown): payload is Session {
  return isPlainObject(payload)
    && typeof payload.id === "string"
    && typeof payload.url === "string"
}

function isV2Event(event: AFSEvent): boolean {
  return isSessionPayload(event.payload) || isAnnotationV2Payload(event.payload)
}

async function proxyToCloud(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const method = req.method || "GET"
  const cloudUrl = `${CLOUD_API_URL}${pathname}`

  const headers: Record<string, string> = {
    "x-api-key": cloudApiKey!,
  }

  if (req.headers["content-type"]) {
    headers["Content-Type"] = req.headers["content-type"]
  }

  let body: string | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise<string>((resolve, reject) => {
      let data = ""
      req.on("data", (chunk) => {
        data += chunk
      })
      req.on("end", () => resolve(data))
      req.on("error", reject)
    })
  }

  try {
    const response = await fetch(cloudUrl, {
      method,
      headers,
      body,
    })

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      res.writeHead(response.status, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })

      const reader = response.body?.getReader()
      if (reader) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
          res.end()
        }
        pump().catch(() => res.end())

        req.on("close", () => {
          reader.cancel().catch(() => {})
        })
      }
      return
    }

    const data = await response.text()
    res.writeHead(response.status, {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    })
    res.end(data)
  } catch (error) {
    console.error("[Cloud Proxy] Error:", error)
    sendError(res, 502, `Cloud proxy error: ${(error as Error).message}`)
  }
}

function getReplaySequence(req: IncomingMessage): number | null {
  const url = new URL(req.url || "/", "http://localhost")
  const replayToken = req.headers["last-event-id"] ?? url.searchParams.get("since")
  if (!replayToken || Array.isArray(replayToken)) return null

  const parsed = parseInt(replayToken, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function writeSseHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  })
}

function sendSseEvent(res: ServerResponse, event: AFSEvent): void {
  res.write(`event: ${event.type}\n`)
  res.write(`id: ${event.sequence}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function sendFilteredReplay(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  predicate: (event: AFSEvent) => boolean,
): void {
  const replaySequence = getReplaySequence(req)
  if (replaySequence == null) return

  const missedEvents = getEventsSince(sessionId, replaySequence)
  for (const event of missedEvents) {
    if (predicate(event)) {
      sendSseEvent(res, event)
    }
  }
}

function subscribeSessionEvents(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  predicate: (event: AFSEvent) => boolean,
): void {
  writeSseHeaders(res)
  sseConnections.add(res)
  res.write(": connected\n\n")
  sendFilteredReplay(req, res, sessionId, predicate)

  const unsubscribe = eventBus.subscribeToSession(sessionId, (event) => {
    if (predicate(event)) {
      sendSseEvent(res, event)
    }
  })

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n")
  }, 30000)

  req.on("close", () => {
    clearInterval(keepAlive)
    unsubscribe()
    sseConnections.delete(res)
  })
}

function subscribeGlobalEvents(
  req: IncomingMessage,
  res: ServerResponse,
  predicate: (event: AFSEvent) => boolean,
): void {
  writeSseHeaders(res)
  sseConnections.add(res)
  res.write(": connected\n\n")

  const unsubscribe = eventBus.subscribe((event) => {
    if (predicate(event)) {
      sendSseEvent(res, event)
    }
  })

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n")
  }, 30000)

  req.on("close", () => {
    clearInterval(keepAlive)
    unsubscribe()
    sseConnections.delete(res)
  })
}

function buildWebhookPayload(
  type: WebhookEventPayload["type"],
  annotation: AnnotationV2,
  message?: ThreadMessage,
): WebhookEventPayload {
  return {
    type,
    timestamp: new Date().toISOString(),
    session: annotation.sessionId ? getSession(annotation.sessionId) : undefined,
    annotation,
    message,
  }
}

const createSessionHandler: RouteHandler = async (req, res) => {
  try {
    const body = await parseBody<{ url?: string; projectId?: string }>(req)
    if (!body.url) {
      return sendError(res, 400, "url is required")
    }

    const session = createSession(body.url, body.projectId)
    sendJson(res, 201, session)
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const listSessionsHandler: RouteHandler = async (req, res) => {
  const projectFilter = new URL(req.url || "/", "http://localhost")
    .searchParams
    .get("projectFilter")
    ?? undefined

  const sessions = filterSessionsByProject(listSessions(), projectFilter)
  sendJson(res, 200, sessions)
}

const getSessionV2Handler: RouteHandler = async (_req, res, params) => {
  const session = getSessionWithAnnotationsV2(params.id)
  if (!session) {
    return sendError(res, 404, "Session not found")
  }

  sendJson(res, 200, session)
}

const updateSessionV2Handler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<{ projectId?: string }>(req)
    const projectId = body.projectId?.trim()

    if (!projectId) {
      return sendError(res, 400, "projectId is required")
    }

    const session = updateSessionProjectId(params.id, projectId)
    if (!session) {
      return sendError(res, 404, "Session not found")
    }

    sendJson(res, 200, session)
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const addAnnotationV2Handler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<AnnotationV2>(req)

    if (!body.id || !body.comment || !body.elementSelector || !body.source) {
      return sendError(res, 400, "id, comment, elementSelector, and source are required")
    }

    const existing = getAnnotationV2(body.id)
    if (existing) {
      if (existing.sessionId !== params.id) {
        return sendError(res, 409, "Annotation ID already exists in a different session")
      }
      return sendJson(res, 200, existing)
    }

    const annotation = addAnnotationV2(params.id, body)
    if (!annotation) {
      return sendError(res, 404, "Session not found")
    }

    sendWebhooks(buildWebhookPayload("annotation.created", annotation))
    sendJson(res, 201, annotation)
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const updateAnnotationV2Handler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<Partial<AnnotationV2>>(req)

    const existing = getAnnotationV2(params.id)
    if (!existing) {
      return sendError(res, 404, "Annotation not found")
    }

    const {
      status,
      resolvedBy,
      ...rest
    } = body

    let annotation = Object.keys(rest).length > 0
      ? updateAnnotationV2(params.id, rest)
      : existing

    if (status) {
      annotation = updateAnnotationV2Status(params.id, status, resolvedBy) ?? annotation
    } else if (resolvedBy) {
      annotation = updateAnnotationV2(params.id, { resolvedBy }) ?? annotation
    }

    if (!annotation) {
      return sendError(res, 404, "Annotation not found")
    }

    sendWebhooks(buildWebhookPayload("annotation.updated", annotation))
    sendJson(res, 200, annotation)
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const getAnnotationV2Handler: RouteHandler = async (_req, res, params) => {
  const annotation = getAnnotationV2(params.id)
  if (!annotation) {
    return sendError(res, 404, "Annotation not found")
  }

  sendJson(res, 200, annotation)
}

const deleteAnnotationV2Handler: RouteHandler = async (_req, res, params) => {
  const annotation = deleteAnnotationV2(params.id)
  if (!annotation) {
    return sendError(res, 404, "Annotation not found")
  }

  sendWebhooks(buildWebhookPayload("annotation.deleted", annotation))
  sendJson(res, 200, { deleted: true, annotationId: params.id })
}

const getPendingV2Handler: RouteHandler = async (_req, res, params) => {
  const session = getSessionWithAnnotationsV2(params.id)
  if (!session) {
    return sendError(res, 404, "Session not found")
  }

  const annotations = getPendingAnnotationsV2(params.id)
  sendJson(res, 200, { count: annotations.length, annotations })
}

const getAllPendingV2Handler: RouteHandler = async (req, res) => {
  const projectFilter = new URL(req.url || "/", "http://localhost")
    .searchParams
    .get("projectFilter")
    ?? undefined

  const sessions = filterSessionsByProject(listSessions(), projectFilter)
  const annotations = sessions.flatMap((session) => getPendingAnnotationsV2(session.id))

  sendJson(res, 200, { count: annotations.length, annotations })
}

const addThreadV2Handler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<{ role?: "human" | "agent"; content?: string }>(req)
    if (!body.role || !body.content) {
      return sendError(res, 400, "role and content are required")
    }

    const annotation = addThreadMessageV2(params.id, body.role, body.content)
    if (!annotation) {
      return sendError(res, 404, "Annotation not found")
    }

    const message = annotation.thread?.[annotation.thread.length - 1]
    if (message) {
      sendWebhooks(buildWebhookPayload("thread.message", annotation, message))
    }

    sendJson(res, 201, annotation)
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const sseV2Handler: RouteHandler = async (req, res, params) => {
  const session = getSessionWithAnnotationsV2(params.id)
  if (!session) {
    return sendError(res, 404, "Session not found")
  }

  subscribeSessionEvents(req, res, params.id, isV2Event)
}

const globalSseV2Handler: RouteHandler = async (req, res) => {
  const projectFilter = new URL(req.url || "/", "http://localhost")
    .searchParams
    .get("projectFilter")
    ?? undefined

  subscribeGlobalEvents(req, res, (event) => {
    if (!isV2Event(event)) return false

    const session = getSession(event.sessionId)
    if (!session) return false

    return matchesProjectFilter(session, projectFilter)
  })
}

type Route = {
  method: string
  pattern: RegExp
  handler: RouteHandler
  paramNames: string[]
}

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v2\/sessions$/,
    handler: listSessionsHandler,
    paramNames: [],
  },
  {
    method: "POST",
    pattern: /^\/v2\/sessions$/,
    handler: createSessionHandler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/v2\/sessions\/([^/]+)$/,
    handler: getSessionV2Handler,
    paramNames: ["id"],
  },
  {
    method: "PATCH",
    pattern: /^\/v2\/sessions\/([^/]+)$/,
    handler: updateSessionV2Handler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/v2\/sessions\/([^/]+)\/events$/,
    handler: sseV2Handler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/v2\/sessions\/([^/]+)\/pending$/,
    handler: getPendingV2Handler,
    paramNames: ["id"],
  },
  {
    method: "POST",
    pattern: /^\/v2\/sessions\/([^/]+)\/annotations$/,
    handler: addAnnotationV2Handler,
    paramNames: ["id"],
  },
  {
    method: "PATCH",
    pattern: /^\/v2\/annotations\/([^/]+)$/,
    handler: updateAnnotationV2Handler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/v2\/annotations\/([^/]+)$/,
    handler: getAnnotationV2Handler,
    paramNames: ["id"],
  },
  {
    method: "DELETE",
    pattern: /^\/v2\/annotations\/([^/]+)$/,
    handler: deleteAnnotationV2Handler,
    paramNames: ["id"],
  },
  {
    method: "POST",
    pattern: /^\/v2\/annotations\/([^/]+)\/thread$/,
    handler: addThreadV2Handler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/v2\/pending$/,
    handler: getAllPendingV2Handler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/v2\/events$/,
    handler: globalSseV2Handler,
    paramNames: [],
  },
]

function matchRoute(
  method: string,
  pathname: string,
): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue

    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: Record<string, string> = {}
    route.paramNames.forEach((name, index) => {
      params[name] = match[index + 1]
    })
    return { handler: route.handler, params }
  }

  return null
}

export function startHttpServer(port: number, apiKey?: string): void {
  if (apiKey) {
    setCloudApiKey(apiKey)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`)
    const pathname = url.pathname
    const method = req.method || "GET"

    if (method !== "OPTIONS" && pathname !== "/health") {
      log(`[HTTP] ${method} ${pathname}`)
    }

    if (method === "OPTIONS") {
      return handleCors(res)
    }

    if (pathname === "/health" && method === "GET") {
      return sendJson(res, 200, {
        status: "ok",
        mode: isCloudMode() ? "cloud" : "local",
      })
    }

    if (pathname === "/status" && method === "GET") {
      const webhookUrls = getWebhookUrls()
      return sendJson(res, 200, {
        mode: isCloudMode() ? "cloud" : "local",
        webhooksConfigured: webhookUrls.length > 0,
        webhookCount: webhookUrls.length,
        activeEventStreams: sseConnections.size,
      })
    }

    if (isCloudMode()) {
      return proxyToCloud(req, res, pathname + url.search)
    }

    const match = matchRoute(method, pathname)
    if (!match) {
      return sendError(res, 404, "Not found")
    }

    try {
      await match.handler(req, res, match.params)
    } catch (error) {
      console.error("[HTTP] Request error:", error)
      sendError(res, 500, "Internal server error")
    }
  })

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      log(`[HTTP] Port ${port} already in use — reusing existing Agentation API server`)
      return
    }

    log(`[HTTP] Server error: ${error.message}`)
  })

  server.listen(port, () => {
    if (isCloudMode()) {
      log(`[HTTP] Agentation API listening on http://localhost:${port} (cloud mode)`)
      return
    }

    log(`[HTTP] Agentation API listening on http://localhost:${port}`)
  })
}
