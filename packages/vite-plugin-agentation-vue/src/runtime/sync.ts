import {
  createSession as apiCreateSession,
  syncAnnotation,
  updateAnnotation as apiUpdateAnnotation,
  deleteAnnotation as apiDeleteAnnotation,
} from "@liuovo/agentation-vue-core"
import {
  getUnsyncedAnnotations,
  loadSessionId,
  markAnnotationsSynced,
  saveSessionId,
} from "@liuovo/agentation-vue-core"
import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
import type { RuntimeSyncBridge } from "@liuovo/agentation-vue-ui"
import type { AgentationStorageBridge, AgentationVueSyncOptions } from "../types.js"

/**
 * Creates a sync bridge that connects the local annotation store
 * to the remote MCP server via the V2 HTTP API.
 *
 * - On init, flushes any unsynced annotations to the server.
 * - On enqueueUpsert, debounces a flush to batch rapid saves.
 * - On enqueueDelete, immediately fires a best-effort DELETE.
 */
export function createRuntimeSyncBridge(
  sync: AgentationVueSyncOptions,
  storage: AgentationStorageBridge,
): RuntimeSyncBridge {
  const pathname = () => window.location.pathname
  const debounceMs = sync.debounceMs ?? 400

  let sessionId: string | undefined = loadSessionId(pathname(), storage.options) ?? undefined
  let currentPathname = pathname()
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushInFlight: Promise<void> | null = null
  let dirtyWhileFlushing = false

  /**
   * Re-resolve sessionId when the SPA pathname changes.
   * Called before flush operations to handle client-side routing.
   */
  function watchPathname(): void {
    const current = pathname()
    if (current !== currentPathname) {
      currentPathname = current
      sessionId = loadSessionId(current, storage.options) ?? undefined
    }
  }

  /**
   * Ensure a server-side session exists for the current page.
   * Creates one lazily and persists the ID in localStorage.
   */
  async function ensureSession(): Promise<string> {
    watchPathname()
    if (sessionId) return sessionId

    try {
      const session = await apiCreateSession(sync.endpoint, window.location.href)
      sessionId = session.id
      saveSessionId(pathname(), session.id, storage.options)
      return session.id
    } catch (err) {
      console.warn("[agentation] Failed to create session:", err)
      throw err
    }
  }

  /**
   * Flush all unsynced annotations to the server.
   *
   * Serialized: if a flush is already running and new writes arrive,
   * we mark the state as dirty and re-flush after the current one completes.
   */
  async function flush(): Promise<void> {
    if (flushInFlight) {
      dirtyWhileFlushing = true
      return flushInFlight
    }

    flushInFlight = (async () => {
      const sid = await ensureSession()
      const pending = getUnsyncedAnnotations(pathname(), sid, storage.options)

      if (pending.length === 0) return

      const synced: string[] = []
      for (const annotation of pending) {
        try {
          await syncAnnotation(sync.endpoint, sid, annotation)
          synced.push(annotation.id)
        } catch (err) {
          console.warn("[agentation] Failed to sync annotation:", annotation.id, err)
        }
      }

      if (synced.length > 0) {
        markAnnotationsSynced(pathname(), synced, sid, storage.options)
      }
    })()
      .catch((err) => {
        console.warn("[agentation] Sync flush failed:", err)
      })
      .finally(() => {
        flushInFlight = null

        // If new writes arrived while we were flushing, schedule a follow-up
        if (dirtyWhileFlushing) {
          dirtyWhileFlushing = false
          scheduleFlush()
        }
      })

    return flushInFlight
  }

  /**
   * Schedule a debounced flush.
   * Resets the timer on each call to batch rapid saves.
   */
  function scheduleFlush(): void {
    if (flushTimer != null) {
      clearTimeout(flushTimer)
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      void flush()
    }, debounceMs)
  }

  /**
   * Best-effort PATCH for an updated annotation.
   * Reuses the same session; falls back to upsert on error.
   */
  async function updateRemote(annotation: AnnotationV2): Promise<void> {
    watchPathname()
    if (!sessionId) {
      // No session yet — treat as upsert
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

  /**
   * Best-effort DELETE for a removed annotation.
   * If the annotation was never synced (404), silently ignore.
   * Does NOT create a session — if no session exists, the annotation
   * was never synced anyway.
   */
  async function deleteRemote(annotation: AnnotationV2): Promise<void> {
    watchPathname()
    // Don't create a session just to delete — if no session exists,
    // the annotation was never synced.
    if (!sessionId) return

    try {
      await apiDeleteAnnotation(sync.endpoint, annotation.id)
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return
      console.warn("[agentation] Delete sync failed:", annotation.id, err)
    }
  }

  return {
    init() {
      if (sync.autoSync === false) return Promise.resolve()
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
  }
}
