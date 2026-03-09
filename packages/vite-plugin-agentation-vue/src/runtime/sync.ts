import {
  createSession as apiCreateSession,
  deleteAnnotation as apiDeleteAnnotation,
  getSession as apiGetSession,
  markAnnotationsSynced,
  getUnsyncedAnnotations,
  loadSessionId,
  resolveV2Endpoint,
  saveAnnotations,
  saveSessionId,
  syncAnnotation,
  updateAnnotation as apiUpdateAnnotation,
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
): RuntimeSyncBridge {
  const pathname = () => window.location.pathname
  const debounceMs = sync.debounceMs ?? 400
  const listeners = new Set<(event: RuntimeSyncEvent) => void>()
  const mcpEndpoint = resolveMcpEndpoint(sync)
  const info: RuntimeSyncInfo = {
    endpoint: sync.endpoint.replace(/\/+$/, ""),
    mcpEndpoint,
    projectId: sync.projectId,
    mcpHttpUrl: mcpEndpoint ? `${mcpEndpoint}/mcp` : undefined,
    mcpSseUrl: mcpEndpoint ? `${mcpEndpoint}/sse` : undefined,
  }

  let sessionId: string | undefined = loadSessionId(pathname(), storage.options) ?? undefined
  let currentPathname = pathname()
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushInFlight: Promise<void> | null = null
  let dirtyWhileFlushing = false
  let eventSource: EventSource | null = null
  let pathWatchTimer: ReturnType<typeof setInterval> | undefined

  function emit(event: RuntimeSyncEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function stopEventSource(): void {
    eventSource?.close()
    eventSource = null
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

    if (sessionId) {
      ensureEventSource(sessionId)
      void reconcileFromServer(sessionId, "remote")
    }
  }

  async function ensureSession(): Promise<string> {
    handlePathChange()
    if (sessionId) {
      ensureEventSource(sessionId)
      return sessionId
    }

    try {
      const session = await apiCreateSession(sync.endpoint, window.location.href, sync.projectId)
      sessionId = session.id
      saveSessionId(pathname(), session.id, storage.options)
      ensureEventSource(session.id)
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
      const sid = await ensureSession()
      const pending = getUnsyncedAnnotations(pathname(), sid, storage.options)

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
}
