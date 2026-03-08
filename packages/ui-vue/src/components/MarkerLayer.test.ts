import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
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
    autoClearAfterCopy: false,
    blockInteractions: true,
    locale: "en",
    webhookUrl: "",
    webhooksEnabled: false,
    toggleDarkMode: vi.fn(),
  }

  const i18n = createI18nState(() => settings.locale)

  return { store, overlay, settings, i18n }
}

describe("MarkerLayer", () => {
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

  it("renders markers for annotations with bounding boxes", () => {
    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: { boundingBox: { x: 100, y: 200, width: 80, height: 40 } },
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
  })

  it("prefers relative marker positioning when markerXPercent is available", () => {
    const annotations = [
      {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button",
        comment: "Fix this",
        source: { framework: "vue", componentName: "App", file: "f", resolver: "r" },
        metadata: {
          boundingBox: { x: 100, y: 200, width: 80, height: 40 },
          markerXPercent: 50,
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

    expect(wrapper.find(".marker-wrapper").attributes("style")).toContain("left: 50%;")
  })
})
