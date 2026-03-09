import { describe, it, expect, vi, beforeEach } from "vitest"
import { createAnnotationsStore } from "./useAnnotationsStore.js"
import type { RuntimeBridge, SelectionSnapshot } from "../types.js"

function makeMockBridge(): RuntimeBridge {
  return {
    appRoot: document.createElement("div"),
    overlayRoot: document.createElement("div"),
    options: { outputDetail: "standard" },
    storage: {
      options: {},
      load: vi.fn().mockReturnValue([]),
      save: vi.fn(),
      clear: vi.fn(),
    },
    sync: {
      info: {
        endpoint: "http://localhost:4747",
        mcpEndpoint: "http://localhost:4748",
        mcpHttpUrl: "http://localhost:4748/mcp",
        mcpSseUrl: "http://localhost:4748/sse",
      },
      init: vi.fn().mockResolvedValue(undefined),
      enqueueUpsert: vi.fn(),
      enqueueUpdate: vi.fn(),
      enqueueDelete: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
      dispose: vi.fn(),
    },
    resolveSource: vi.fn().mockReturnValue({
      framework: "vue",
      componentName: "App",
      file: "src/App.vue",
      line: 1,
      resolver: "test",
    }),
  }
}

function makeSnapshot(): SelectionSnapshot {
  const el = document.createElement("button")
  el.textContent = "Click me"
  document.body.appendChild(el)

  return {
    element: el,
    rect: el.getBoundingClientRect(),
    elementName: 'button "Click me"',
    elementPath: "button",
    source: {
      framework: "vue",
      componentName: "App",
      file: "src/App.vue",
      line: 10,
      resolver: "test",
    },
  }
}

describe("createAnnotationsStore", () => {
  let bridge: RuntimeBridge

  beforeEach(() => {
    bridge = makeMockBridge()
  })

  it("starts with empty annotations", () => {
    const store = createAnnotationsStore(bridge)
    expect(store.annotations).toHaveLength(0)
  })

  it("starts enabled", () => {
    const store = createAnnotationsStore(bridge)
    expect(store.enabled).toBe(true)
  })

  it("hydrates from storage", () => {
    const existing = [{
      id: "x",
      schemaVersion: 1 as const,
      timestamp: new Date().toISOString(),
      url: "http://localhost/",
      elementSelector: "div",
      comment: "test",
      source: { framework: "vue" as const, componentName: "App", file: "f", resolver: "r" },
    }];
    (bridge.storage.load as any).mockReturnValue(existing)

    const store = createAnnotationsStore(bridge)
    store.hydrate()
    expect(store.annotations).toHaveLength(1)
    expect(store.annotations[0].id).toBe("x")
  })

  it("saves annotation", () => {
    const store = createAnnotationsStore(bridge)
    const snap = makeSnapshot()
    const annotation = store.saveAnnotation("Fix this", snap)

    expect(annotation.comment).toBe("Fix this")
    expect((annotation.metadata as { elementLocator?: { tag?: string } }).elementLocator).toMatchObject({
      tag: "button",
    })
    expect((annotation.metadata as { project_area?: string }).project_area).toContain("App")
    expect((annotation.metadata as { context_hints?: string[] }).context_hints?.length).toBeGreaterThan(0)
    expect(store.annotations).toHaveLength(1)
    expect(bridge.storage.save).toHaveBeenCalled()
    expect(bridge.sync!.enqueueUpsert).toHaveBeenCalled()
  })

  it("throws on empty comment", () => {
    const store = createAnnotationsStore(bridge)
    expect(() => store.saveAnnotation("  ", makeSnapshot())).toThrow()
  })

  it("removes annotation", () => {
    const store = createAnnotationsStore(bridge)
    const snap = makeSnapshot()
    const annotation = store.saveAnnotation("test", snap)

    store.removeAnnotation(annotation.id)
    expect(store.annotations).toHaveLength(0)
    expect(bridge.sync!.enqueueDelete).toHaveBeenCalled()
  })

  it("updates annotation comment", () => {
    const store = createAnnotationsStore(bridge)
    const snap = makeSnapshot()
    const annotation = store.saveAnnotation("original", snap)

    store.updateAnnotation(annotation.id, "updated")
    expect(store.annotations[0].comment).toBe("updated")
    expect(bridge.sync!.enqueueUpdate).toHaveBeenCalled()
  })

  it("clears all annotations", () => {
    const store = createAnnotationsStore(bridge)
    store.saveAnnotation("a", makeSnapshot())
    store.saveAnnotation("b", makeSnapshot())

    store.clearAll()
    expect(store.annotations).toHaveLength(0)
    expect(bridge.storage.clear).toHaveBeenCalled()
  })

  it("exports JSON", () => {
    const store = createAnnotationsStore(bridge)
    store.saveAnnotation("test", makeSnapshot())

    const doc = store.exportJSON()
    expect(doc.format).toBe("agentation-vue")
    expect(doc.annotationCount).toBe(1)
  })

  it("exports Markdown", () => {
    const store = createAnnotationsStore(bridge)
    store.saveAnnotation("test", makeSnapshot())

    const md = store.exportMarkdown()
    expect(md).toContain("Page Feedback")
    expect(md).toContain("test")
  })
})
