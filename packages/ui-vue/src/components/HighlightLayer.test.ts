import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import HighlightLayer from "./HighlightLayer.vue"
import { AREA_SELECTION_KEY, SELECTION_KEY } from "../injection-keys.js"
import { createAreaSelectionState } from "../composables/useAreaSelection.js"
import type { SelectionState } from "../composables/useSelection.js"

function makeSelection(hasHovered = false): SelectionState {
  const el = document.createElement("div")
  // jsdom returns 0-size rects by default, so we mock getBoundingClientRect
  if (hasHovered) {
    el.getBoundingClientRect = () => new DOMRect(10, 20, 100, 50)
  }

  return {
    hovered: hasHovered
      ? { element: el, rect: new DOMRect(10, 20, 100, 50), elementName: "test" }
      : null,
    selected: null,
    setHovered: vi.fn(),
    clearHovered: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
  }
}

function mountHighlightLayer(selection: SelectionState) {
  return mount(HighlightLayer, {
    global: {
      provide: {
        [SELECTION_KEY as symbol]: selection,
        [AREA_SELECTION_KEY as symbol]: createAreaSelectionState(),
      },
    },
  })
}

describe("HighlightLayer", () => {
  it("mounts without highlight box when nothing hovered", () => {
    const selection = makeSelection(false)
    const wrapper = mountHighlightLayer(selection)
    expect(wrapper.find(".highlight-box").exists()).toBe(false)
  })

  it("shows highlight box when element is hovered", () => {
    const selection = makeSelection(true)
    const wrapper = mountHighlightLayer(selection)
    expect(wrapper.find(".highlight-box").exists()).toBe(true)
  })
})
