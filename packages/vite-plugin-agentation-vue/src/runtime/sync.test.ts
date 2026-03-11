// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const core = vi.hoisted(() => ({
  clearSessionId: vi.fn(),
  createSession: vi.fn(),
  deleteAnnotation: vi.fn(),
  getSession: vi.fn(),
  getUnsyncedAnnotations: vi.fn(),
  listSessions: vi.fn(),
  loadSessionId: vi.fn(),
  markAnnotationsSynced: vi.fn(),
  resolveV2Endpoint: vi.fn(),
  saveAnnotations: vi.fn(),
  saveSessionId: vi.fn(),
  syncAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
  updateSession: vi.fn(),
}))

vi.mock("@liuovo/agentation-vue-core", () => ({
  clearSessionId: core.clearSessionId,
  createSession: core.createSession,
  deleteAnnotation: core.deleteAnnotation,
  getSession: core.getSession,
  getUnsyncedAnnotations: core.getUnsyncedAnnotations,
  listSessions: core.listSessions,
  loadSessionId: core.loadSessionId,
  markAnnotationsSynced: core.markAnnotationsSynced,
  resolveV2Endpoint: core.resolveV2Endpoint,
  saveAnnotations: core.saveAnnotations,
  saveSessionId: core.saveSessionId,
  syncAnnotation: core.syncAnnotation,
  updateAnnotation: core.updateAnnotation,
  updateSession: core.updateSession,
}))

class FakeEventSource {
  static CLOSED = 2

  readyState = 1
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null
  addEventListener = vi.fn()
  close = vi.fn()

  constructor(_url: string) {}
}

