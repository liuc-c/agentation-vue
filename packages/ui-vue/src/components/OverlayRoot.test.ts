import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import { defineComponent, h, nextTick } from "vue"
import OverlayRoot from "./OverlayRoot.vue"
import type { RuntimeBridge, UiNotification } from "../types.js"
import { createAnnotationsStore } from "../composables/useAnnotationsStore.js"
import { createSelectionState } from "../composables/useSelection.js"
import { createSettingsState } from "../composables/useSettings.js"
import { createAreaSelectionState } from "../composables/useAreaSelection.js"
import {
  ANNOTATIONS_STORE_KEY,
  OVERLAY_KEY,
  RUNTIME_BRIDGE_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "../injection-keys.js"

function makeBridge(): RuntimeBridge {
  const overlay = document.createElement("div")
  overlay.id = "test-overlay"
  document.body.appendChild(overlay)
  const listeners = new Set<(notification: UiNotification) => void>()

  return {
    appRoot: document.createElement("div"),
    overlayRoot: overlay,
    options: { outputDetail: "standard" },
    storage: {
      options: {},
      load: vi.fn().mockReturnValue([]),
      save: vi.fn(),
      clear: vi.fn(),
    },
    notify(notification) {
      for (const listener of listeners) {
        listener(notification)
      }
    },
    subscribeNotifications(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    resolveSource: vi.fn().mockReturnValue(null),
  }
}

describe("OverlayRoot", () => {
  it("mounts and provides injection keys", () => {
    const bridge = makeBridge()
    const store = createAnnotationsStore(bridge)
    const selection = createSelectionState()
    const settings = createSettingsState()
    const areaSelection = createAreaSelectionState()

    // Test that child component receives injections
    let injectedStore: any = null
    const TestChild = defineComponent({
      setup() {
        const { inject } = require("vue")
        injectedStore = inject(ANNOTATIONS_STORE_KEY)
        return () => h("div", "child")
      },
    })

    const wrapper = mount(OverlayRoot, {
      props: { bridge, store, selection, settings, areaSelection },
      slots: { default: () => h(TestChild) },
    })

    expect(wrapper.find(".agentation-root").exists()).toBe(true)
    wrapper.unmount()
    bridge.overlayRoot.remove()
  })

  it("applies dark class by default", () => {
    const bridge = makeBridge()
    const store = createAnnotationsStore(bridge)
    const selection = createSelectionState()
    const settings = createSettingsState()
    const areaSelection = createAreaSelectionState()

    const wrapper = mount(OverlayRoot, {
      props: { bridge, store, selection, settings, areaSelection },
    })

    expect(wrapper.find(".agentation-root.dark").exists()).toBe(true)
    wrapper.unmount()
    bridge.overlayRoot.remove()
  })

  it("renders toast notifications emitted through the bridge", async () => {
    const bridge = makeBridge()
    const store = createAnnotationsStore(bridge)
    const selection = createSelectionState()
    const settings = createSettingsState()
    const areaSelection = createAreaSelectionState()

    const wrapper = mount(OverlayRoot, {
      props: { bridge, store, selection, settings, areaSelection },
    })

    bridge.notify?.({
      kind: "warning",
      message: "This element could not be mapped to Vue source.",
    })
    await nextTick()

    expect(wrapper.find(".toast").text()).toContain("could not be mapped")

    wrapper.unmount()
    bridge.overlayRoot.remove()
  })
})
