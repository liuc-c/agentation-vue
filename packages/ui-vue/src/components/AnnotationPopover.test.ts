import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import AnnotationPopover from "./AnnotationPopover.vue"
import {
  ANNOTATIONS_STORE_KEY,
  I18N_KEY,
  OVERLAY_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "../injection-keys.js"
import type { AnnotationsStore } from "../composables/useAnnotationsStore.js"
import { createI18nState } from "../composables/useI18n.js"
import type { OverlayState } from "../composables/useOverlay.js"
import type { SelectionState } from "../composables/useSelection.js"

function makeProvides(overrides?: { popoverVisible?: boolean; editingAnnotation?: Record<string, unknown> | null }) {
  const store: AnnotationsStore = {
    annotations: [],
    enabled: true,
    hydrate: vi.fn(),
    saveAnnotation: vi.fn() as any,
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAll: vi.fn(),
    exportJSON: vi.fn() as any,
    exportMarkdown: vi.fn().mockReturnValue(""),
  }

  const selection: SelectionState = {
    hovered: null,
    selected: overrides?.popoverVisible
      ? (() => {
          const element = document.createElement("div")
          element.style.color = "rgb(255, 0, 0)"
          return {
            element,
            rect: new DOMRect(100, 100, 200, 50),
            elementName: "test element",
            elementPath: "div",
            source: {
              framework: "vue",
              componentName: "App",
              file: "src/App.vue",
              line: 10,
              resolver: "test",
            },
          }
        })()
      : null,
    setHovered: vi.fn(),
    clearHovered: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
  }

  const overlay: OverlayState = {
    popoverVisible: overrides?.popoverVisible ?? false,
    popoverPosition: overrides?.popoverVisible ? { top: 200, left: 300 } : null,
    editingAnnotation: overrides?.editingAnnotation as OverlayState["editingAnnotation"] ?? null,
    showPopover: vi.fn(),
    hidePopover: vi.fn(),
    showEditPopover: vi.fn(),
  }

  const settings = {
    outputDetail: "standard" as const,
    darkMode: true,
    enabled: true,
    componentSourceEnabled: true,
    annotationColor: "#3c82f7",
    showMarkers: true,
    copyFormat: "markdown" as const,
    copyPrefix: "",
    copyExcludeFields: [],
    autoClearAfterCopy: false,
    blockInteractions: true,
    locale: "en" as const,
    webhookUrl: "",
    webhooksEnabled: false,
    toggleDarkMode: vi.fn(),
  }

  const i18n = createI18nState(() => settings.locale)

  return { store, selection, overlay, settings, i18n }
}

describe("AnnotationPopover", () => {
  it("does not render when popover is hidden", () => {
    const { store, selection, overlay, settings, i18n } = makeProvides()

    const wrapper = mount(AnnotationPopover, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [SELECTION_KEY as symbol]: selection,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".popover").exists()).toBe(false)
  })

  it("renders when popover is visible", () => {
    const { store, selection, overlay, settings, i18n } = makeProvides({ popoverVisible: true })

    const wrapper = mount(AnnotationPopover, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [SELECTION_KEY as symbol]: selection,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".popover").exists()).toBe(true)
    expect(wrapper.find(".element-name").text()).toBe("test element")
  })

  it("shows save button disabled when comment is empty", () => {
    const { store, selection, overlay, settings, i18n } = makeProvides({ popoverVisible: true })

    const wrapper = mount(AnnotationPopover, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [SELECTION_KEY as symbol]: selection,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    const saveBtn = wrapper.findAll("button").find((b) => b.text() === "Save")
    expect(saveBtn?.attributes("disabled")).toBeDefined()
  })

  it("keeps source visible and can expand computed styles", async () => {
    const { store, selection, overlay, settings, i18n } = makeProvides({ popoverVisible: true })

    const wrapper = mount(AnnotationPopover, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [SELECTION_KEY as symbol]: selection,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".source-file").text()).toContain("src/App.vue:10")
    expect(wrapper.find(".header-toggle").exists()).toBe(true)

    await wrapper.find(".header-toggle").trigger("click")
    await nextTick()

    expect(wrapper.find(".styles-wrapper").classes()).toContain("expanded")
  })

  it("shows workflow status and recent thread replies for synced annotations", () => {
    const { store, selection, overlay, settings, i18n } = makeProvides({
      popoverVisible: true,
      editingAnnotation: {
        id: "a1",
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        url: "http://localhost/",
        elementSelector: "button.primary",
        comment: "Original feedback",
        source: {
          framework: "vue",
          componentName: "App",
          file: "src/App.vue",
          line: 10,
          resolver: "test",
        },
        status: "resolved",
        thread: [
          {
            id: "t1",
            role: "agent",
            content: "Updated the CTA padding and alignment.",
            timestamp: "2026-03-09T01:02:03.000Z",
          },
        ],
      },
    })

    const wrapper = mount(AnnotationPopover, {
      global: {
        provide: {
          [ANNOTATIONS_STORE_KEY as symbol]: store,
          [SELECTION_KEY as symbol]: selection,
          [OVERLAY_KEY as symbol]: overlay,
          [SETTINGS_KEY as symbol]: settings,
          [I18N_KEY as symbol]: i18n,
        },
      },
    })

    expect(wrapper.find(".status-pill").text()).toContain("Resolved")
    expect(wrapper.find(".thread-title").text()).toContain("Thread")
    expect(wrapper.text()).toContain("Updated the CTA padding and alignment.")
  })
})
