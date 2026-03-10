// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const core = vi.hoisted(() => ({
  clearSessionId: vi.fn(),
  createSession: vi.fn(),
  deleteAnnotation: vi.fn(),
  getSession: vi.fn(),
  getUnsyncedAnnotations: vi.fn(),
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

  it("creates a new session when the cached session belongs to another project", async () => {
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
    expect(core.createSession).toHaveBeenCalledWith(
      "http://localhost:4748",
      "http://localhost:3000/",
      "agentation-vue",
      undefined,
    )
    expect(core.saveSessionId).toHaveBeenCalledWith("/", "sess-new", {})

    bridge.dispose()
  })
})
