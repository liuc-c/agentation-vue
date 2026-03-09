import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
import { createExportActions } from "./useExport.js"
import type { AnnotationsStore } from "./useAnnotationsStore.js"
import type { SettingsState } from "./useSettings.js"

function makeMockStore(): AnnotationsStore {
  const annotations: AnnotationV2[] = [{
    id: "a1",
    schemaVersion: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    url: "http://localhost/test",
    elementSelector: "button.primary",
    elementText: "Save",
    comment: "Update the label",
    source: {
      framework: "vue",
      componentName: "App",
      componentHierarchy: "App > Hero > CTA",
      file: "src/App.vue",
      line: 10,
      column: 2,
      resolver: "vue-tracer",
    },
    metadata: {
      project_area: "/home :: Hero",
      context_hints: ["heading: Hero"],
      elementPath: "main > button",
      boundingBox: { x: 10, y: 20, width: 30, height: 40 },
    },
  }]

  return {
    annotations,
    enabled: true,
    hydrate: vi.fn(),
    saveAnnotation: vi.fn() as any,
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAll: vi.fn(),
    exportJSON: vi.fn().mockReturnValue({
      format: "agentation-vue",
      schemaVersion: 1,
      detailLevel: "standard",
      annotationCount: 1,
      page: {
        pathname: "/",
        viewport: { width: 1280, height: 720 },
        url: "http://localhost/test",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      annotations: [],
    }),
    exportMarkdown: vi.fn().mockReturnValue("## Page Feedback: /"),
  }
}

function makeMockSettings(): SettingsState {
  return {
    outputDetail: "standard",
    darkMode: true,
    enabled: true,
    componentSourceEnabled: true,
    annotationColor: "#3c82f7",
    showMarkers: true,
    copyFormat: "markdown",
    copyPrefix: "",
    copyExcludeFields: [],
    autoClearAfterCopy: false,
    blockInteractions: true,
    locale: "en",
    webhookUrl: "",
    webhooksEnabled: false,
    toggleDarkMode: vi.fn(),
  }
}

describe("createExportActions", () => {
  let store: AnnotationsStore
  let settings: SettingsState

  beforeEach(() => {
    store = makeMockStore()
    settings = makeMockSettings()
  })

  it("starts with no copy feedback", () => {
    const actions = createExportActions(store, settings)
    expect(actions.copyFeedback).toBeNull()
  })

  it("calls store.exportJSON on exportJSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const actions = createExportActions(store, settings)
    await actions.exportJSON()
    expect(store.exportJSON).toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain("\"format\": \"agentation-vue\"")
  })

  it("applies copy prefix and field exclusions to copied markdown", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    settings.copyPrefix = "你好，帮我修改以下"
    settings.copyExcludeFields = ["projectArea", "framework", "selectedText"]

    const actions = createExportActions(store, settings)
    await actions.exportMarkdown()

    const payload = writeText.mock.calls[0][0] as string
    expect(payload.startsWith("你好，帮我修改以下\n## Page Feedback: /")).toBe(true)
    expect(payload).not.toContain("Project area")
    expect(payload).not.toContain("Framework")
    expect(payload).not.toContain("Selected text")
    expect(payload).toContain("Update the label")
  })
})
