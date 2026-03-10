import { afterEach, beforeEach, describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import MarkerLayer from "./MarkerLayer.vue"
import { ANNOTATIONS_STORE_KEY, I18N_KEY, OVERLAY_KEY, SETTINGS_KEY } from "../injection-keys.js"
import type { AnnotationsStore } from "../composables/useAnnotationsStore.js"
import { createI18nState } from "../composables/useI18n.js"
import type { OverlayState } from "../composables/useOverlay.js"
import type { SettingsState } from "../composables/useSettings.js"

function makeProvides(annotations: any[] = []) {
  const store: AnnotationsStore = {
    annotations,
    enabled: true,
    hydrate: vi.fn(),
    saveAnnotation: vi.fn() as any,
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAll: vi.fn(),
    exportJSON: vi.fn() as any,
    exportMarkdown: vi.fn().mockReturnValue(""),
  }

  const overlay: OverlayState = {
    popoverVisible: false,
    popoverPosition: null,
    editingAnnotation: null,
    showPopover: vi.fn(),
    hidePopover: vi.fn(),
    showEditPopover: vi.fn(),
  }

  const settings: SettingsState = {
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
    agentAutoSendEnabled: false,
    selectedAgentId: "",
    toggleDarkMode: vi.fn(),
  }

  const i18n = createI18nState(() => settings.locale)

  return { store, overlay, settings, i18n }
}

describe("MarkerLayer", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("mounts with no markers when annotations is empty", () => {
    const { store, overlay, settings, i18n } = makeProvides([])

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.findAll(".marker-dot")).toHaveLength(0)
  })

  it("renders markers for annotations with live element locators", () => {
    const button = document.createElement("button")
    button.id = "marker-basic"
    button.textContent = "Open"
    button.getBoundingClientRect = vi.fn(() => new DOMRect(100, 200, 80, 32))
    document.body.appendChild(button)

    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        elementText: "Open",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 100, y: 200, width: 80, height: 32 },
          elementLocator: {
            selector: "#marker-basic",
            tag: "button",
            text: "Open",
            position: { x: 100, y: 200, width: 80, height: 32 },
          },
        },
      },
    ]

    const { store, overlay, settings, i18n } = makeProvides(annotations)

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.findAll(".marker-dot")).toHaveLength(1)
    expect(wrapper.find(".marker-dot").text()).toBe("1")
    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("left: 140px;")
    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("top: 200px;")
  })

  it("renders multi-select markers from the saved union bounding box", () => {
    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "multi-select",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 100, y: 200, width: 80, height: 40 },
          isMultiSelect: true,
        },
      },
    ]

    const { store, overlay, settings, i18n } = makeProvides(annotations)

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("left: 140px;")
    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("top: 200px;")
  })

  it("tracks the live DOM element like vibe-annotations", async () => {
    const button = document.createElement("button")
    button.id = "marker-target"
    button.className = "cta-button"
    button.textContent = "Save"
    document.body.appendChild(button)

    let rect = new DOMRect(120, 180, 80, 32)
    button.getBoundingClientRect = vi.fn(() => rect)

    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        elementText: "Save",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 120, y: 180, width: 80, height: 32 },
          elementLocator: {
            selector: "#marker-target",
            tag: "button",
            text: "Save",
            classes: ["cta-button"],
            position: { x: 120, y: 180, width: 80, height: 32 },
          },
        },
      },
    ]

    const { store, overlay, settings, i18n } = makeProvides(annotations)

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("left: 160px;")
    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("top: 180px;")

    rect = new DOMRect(260, 90, 120, 40)
    window.dispatchEvent(new Event("resize"))
    await nextTick()

    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("left: 320px;")
    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("top: 90px;")
  })

  it("hides single-element markers when the target can no longer be resolved", () => {
    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        elementText: "Missing",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 100, y: 200, width: 80, height: 32 },
          elementLocator: {
            selector: "#does-not-exist",
            tag: "button",
            text: "Missing",
            position: { x: 100, y: 200, width: 80, height: 32 },
          },
        },
      },
    ]

    const { store, overlay, settings, i18n } = makeProvides(annotations)

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.findAll(".marker-dot")).toHaveLength(0)
  })

  it("shows workflow status and reply count in the marker tooltip", async () => {
    const button = document.createElement("button")
    button.id = "marker-status"
    button.textContent = "Deploy"
    button.getBoundingClientRect = vi.fn(() => new DOMRect(40, 60, 100, 36))
    document.body.appendChild(button)

    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        elementText: "Deploy",
        comment: "Confirm final state",
        status: "resolved",
        thread: [
          {
            id: "t1",
            role: "agent",
            content: "Completed the last spacing fix.",
            timestamp: "2026-03-09T01:02:03.000Z",
          },
          {
            id: "t2",
            role: "agent",
            content: "Verified in the browser.",
            timestamp: "2026-03-09T01:03:03.000Z",
          },
        ],
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 40, y: 60, width: 100, height: 36 },
          elementLocator: {
            selector: "#marker-status",
            tag: "button",
            text: "Deploy",
            position: { x: 40, y: 60, width: 100, height: 36 },
          },
        },
      },
    ]

    const { store, overlay, settings, i18n } = makeProvides(annotations)

    const wrapper = mount(MarkerLayer, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    await wrapper.find(".marker-dot").trigger("mouseenter")

    expect(wrapper.find(".tooltip-status").text()).toContain("Resolved")
    expect(wrapper.find(".tooltip-thread").text()).toContain("2 replies")
  })
})
