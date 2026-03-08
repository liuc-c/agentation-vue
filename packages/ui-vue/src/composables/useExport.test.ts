import { describe, it, expect, vi, beforeEach } from "vitest"
import { createExportActions } from "./useExport.js"
import type { AnnotationsStore } from "./useAnnotationsStore.js"
import type { SettingsState } from "./useSettings.js"

function makeMockStore(): AnnotationsStore {
  return {
    annotations: [],
    enabled: true,
    hydrate: vi.fn(),
    saveAnnotation: vi.fn() as any,
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAll: vi.fn(),
    exportJSON: vi.fn().mockReturnValue({ format: "agentation-vue", annotations: [] }),
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
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    const actions = createExportActions(store, settings)
    await actions.exportJSON()
    expect(store.exportJSON).toHaveBeenCalled()
  })

  it("calls store.exportMarkdown on exportMarkdown", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    const actions = createExportActions(store, settings)
    await actions.exportMarkdown()
    expect(store.exportMarkdown).toHaveBeenCalled()
  })
})
