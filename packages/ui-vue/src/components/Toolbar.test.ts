import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick, reactive, ref } from "vue"
import Toolbar from "./Toolbar.vue"
import {
  ANNOTATIONS_STORE_KEY,
  FREEZE_KEY,
  I18N_KEY,
  OVERLAY_KEY,
  RUNTIME_BRIDGE_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "../injection-keys.js"
import type { AnnotationsStore } from "../composables/useAnnotationsStore.js"
import type { ExportActions } from "../composables/useExport.js"
import { createI18nState } from "../composables/useI18n.js"
import type { OverlayState } from "../composables/useOverlay.js"
import type { SelectionState } from "../composables/useSelection.js"
import type { SettingsState } from "../composables/useSettings.js"
import type { FreezeState } from "../composables/useFreezeState.js"
import type { RuntimeBridge } from "../types.js"

function makeAnnotation() {
  return {
    id: "a1",
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    url: "http://localhost/",
    elementSelector: "button",
    comment: "Fix this",
    source: { framework: "vue", componentName: "App", file: "App.vue", resolver: "runtime" },
    metadata: { boundingBox: { x: 100, y: 120, width: 80, height: 32 } },
  }
}

function makeProvides(options?: {
  annotations?: any[]
  isFrozen?: boolean
  showMarkers?: boolean
  copyFormat?: SettingsState["copyFormat"]
  sync?: boolean
}) {
  const store: AnnotationsStore = {
    annotations: options?.annotations ?? [],
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
    selected: null,
    setHovered: vi.fn(),
    clearHovered: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
  }

  const overlay: OverlayState = {
    popoverVisible: false,
    popoverPosition: null,
    editingAnnotation: null,
    showPopover: vi.fn(),
    hidePopover: vi.fn(),
    showEditPopover: vi.fn(),
  }

  const settings = reactive({
    outputDetail: "standard",
    darkMode: true,
    enabled: true,
    componentSourceEnabled: true,
    annotationColor: "#3c82f7",
    showMarkers: options?.showMarkers ?? true,
    copyFormat: options?.copyFormat ?? "markdown",
    autoClearAfterCopy: false,
    blockInteractions: true,
    locale: "en",
    webhookUrl: "",
    webhooksEnabled: false,
    toggleDarkMode() {
      settings.darkMode = !settings.darkMode
    },
  }) as SettingsState

  const i18n = createI18nState(() => settings.locale)
  const frozen = ref(options?.isFrozen ?? false)

  const freezeState: FreezeState = {
    isFrozen: frozen as any,
    toggleFreeze: vi.fn(() => {
      frozen.value = !frozen.value
    }),
    cleanup: vi.fn(),
  }

  const bridge: RuntimeBridge = {
    appRoot: document.createElement("div"),
    overlayRoot: document.createElement("div"),
    options: { outputDetail: "standard" as const },
    storage: { options: {}, load: vi.fn().mockReturnValue([]), save: vi.fn(), clear: vi.fn() },
    resolveSource: vi.fn().mockReturnValue(null),
  }

  if (options?.sync) {
    bridge.sync = {
      init: vi.fn().mockResolvedValue(undefined),
      enqueueUpsert: vi.fn(),
      enqueueUpdate: vi.fn(),
      enqueueDelete: vi.fn(),
    }
  }

  return { store, selection, overlay, settings, i18n, freezeState, bridge }
}

function makeExportActions(): ExportActions {
  return {
    copyFeedback: null,
    exportJSON: vi.fn().mockResolvedValue(undefined),
    exportMarkdown: vi.fn().mockResolvedValue(undefined),
  }
}

function mountToolbar(options?: Parameters<typeof makeProvides>[0]) {
  const provides = makeProvides(options)
  const exportActions = makeExportActions()

  const wrapper = mount(Toolbar, {
    props: { exportActions },
    global: {
      provide: {
        [ANNOTATIONS_STORE_KEY as symbol]: provides.store,
        [SELECTION_KEY as symbol]: provides.selection,
        [OVERLAY_KEY as symbol]: provides.overlay,
        [SETTINGS_KEY as symbol]: provides.settings,
        [I18N_KEY as symbol]: provides.i18n,
        [FREEZE_KEY as symbol]: provides.freezeState,
        [RUNTIME_BRIDGE_KEY as symbol]: provides.bridge,
      },
    },
  })

  return { wrapper, ...provides, exportActions }
}

async function expandToolbar(wrapper: { find(selector: string): { trigger(event: string): Promise<unknown> } }) {
  await wrapper.find(".toolbar-container").trigger("click")
}

describe("Toolbar", () => {
  it("mounts in collapsed state with no badge when empty", () => {
    const { wrapper, store } = mountToolbar()
    expect(wrapper.find(".badge").exists()).toBe(false)
    expect(wrapper.find(".toolbar-container").classes()).toContain("collapsed")
    expect(store.enabled).toBe(false)
  })

  it("plays and clears the entrance animation state", async () => {
    const { wrapper } = mountToolbar()
    await nextTick()

    expect(wrapper.find(".toolbar-container").classes()).toContain("entrance")

    // originalSetTimeout bypasses fake timers, so wait real time
    await new Promise((r) => setTimeout(r, 800))
    await nextTick()

    expect(wrapper.find(".toolbar-container").classes()).not.toContain("entrance")
  })

  it("shows pause button when toolbar is expanded", async () => {
    const { wrapper, store } = mountToolbar()

    await expandToolbar(wrapper)

    const pauseBtn = wrapper.findAll("button").find(
      (b) => b.attributes("aria-label") === "Pause animations",
    )
    expect(pauseBtn).toBeDefined()
    expect(store.enabled).toBe(true)
  })

  it("disables clear button when no annotations", () => {
    const { wrapper } = mountToolbar()

    const clearBtn = wrapper.findAll("button").find(
      (b) => b.attributes("aria-label") === "Clear all annotations",
    )
    expect(clearBtn).toBeDefined()
    expect(clearBtn!.attributes("disabled")).toBeDefined()
  })

  it("opens settings and closes them on outside pointerdown", async () => {
    const { wrapper } = mountToolbar()

    await expandToolbar(wrapper)
    await wrapper.find('button[aria-label="Toggle settings"]').trigger("click")
    expect(wrapper.find(".settings-panel").exists()).toBe(true)

    document.dispatchEvent(new Event("pointerdown"))
    await nextTick()

    expect(wrapper.find(".settings-panel").exists()).toBe(false)
  })

  it("opens the MCP & Webhooks page from settings navigation", async () => {
    const { wrapper } = mountToolbar({ sync: true })

    await expandToolbar(wrapper)
    expect(wrapper.find('button[aria-label="Manage MCP & Webhooks"]').exists()).toBe(false)
    await wrapper.find('button[aria-label="Toggle settings"]').trigger("click")
    await wrapper.find(".nav-btn").trigger("click")

    expect(wrapper.find(".settings-pages").classes()).toContain("show-automations")
    expect(wrapper.find(".back-btn").text()).toContain("Manage MCP & Webhooks")
    expect(wrapper.find(".mcp-status").text()).toContain("Connected")
  })

  it("switches copy format in settings and updates the toolbar copy action", async () => {
    const { wrapper, settings, exportActions } = mountToolbar({
      annotations: [makeAnnotation()],
      copyFormat: "markdown",
    })

    await expandToolbar(wrapper)
    expect(wrapper.find('button[aria-label="Copy as Markdown"]').exists()).toBe(true)

    await wrapper.find('button[aria-label="Toggle settings"]').trigger("click")
    await wrapper.find('button[aria-label="Use JSON copy format"]').trigger("click")
    await nextTick()

    expect(settings.copyFormat).toBe("json")
    expect(wrapper.find('button[aria-label="Copy as JSON"]').exists()).toBe(true)

    await wrapper.find('button[aria-label="Copy as JSON"]').trigger("click")

    expect(exportActions.exportJSON).toHaveBeenCalledTimes(1)
    expect(exportActions.exportMarkdown).not.toHaveBeenCalled()
  })

  it("updates pause and marker visibility controls when toggled", async () => {
    const { wrapper, freezeState } = mountToolbar({
      annotations: [makeAnnotation()],
      showMarkers: true,
      isFrozen: false,
    })

    await expandToolbar(wrapper)

    await wrapper.find('button[aria-label="Pause animations"]').trigger("click")
    await nextTick()

    expect(freezeState.toggleFreeze).toHaveBeenCalledTimes(1)
    expect(wrapper.find('button[aria-label="Resume animations"]').exists()).toBe(true)

    await wrapper.find('button[aria-label="Hide markers"]').trigger("click")
    await nextTick()

    const hiddenMarkersButton = wrapper.find('button[aria-label="Show markers"]')
    expect(hiddenMarkersButton.exists()).toBe(true)
    expect(hiddenMarkersButton.attributes("data-state")).toBe("hidden")
  })
})