describe("createRuntimeSyncBridge", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal("EventSource", FakeEventSource)

    core.loadSessionId.mockReturnValue("sess-existing")
    core.getSession.mockResolvedValue({
      id: "sess-existing",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      annotations: [],
    })
    core.getUnsyncedAnnotations.mockReturnValue([])
    core.listSessions.mockResolvedValue([])
    core.resolveV2Endpoint.mockReturnValue("http://localhost:4748/v2")
    core.updateSession.mockResolvedValue({
      id: "sess-existing",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "agentation-vue",
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("backfills the inferred projectId onto an existing session", async () => {
    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.createSession).not.toHaveBeenCalled()
    expect(core.updateSession).toHaveBeenCalledWith("http://localhost:4748", "sess-existing", {
      projectId: "agentation-vue",
    })
    expect(core.saveSessionId).not.toHaveBeenCalled()

    bridge.dispose()
  })

  it("clears a cached session from another project without creating an empty replacement", async () => {
    core.getSession.mockResolvedValueOnce({
      id: "sess-existing",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "other-project",
      annotations: [],
    })
    core.createSession.mockResolvedValueOnce({
      id: "sess-new",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "agentation-vue",
      annotations: [],
    })

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.updateSession).not.toHaveBeenCalled()
    expect(core.clearSessionId).toHaveBeenCalledWith("/", {})
    expect(core.createSession).not.toHaveBeenCalled()
    expect(core.saveSessionId).not.toHaveBeenCalled()

    bridge.dispose()
  })

  it("clears a closed cached session without creating an empty replacement", async () => {
    core.getSession.mockResolvedValueOnce({
      id: "sess-existing",
      url: "http://localhost:5173/",
      status: "closed",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "agentation-vue",
      annotations: [],
    })
    core.createSession.mockResolvedValueOnce({
      id: "sess-new",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-10T00:00:00.000Z",
      projectId: "agentation-vue",
      annotations: [],
    })

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.clearSessionId).toHaveBeenCalledWith("/", {})
    expect(core.createSession).not.toHaveBeenCalled()
    expect(core.saveSessionId).not.toHaveBeenCalled()

    bridge.dispose()
  })

  it("does not create a session during init when no annotations exist yet", async () => {
    core.loadSessionId.mockReturnValue(null)
    core.getUnsyncedAnnotations.mockReturnValue([])

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.createSession).not.toHaveBeenCalled()
    expect(core.saveSessionId).not.toHaveBeenCalled()
    expect(core.listSessions).toHaveBeenCalledWith("http://localhost:4748", "agentation-vue")

    bridge.dispose()
  })

  it("requeues pending annotations from a replaced session into the next session", async () => {
    const closedAnnotation = {
      id: "annotation-closed",
      schemaVersion: 1 as const,
      timestamp: "2026-03-09T00:00:00.000Z",
      url: "http://localhost:3000/",
      elementSelector: "button.primary",
      comment: "Keep local after close",
      source: {
        framework: "vue" as const,
        componentName: "App",
        file: "src/App.vue",
        line: 12,
        resolver: "test",
      },
      _syncedTo: "sess-existing",
    }
    const newAnnotation = {
      id: "annotation-new",
      schemaVersion: 1 as const,
      timestamp: "2026-03-10T00:00:00.000Z",
      url: "http://localhost:3000/",
      elementSelector: "button.secondary",
      comment: "Sync to replacement session",
      source: {
        framework: "vue" as const,
        componentName: "App",
        file: "src/App.vue",
        line: 24,
        resolver: "test",
      },
    }

    core.getSession
      .mockResolvedValueOnce({
        id: "sess-existing",
        url: "http://localhost:5173/",
        status: "closed",
        createdAt: "2026-03-09T00:00:00.000Z",
        projectId: "agentation-vue",
        annotations: [],
      })
      .mockResolvedValueOnce({
        id: "sess-new",
        url: "http://localhost:5173/",
        status: "active",
        createdAt: "2026-03-10T00:00:00.000Z",
        projectId: "agentation-vue",
        annotations: [],
      })
    core.createSession.mockResolvedValueOnce({
      id: "sess-new",
      url: "http://localhost:5173/",
      status: "active",
      createdAt: "2026-03-10T00:00:00.000Z",
      projectId: "agentation-vue",
      annotations: [],
    })
    core.getUnsyncedAnnotations.mockReturnValue([
      closedAnnotation,
      newAnnotation,
    ])

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.syncAnnotation).toHaveBeenCalledTimes(2)
    expect(core.syncAnnotation).toHaveBeenCalledWith(
      "http://localhost:4748",
      "sess-new",
      expect.objectContaining({
        id: "annotation-closed",
      }),
    )
    expect(core.syncAnnotation).toHaveBeenCalledWith(
      "http://localhost:4748",
      "sess-new",
      expect.objectContaining({
        id: "annotation-new",
      }),
    )
    expect(core.markAnnotationsSynced).toHaveBeenCalledWith(
      "/",
      ["annotation-closed", "annotation-new"],
      "sess-new",
      {},
    )

    bridge.dispose()
  })

  it("closes stale active sessions that have no open annotations", async () => {
    core.getSession.mockImplementation(async (_endpoint: string, sessionId: string) => {
      if (sessionId === "sess-existing") {
        return {
          id: "sess-existing",
          url: "http://localhost:3000/",
          status: "active",
          createdAt: "2026-03-09T00:00:00.000Z",
          projectId: "agentation-vue",
          annotations: [],
        }
      }

      return {
        id: "sess-stale",
        url: "http://localhost:3000/",
        status: "active",
        createdAt: "2026-03-08T00:00:00.000Z",
        projectId: "agentation-vue",
        annotations: [{
          id: "annotation-resolved",
          schemaVersion: 1 as const,
          timestamp: "2026-03-08T00:00:00.000Z",
          url: "http://localhost:3000/",
          elementSelector: "button.primary",
          comment: "Resolved already",
          status: "resolved" as const,
          source: {
            framework: "vue" as const,
            componentName: "App",
            file: "src/App.vue",
            line: 12,
            resolver: "test",
          },
        }],
      }
    })
    core.listSessions.mockResolvedValue([{
      id: "sess-existing",
      url: "http://localhost:3000/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "agentation-vue",
    }, {
      id: "sess-stale",
      url: "http://localhost:3000/",
      status: "active",
      createdAt: "2026-03-08T00:00:00.000Z",
      projectId: "agentation-vue",
    }])

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()

    expect(core.updateSession).toHaveBeenCalledWith("http://localhost:4748", "sess-stale", {
      status: "closed",
    })

    bridge.dispose()
  })

  it("closes the current session when the page is hidden", async () => {
    core.getSession.mockResolvedValue({
      id: "sess-existing",
      url: "http://localhost:3000/",
      status: "active",
      createdAt: "2026-03-09T00:00:00.000Z",
      projectId: "agentation-vue",
      annotations: [],
    })

    const { createRuntimeSyncBridge } = await import("./sync.ts")
    const bridge = createRuntimeSyncBridge({
      endpoint: "http://localhost:4748",
      projectId: "agentation-vue",
      autoSync: true,
      debounceMs: 0,
      ensureServer: false,
    }, {
      options: {},
      load: () => [],
      save: () => undefined,
      clear: () => undefined,
    })

    await bridge.init()
    window.dispatchEvent(new Event("pagehide"))
    await Promise.resolve()

    expect(core.clearSessionId).toHaveBeenCalledWith("/", {})
    expect(core.updateSession).toHaveBeenCalledWith("http://localhost:4748", "sess-existing", {
      status: "closed",
    }, {
      keepalive: true,
    })

    bridge.dispose()
  })
})
