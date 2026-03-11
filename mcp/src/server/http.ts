/**
 * HTTP server for the Agentation V2 API.
 * This process is the single source of truth for browser sync state.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { randomUUID } from "crypto"
import {
  createSession,
  getAnnotationV2,
  getEventsSince,
  getPendingAnnotationsV2,
  getSession,
  getSessionAnnotationsV2,
  getSessionWithAnnotationsV2,
  listSessions,
  addAnnotationV2,
  addThreadMessageV2,
  deleteAnnotationV2,
  updateAnnotationV2,
  updateAnnotationV2Status,
  updateSessionProjectId,
  updateSessionStatus,
  claimAnnotationV2,
  releaseAnnotationV2,
  requeueExpiredProcessingAnnotationsV2,
} from "./store.js"
import { eventBus } from "./events.js"
import { AgentManager } from "./agent-manager.js"
import {
  buildMcpTransportUrls,
  handleMcpTransportRequest,
  isMcpTransportPath,
  setHttpBaseUrl,
} from "./mcp.js"
import {
  filterSessionsByProject,
  matchesProjectFilter,
} from "./project-scope.js"
import type {
  AFSEvent,
  AnnotationV2,
  Session,
  SessionStatus,
  SessionSummary,
  ThreadMessage,
} from "../types.js"

function log(message: string): void {
  process.stderr.write(message + "\n")
}

let cloudApiKey: string | undefined
const CLOUD_API_URL = "https://agentation-mcp-cloud.vercel.app/api"
let agentManager: AgentManager | null = null

export function setCloudApiKey(key: string | undefined): void {
  cloudApiKey = key
}

function isCloudMode(): boolean {
  return Boolean(cloudApiKey)
}

const sseConnections = new Set<ServerResponse>()
const agentSseConnections = new Set<ServerResponse>()

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>

const DEFAULT_PROCESSING_TTL_SECONDS = 600

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

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "active" || value === "approved" || value === "closed"
}

function buildSessionSummary(session: Session): SessionSummary {
  return {
    ...session,
    annotationCount: getSessionAnnotationsV2(session.id).length,
  }
}

function shouldExposeSessionSummary(session: SessionSummary): boolean {
  return session.status !== "closed" || session.annotationCount > 0
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

function cleanupExpiredProcessingAnnotations(): void {
  requeueExpiredProcessingAnnotationsV2()
}

function normalizeTtlSeconds(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value, 10)
      : Number.NaN

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PROCESSING_TTL_SECONDS
  }

  return Math.max(1, Math.floor(parsed))
}

const createSessionHandler: RouteHandler = async (req, res) => {
  try {
    const body = await parseBody<{ url?: string; projectId?: string; metadata?: Record<string, unknown> }>(req)
    if (!body.url) {
      return sendError(res, 400, "url is required")
    }

    const session = createSession(body.url, body.projectId, body.metadata)
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
    .map(buildSessionSummary)
    .filter(shouldExposeSessionSummary)
  sendJson(res, 200, sessions)
}

const getSessionV2Handler: RouteHandler = async (_req, res, params) => {
  cleanupExpiredProcessingAnnotations()
  const session = getSessionWithAnnotationsV2(params.id)
  if (!session) {
    return sendError(res, 404, "Session not found")
  }

  sendJson(res, 200, session)
}

const updateSessionV2Handler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<{
      projectId?: string
      metadata?: Record<string, unknown>
      status?: SessionStatus
    }>(req)
    const projectId = body.projectId?.trim()
    const status = body.status
    if (!projectId && !body.metadata && !status) {
      return sendError(res, 400, "projectId, metadata, or status is required")
    }

    if (status && !isSessionStatus(status)) {
      return sendError(res, 400, "status must be active, approved, or closed")
    }

    let session = getSession(params.id)
    if (!session) {
      return sendError(res, 404, "Session not found")
    }

    if (projectId || body.metadata) {
      session = updateSessionProjectId(params.id, projectId, body.metadata)
      if (!session) {
        return sendError(res, 404, "Session not found")
      }
    }

    if (status) {
      session = updateSessionStatus(params.id, status)
      if (!session) {
        return sendError(res, 404, "Session not found")
      }
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
    cleanupExpiredProcessingAnnotations()
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

    const currentStatus = existing.status ?? "pending"
    const nextStatus = typeof status === "string" ? status : undefined
    const isStatusTransition = Boolean(nextStatus && nextStatus !== currentStatus)

    if (nextStatus === "processing" && currentStatus !== "processing") {
      return sendError(res, 400, "Use POST /v2/annotations/:id/claim to enter processing state")
    }

    const patch = {
      ...rest,
      ...(
        resolvedBy !== undefined
        && (nextStatus ?? currentStatus) !== "processing"
        && !isStatusTransition
          ? { resolvedBy }
          : {}
      ),
    }

    let annotation = Object.keys(patch).length > 0
      ? updateAnnotationV2(params.id, patch)
      : existing

    if (isStatusTransition && nextStatus) {
      annotation = updateAnnotationV2Status(params.id, nextStatus, resolvedBy) ?? annotation
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
  cleanupExpiredProcessingAnnotations()
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
  cleanupExpiredProcessingAnnotations()
  const session = getSessionWithAnnotationsV2(params.id)
  if (!session) {
    return sendError(res, 404, "Session not found")
  }

  const annotations = getPendingAnnotationsV2(params.id)
  sendJson(res, 200, { count: annotations.length, annotations })
}

const getAllPendingV2Handler: RouteHandler = async (req, res) => {
  cleanupExpiredProcessingAnnotations()
  const projectFilter = new URL(req.url || "/", "http://localhost")
    .searchParams
    .get("projectFilter")
    ?? undefined

  const sessions = filterSessionsByProject(listSessions(), projectFilter)
  const annotations = sessions.flatMap((session) => getPendingAnnotationsV2(session.id))

  sendJson(res, 200, { count: annotations.length, annotations })
}

const claimAnnotationV2Handler: RouteHandler = async (req, res, params) => {
  try {
    cleanupExpiredProcessingAnnotations()

    const existing = getAnnotationV2(params.id)
    if (!existing) {
      return sendError(res, 404, "Annotation not found")
    }

    const body = await parseBody<{ agentId?: string; runId?: string; ttlSeconds?: number }>(req)
    const agentId = body.agentId?.trim() || "agent"
    const runId = body.runId?.trim() || randomUUID()
    const ttlSeconds = normalizeTtlSeconds(body.ttlSeconds)
    const now = new Date()
    const annotation = claimAnnotationV2(params.id, {
      agentId,
      runId,
      processingStartedAt: now.toISOString(),
      processingExpiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    })

    if (!annotation) {
      return sendJson(res, 409, {
        claimed: false,
        annotation: getAnnotationV2(params.id),
        error: "Annotation is already being processed or is no longer pending",
      })
    }

    sendWebhooks(buildWebhookPayload("annotation.updated", annotation))
    sendJson(res, 200, {
      claimed: true,
      annotation,
      runId,
      ttlSeconds,
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const releaseAnnotationV2Handler: RouteHandler = async (req, res, params) => {
  try {
    cleanupExpiredProcessingAnnotations()

    const existing = getAnnotationV2(params.id)
    if (!existing) {
      return sendError(res, 404, "Annotation not found")
    }

    const body = await parseBody<{ agentId?: string; runId?: string }>(req)
    const agentId = body.agentId?.trim() || undefined
    const runId = body.runId?.trim() || undefined
    if (!agentId && !runId) {
      return sendError(res, 400, "agentId or runId is required")
    }

    const annotation = releaseAnnotationV2(params.id, { agentId, runId })
    if (!annotation) {
      return sendJson(res, 409, {
        released: false,
        annotation: getAnnotationV2(params.id),
        error: "Annotation is not being processed by this run",
      })
    }

    sendWebhooks(buildWebhookPayload("annotation.updated", annotation))
    sendJson(res, 200, {
      released: true,
      annotation,
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
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

function ensureAgentManager(port: number): AgentManager {
  agentManager = agentManager ?? new AgentManager({
    httpBaseUrl: `http://localhost:${port}`,
  })
  return agentManager
}

function sendAgentEvent(res: ServerResponse, event: unknown, eventType = "agent"): void {
  const resolvedType = eventType === "error" ? "agent-error" : eventType
  res.write(`event: ${resolvedType}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function subscribeAgentEvents(
  req: IncomingMessage,
  res: ServerResponse,
  manager: AgentManager,
  projectId: string,
): void {
  writeSseHeaders(res)
  agentSseConnections.add(res)
  res.write(": connected\n\n")

  const unsubscribe = manager.subscribe((event) => {
    if (event.projectId && event.projectId !== projectId) return
    sendAgentEvent(res, event, event.type)
  })

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n")
  }, 30000)

  req.on("close", () => {
    clearInterval(keepAlive)
    unsubscribe()
    agentSseConnections.delete(res)
  })
}

function requireProjectId(
  body: { projectId?: string } | URLSearchParams,
): string | null {
  const raw = body instanceof URLSearchParams
    ? body.get("projectId")
    : body.projectId
  const projectId = raw?.trim()
  return projectId || null
}

const listAgentsHandler = (port: number): RouteHandler => async (req, res) => {
  const projectId = requireProjectId(new URL(req.url || "/", "http://localhost").searchParams)
  if (!projectId) {
    return sendError(res, 400, "projectId is required")
  }

  const manager = ensureAgentManager(port)
  sendJson(res, 200, {
    projectId,
    agents: manager.listAgents(projectId),
    dispatch: manager.getDispatchState(projectId),
  })
}

const selectAgentHandler = (port: number): RouteHandler => async (req, res) => {
  try {
    const body = await parseBody<{ projectId?: string; agentId?: string }>(req)
    const projectId = requireProjectId(body)
    const agentId = body.agentId?.trim()
    if (!projectId || !agentId) {
      return sendError(res, 400, "projectId and agentId are required")
    }

    const manager = ensureAgentManager(port)
    sendJson(res, 200, {
      projectId,
      agents: manager.selectAgent(projectId, agentId),
      dispatch: manager.getDispatchState(projectId),
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const connectAgentHandler = (port: number): RouteHandler => async (req, res) => {
  try {
    const body = await parseBody<{ projectId?: string; agentId?: string }>(req)
    const projectId = requireProjectId(body)
    if (!projectId) {
      return sendError(res, 400, "projectId is required")
    }

    const manager = ensureAgentManager(port)
    sendJson(res, 200, {
      projectId,
      agents: await manager.connect(projectId, body.agentId?.trim()),
      dispatch: manager.getDispatchState(projectId),
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const disconnectAgentHandler = (port: number): RouteHandler => async (req, res) => {
  try {
    const body = await parseBody<{ projectId?: string; agentId?: string }>(req)
    const projectId = requireProjectId(body)
    if (!projectId) {
      return sendError(res, 400, "projectId is required")
    }

    const manager = ensureAgentManager(port)
    sendJson(res, 200, {
      projectId,
      agents: await manager.disconnect(projectId, body.agentId?.trim()),
      dispatch: manager.getDispatchState(projectId),
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const agentEventsHandler = (port: number): RouteHandler => async (req, res) => {
  const projectId = requireProjectId(new URL(req.url || "/", "http://localhost").searchParams)
  if (!projectId) {
    return sendError(res, 400, "projectId is required")
  }

  subscribeAgentEvents(req, res, ensureAgentManager(port), projectId)
}

const dispatchHandler = (port: number): RouteHandler => async (req, res) => {
  try {
    const body = await parseBody<{
      projectId?: string
      mode?: "auto" | "manual"
      trigger?: "annotation.upsert" | "manual.send"
      sessionId?: string
    }>(req)
    const projectId = requireProjectId(body)
    if (!projectId || !body.mode || !body.trigger) {
      return sendError(res, 400, "projectId, mode, and trigger are required")
    }

    const manager = ensureAgentManager(port)
    const dispatch = await manager.dispatch({
      projectId,
      mode: body.mode,
      trigger: body.trigger,
      sessionId: body.sessionId?.trim() || undefined,
    })
    sendJson(res, dispatch.state === "queued" || dispatch.state === "sending" ? 202 : 200, {
      projectId,
      agents: manager.listAgents(projectId),
      dispatch,
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

const cancelDispatchHandler = (port: number): RouteHandler => async (req, res) => {
  try {
    const body = await parseBody<{ projectId?: string }>(req)
    const projectId = requireProjectId(body)
    if (!projectId) {
      return sendError(res, 400, "projectId is required")
    }

    const manager = ensureAgentManager(port)
    const dispatch = await manager.cancelDispatch(projectId)
    sendJson(res, 200, {
      projectId,
      agents: manager.listAgents(projectId),
      dispatch,
    })
  } catch (error) {
    sendError(res, 400, (error as Error).message)
  }
}

type Route = {
  method: string
  pattern: RegExp
  handler: RouteHandler
  paramNames: string[]
}

function createRoutes(port: number): Route[] {
  return [
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
      method: "POST",
      pattern: /^\/v2\/annotations\/([^/]+)\/claim$/,
      handler: claimAnnotationV2Handler,
      paramNames: ["id"],
    },
    {
      method: "POST",
      pattern: /^\/v2\/annotations\/([^/]+)\/release$/,
      handler: releaseAnnotationV2Handler,
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
    {
      method: "GET",
      pattern: /^\/v2\/agents$/,
      handler: listAgentsHandler(port),
      paramNames: [],
    },
    {
      method: "POST",
      pattern: /^\/v2\/agents\/select$/,
      handler: selectAgentHandler(port),
      paramNames: [],
    },
    {
      method: "POST",
      pattern: /^\/v2\/agents\/connect$/,
      handler: connectAgentHandler(port),
      paramNames: [],
    },
    {
      method: "POST",
      pattern: /^\/v2\/agents\/disconnect$/,
      handler: disconnectAgentHandler(port),
      paramNames: [],
    },
    {
      method: "GET",
      pattern: /^\/v2\/agents\/events$/,
      handler: agentEventsHandler(port),
      paramNames: [],
    },
    {
      method: "POST",
      pattern: /^\/v2\/dispatch$/,
      handler: dispatchHandler(port),
      paramNames: [],
    },
    {
      method: "POST",
      pattern: /^\/v2\/dispatch\/cancel$/,
      handler: cancelDispatchHandler(port),
      paramNames: [],
    },
  ]
}

function matchRoute(
  routes: Route[],
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

export function startHttpServer(port: number, apiKey?: string) {
  if (apiKey) {
    setCloudApiKey(apiKey)
  }

  setHttpBaseUrl(`http://localhost:${port}`)

  const routes = createRoutes(port)
  ensureAgentManager(port)

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`)
    const pathname = url.pathname
    const method = req.method || "GET"

    if (method !== "OPTIONS" && pathname !== "/health") {
      log(`[HTTP] ${method} ${pathname}`)
    }

    if (isMcpTransportPath(pathname)) {
      return handleMcpTransportRequest(req, res, pathname)
    }

    if (method === "OPTIONS") {
      return handleCors(res)
    }

    if (pathname === "/health" && method === "GET") {
      return sendJson(res, 200, {
        status: "ok",
        mode: isCloudMode() ? "cloud" : "local",
        transport: buildMcpTransportUrls(url.origin),
      })
    }

    if (pathname === "/status" && method === "GET") {
      const webhookUrls = getWebhookUrls()
      const manager = ensureAgentManager(port)
      return sendJson(res, 200, {
        mode: isCloudMode() ? "cloud" : "local",
        companionUrl: url.origin,
        transport: buildMcpTransportUrls(url.origin),
        webhooksConfigured: webhookUrls.length > 0,
        webhookCount: webhookUrls.length,
        activeEventStreams: sseConnections.size,
        activeAgentStreams: agentSseConnections.size,
        agentsAvailable: manager.getAvailableAgentCount(),
        agentBridgeEnabled: true,
      })
    }

    if (isCloudMode()) {
      if (pathname.startsWith("/v2/agents") || pathname.startsWith("/v2/dispatch")) {
        return sendError(res, 409, "Local agent bridge is unavailable in cloud mode")
      }
      return proxyToCloud(req, res, pathname + url.search)
    }

    const match = matchRoute(routes, method, pathname)
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

  server.listen(port, "127.0.0.1", () => {
    if (isCloudMode()) {
      log(`[HTTP] Agentation API listening on http://localhost:${port} (cloud mode)`)
      return
    }

    log(`[HTTP] Agentation API listening on http://localhost:${port}`)
  })

  return server
}
