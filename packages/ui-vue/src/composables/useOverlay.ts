import { computed, reactive } from "vue"
import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
import type { SelectionState } from "./useSelection.js"

// ---------------------------------------------------------------------------
// Overlay state — manages popover visibility & position
// ---------------------------------------------------------------------------

const POPOVER_OFFSET = 12
const POPOVER_MARGIN = 12
const POPOVER_WIDTH = 280
const POPOVER_HEIGHT = 260

export interface OverlayPosition {
  top: number
  left: number
}

export interface OverlayState {
  readonly popoverVisible: boolean
  readonly popoverPosition: OverlayPosition | null
  /** The annotation currently being edited, or null for create mode. */
  readonly editingAnnotation: AnnotationV2 | null
  /** Incremented when a visible popover should replay its attention animation. */
  readonly shakeTick?: number
  showPopover(): void
  hidePopover(): void
  /** Open the popover in edit mode, anchored to the given rect. */
  showEditPopover(annotation: AnnotationV2, anchorRect: DOMRectReadOnly): void
}

/**
 * Creates overlay state driven by the selection state.
 *
 * The popover becomes visible when `showPopover()` is called
 * (typically right after `select()`), and auto-positions itself
 * relative to the selected element's bounding rect.
 */
export function createOverlayState(selection: SelectionState): OverlayState {
  const state = reactive({
    visible: false,
    editingAnnotation: null as AnnotationV2 | null,
    editAnchorRect: null as DOMRectReadOnly | null,
    shakeTick: 0,
  })

  const popoverVisible = computed(
    () => state.visible && (selection.selected !== null || state.editingAnnotation !== null),
  )

  const popoverPosition = computed<OverlayPosition | null>(() => {
    if (!popoverVisible.value) return null

    // Edit mode: use the anchor rect from the marker
    if (state.editingAnnotation && state.editAnchorRect) {
      return computePopoverPosition(state.editAnchorRect)
    }

    // Create mode: use the selected element's rect
    if (selection.selected) {
      return computePopoverPosition(selection.selected.rect)
    }

    return null
  })

  return {
    get popoverVisible() {
      return popoverVisible.value
    },
    get popoverPosition() {
      return popoverPosition.value
    },
    get editingAnnotation() {
      return state.editingAnnotation
    },
    get shakeTick() {
      return state.shakeTick
    },

    showPopover() {
      if (!selection.selected) return
      if (state.visible) {
        state.shakeTick += 1
      }
      state.editingAnnotation = null
      state.editAnchorRect = null
      state.visible = true
    },

    hidePopover() {
      state.visible = false
      state.editingAnnotation = null
      state.editAnchorRect = null
    },

    showEditPopover(annotation: AnnotationV2, anchorRect: DOMRectReadOnly) {
      if (state.visible) {
        state.shakeTick += 1
      }
      state.editingAnnotation = annotation
      state.editAnchorRect = anchorRect
      state.visible = true
    },
  }
}

// ---------------------------------------------------------------------------
// Position computation
// ---------------------------------------------------------------------------

function computePopoverPosition(rect: DOMRectReadOnly): OverlayPosition {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024
  const vh = typeof window !== "undefined" ? window.innerHeight : 768

  // Prefer below the element
  const preferredTop = rect.bottom + POPOVER_OFFSET
  const fallbackTop = Math.max(POPOVER_MARGIN, rect.top - POPOVER_HEIGHT - POPOVER_OFFSET)
  const top = preferredTop + POPOVER_HEIGHT <= vh - POPOVER_MARGIN
    ? preferredTop
    : fallbackTop

  // Center horizontally, clamped to viewport
  const maxLeft = Math.max(POPOVER_MARGIN, vw - POPOVER_WIDTH - POPOVER_MARGIN)
  const centeredLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2
  const left = Math.min(Math.max(centeredLeft, POPOVER_MARGIN), maxLeft)

  return { top, left }
}
