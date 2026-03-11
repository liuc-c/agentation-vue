import {
  clearSessionId,
  createSession as apiCreateSession,
  deleteAnnotation as apiDeleteAnnotation,
  getSession as apiGetSession,
  listSessions as apiListSessions,
  markAnnotationsSynced,
  getUnsyncedAnnotations,
  loadSessionId,
  resolveV2Endpoint,
  saveAnnotations,
  saveSessionId,
  syncAnnotation,
  updateAnnotation as apiUpdateAnnotation,
  updateSession as apiUpdateSession,
} from "@liuovo/agentation-vue-core"
import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
import type {
  RuntimeSyncBridge,
  RuntimeSyncEvent,
  RuntimeSyncInfo,
} from "@liuovo/agentation-vue-ui"
import type {
  AgentationStorageBridge,
  AgentationVueSyncOptions,
} from "../types.ts"
import { resolveMcpEndpoint } from "../types.ts"

type StoredAnnotation = AnnotationV2 & { _syncedTo?: string }

export function createRuntimeSyncBridge(
  sync: AgentationVueSyncOptions,
  storage: AgentationStorageBridge,
  projectRoot?: string,
): RuntimeSyncBridge {
  const pathname = () => window.location.pathname
  const debounceMs = sync.debounceMs ?? 400
  const listeners = new Set<(event: RuntimeSyncEvent) => void>()
  const mcpEndpoint = resolveMcpEndpoint(sync)
  const desiredProjectId = sync.projectId?.trim() || undefined
  const info: RuntimeSyncInfo = {
    endpoint: sync.endpoint.replace(/\/+$/, ""),
    mcpEndpoint,
    projectId: desiredProjectId,
    projectRoot,
    mcpHttpUrl: mcpEndpoint ? `${mcpEndpoint}/mcp` : undefined,
    mcpSseUrl: mcpEndpoint ? `${mcpEndpoint}/sse` : undefined,
  }

  let sessionId: string | undefined = loadSessionId(pathname(), storage.options) ?? undefined
  let sessionVerified = false
  let currentPathname = pathname()
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushInFlight: Promise<void> | null = null
  let dirtyWhileFlushing = false
  let eventSource: EventSource | null = null
  let pathWatchTimer: ReturnType<typeof setInterval> | undefined
  const closedSessionIds = new Set<string>()
  let lastPrunedScope: string | null = null

  function emit(event: RuntimeSyncEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function stopEventSource(): void {
    eventSource?.close()
    eventSource = null
  }

  function hasOpenAnnotations(
    annotations: AnnotationV2[],
  ): boolean {
    return annotations.some((annotation) => {
      const status = annotation.status ?? "pending"
      return status === "pending" || status === "acknowledged" || status === "processing"
    })
  }

  async function pruneInactiveProjectSessions(currentSessionId?: string): Promise<void> {
    if (!desiredProjectId) {
      return
    }

    const pruneScope = currentSessionId?.trim() || "__project__"
    if (lastPrunedScope === pruneScope) {
      return
    }

    lastPrunedScope = pruneScope

    try {
      const sessions = await apiListSessions(sync.endpoint, desiredProjectId)
      const staleSessions = sessions.filter((session) =>
        session.id !== currentSessionId && session.status === "active",
      )

      for (const session of staleSessions) {
        try {
          const detail = await apiGetSession(sync.endpoint, session.id)
          if (hasOpenAnnotations(detail.annotations)) {
            continue
          }

          await apiUpdateSession(sync.endpoint, session.id, {
            status: "closed",
          })
          closedSessionIds.add(session.id)
        } catch (err) {
          console.warn("[agentation] Failed to close stale session:", session.id, err)
        }
      }
    } catch (err) {
      console.warn("[agentation] Failed to list project sessions for cleanup:", err)
    }
  }

  function shouldIgnoreKeepaliveCloseError(error: unknown, keepalive: boolean): boolean {
    if (!keepalive) {
      return false
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      return true
    }

    return error instanceof TypeError
      && /failed to fetch/i.test(error.message)
  }

  async function closeCurrentSession(keepalive = false): Promise<void> {
    const sid = sessionId?.trim()
    if (!sid || closedSessionIds.has(sid)) {
      return
    }

    const path = currentPathname
    closedSessionIds.add(sid)
    clearSessionId(path, storage.options)
    stopEventSource()
    sessionId = undefined
    sessionVerified = false
    lastPrunedScope = null

    try {
      await apiUpdateSession(sync.endpoint, sid, {
        status: "closed",
      }, {
        keepalive,
      })
    } catch (err) {
      if (shouldIgnoreKeepaliveCloseError(err, keepalive)) {
        return
      }
      console.warn("[agentation] Failed to close current session:", sid, err)
    }
  }

  async function ensureExistingSession(
    sid: string,
    path = currentPathname,
  ): Promise<boolean> {
    if (sessionVerified) {
      ensureEventSource(sid)
      await pruneInactiveProjectSessions(sid)
      return true
    }

    try {
      const session = await apiGetSession(sync.endpoint, sid)
      sessionVerified = true

      if (session.status === "closed") {
        closedSessionIds.add(sid)
        clearSessionId(path, storage.options)
        stopEventSource()
        sessionId = undefined
        sessionVerified = false
        return false
      }

      const existingProjectId = session.projectId?.trim() || undefined
      const existingProjectRoot = typeof session.metadata?.localProjectRoot === "string"
        ? session.metadata.localProjectRoot
        : undefined

      if ((desiredProjectId && !existingProjectId) || (projectRoot && existingProjectRoot !== projectRoot)) {
        try {
          await apiUpdateSession(sync.endpoint, sid, {
            projectId: desiredProjectId,
            ...(projectRoot ? { metadata: { localProjectRoot: projectRoot } } : {}),
          })
        } catch (err) {
          console.warn("[agentation] Failed to backfill session metadata:", sid, err)
        }
      } else if (desiredProjectId && existingProjectId !== desiredProjectId) {
        clearSessionId(path, storage.options)
        stopEventSource()
        sessionId = undefined
        sessionVerified = false
        return false
      }

      ensureEventSource(sid)
      await pruneInactiveProjectSessions(sid)
      return true
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        clearSessionId(path, storage.options)
        stopEventSource()
        sessionId = undefined
        sessionVerified = false
        return false
      }

      console.warn("[agentation] Failed to verify existing session:", sid, err)
      sessionVerified = true
      ensureEventSource(sid)
      await pruneInactiveProjectSessions(sid)
      return true
    }
  }

  async function reconcileFromServer(
    sid: string,
    source: RuntimeSyncEvent["source"],
  ): Promise<void> {
    try {
      const session = await apiGetSession(sync.endpoint, sid)
      const path = currentPathname
      const unsynced = getUnsyncedAnnotations(path, sid, storage.options) as StoredAnnotation[]
      const merged = new Map<string, StoredAnnotation>()

      for (const annotation of session.annotations) {
        merged.set(annotation.id, {
          ...annotation,
          _syncedTo: sid,
        })
      }

      for (const annotation of unsynced) {
        if (!merged.has(annotation.id)) {
          merged.set(annotation.id, annotation)
        }
      }

      saveAnnotations(path, [...merged.values()], storage.options)
      emit({
        type: "reconciled",
        source,
        annotationCount: session.annotations.length,
      })
    } catch (err) {
      emit({
        type: "error",
        source,
        message: err instanceof Error ? err.message : "Unknown sync reconciliation error",
      })
    }
  }

  function ensureEventSource(sid: string): void {
    if (eventSource) return

    const url = `${resolveV2Endpoint(sync.endpoint)}/sessions/${sid}/events`
    const source = new EventSource(url)
    const onRemoteMutation = () => {
      void reconcileFromServer(sid, "remote")
    }

    source.addEventListener("annotation.created", onRemoteMutation)
    source.addEventListener("annotation.updated", onRemoteMutation)
    source.addEventListener("annotation.deleted", onRemoteMutation)
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED && eventSource === source) {
        eventSource = null
      }
    }

    eventSource = source
  }

  function handlePathChange(): void {
    const current = pathname()
    if (current === currentPathname) return

    currentPathname = current
    stopEventSource()
    sessionId = loadSessionId(current, storage.options) ?? undefined
    sessionVerified = false
    lastPrunedScope = null

    if (sessionId) {
      const sid = sessionId
      void ensureExistingSession(sid, current).then((ready) => {
        if (ready && sessionId === sid) {
          void reconcileFromServer(sid, "remote")
        }
      })
    }
  }

  async function ensureSession(): Promise<string> {
    handlePathChange()
    if (sessionId) {
      const ready = await ensureExistingSession(sessionId)
      if (ready && sessionId) {
        return sessionId
      }
    }

    try {
      const session = await apiCreateSession(
        sync.endpoint,
        window.location.href,
        desiredProjectId,
        projectRoot ? { localProjectRoot: projectRoot } : undefined,
      )
      sessionId = session.id
      sessionVerified = true
      lastPrunedScope = null
      saveSessionId(pathname(), session.id, storage.options)
      ensureEventSource(session.id)
      await pruneInactiveProjectSessions(session.id)
      return session.id
    } catch (err) {
      console.warn("[agentation] Failed to create session:", err)
      throw err
    }
  }

  async function flush(): Promise<void> {
    if (flushInFlight) {
      dirtyWhileFlushing = true
      return flushInFlight
    }

    flushInFlight = (async () => {
      handlePathChange()

      let sid = sessionId?.trim()
      if (sid) {
        const ready = await ensureExistingSession(sid)
        sid = ready && sessionId ? sessionId : undefined
      }

      const pending = getUnsyncedAnnotations(pathname(), sid, storage.options) as StoredAnnotation[]

      if (!sid && pending.length === 0) {
        await pruneInactiveProjectSessions()
        return
      }

      if (!sid) {
        sid = await ensureSession()
      }

      if (pending.length === 0) {
        await reconcileFromServer(sid, "init")
        return
      }

      const syncedIds: string[] = []
      for (const annotation of pending) {
        try {
          await syncAnnotation(sync.endpoint, sid, annotation)
          syncedIds.push(annotation.id)
        } catch (err) {
          console.warn("[agentation] Failed to sync annotation:", annotation.id, err)
        }
      }

      if (syncedIds.length > 0) {
        markAnnotationsSynced(pathname(), syncedIds, sid, storage.options)
      }

      await reconcileFromServer(sid, pending.length > 0 ? "flush" : "init")
    })()
      .catch((err) => {
        console.warn("[agentation] Sync flush failed:", err)
        emit({
          type: "error",
          source: "flush",
          message: err instanceof Error ? err.message : "Unknown sync flush error",
        })
      })
      .finally(() => {
        flushInFlight = null
        if (dirtyWhileFlushing) {
          dirtyWhileFlushing = false
          scheduleFlush()
        }
      })

    return flushInFlight
  }

  function scheduleFlush(): void {
    if (flushTimer != null) {
      clearTimeout(flushTimer)
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush()
    }, debounceMs)
  }

  async function updateRemote(annotation: AnnotationV2): Promise<void> {
    handlePathChange()
    if (!sessionId) {
      scheduleFlush()
      return
    }

    try {
      await apiUpdateAnnotation(sync.endpoint, annotation.id, annotation)
    } catch (err) {
      console.warn("[agentation] Update sync failed, will re-upsert:", annotation.id, err)
      scheduleFlush()
    }
  }

  async function deleteRemote(annotation: AnnotationV2): Promise<void> {
    handlePathChange()
    if (!sessionId) return

    try {
      await apiDeleteAnnotation(sync.endpoint, annotation.id)
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return
      console.warn("[agentation] Delete sync failed:", annotation.id, err)
    }
  }

  return {
    info,

    init() {
      if (sync.autoSync === false) return Promise.resolve()

      pathWatchTimer = pathWatchTimer ?? setInterval(handlePathChange, 500)
      window.removeEventListener("pagehide", onPageHide)
      window.addEventListener("pagehide", onPageHide)
      return flush()
    },

    enqueueUpsert(_annotation: AnnotationV2) {
      if (sync.autoSync === false) return
      scheduleFlush()
    },

    enqueueUpdate(annotation: AnnotationV2) {
      if (sync.autoSync === false) return
      void updateRemote(annotation)
    },

    enqueueDelete(annotation: AnnotationV2) {
      if (sync.autoSync === false) return
      void deleteRemote(annotation)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      window.removeEventListener("pagehide", onPageHide)
      stopEventSource()
      if (flushTimer != null) {
        clearTimeout(flushTimer)
        flushTimer = undefined
      }
      if (pathWatchTimer != null) {
        clearInterval(pathWatchTimer)
        pathWatchTimer = undefined
      }
      listeners.clear()
    },
  }

  function onPageHide(): void {
    void closeCurrentSession(true)
  }
}
