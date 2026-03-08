import { reactive } from "vue"
import type { AreaSelectionMatch, AreaSelectionRect } from "../types.js"

// ---------------------------------------------------------------------------
// Area selection state — tracks drag-to-select rectangle + matched elements
// ---------------------------------------------------------------------------

export interface AreaSelectionState {
  readonly active: boolean
  readonly rect: AreaSelectionRect | null
  readonly matched: readonly AreaSelectionMatch[]
  start(x: number, y: number): void
  update(x: number, y: number): void
  setMatched(matches: AreaSelectionMatch[]): void
  clear(): void
}

/**
 * Creates a singleton area-selection state manager.
 *
 * Activated when the user drags on the page (pointerdown → pointermove).
 * The rectangle and matched elements are updated in real time by the
 * runtime bootstrap layer; the Vue DragSelectionLayer reads them reactively.
 */
export function createAreaSelectionState(): AreaSelectionState {
  const state = reactive({
    active: false,
    origin: null as { x: number; y: number } | null,
    rect: null as AreaSelectionRect | null,
    matched: [] as AreaSelectionMatch[],
  })

  return {
    get active() {
      return state.active
    },
    get rect() {
      return state.rect
    },
    get matched() {
      return state.matched
    },

    start(x: number, y: number) {
      state.active = true
      state.origin = { x, y }
      state.rect = normalizeRect(x, y, x, y)
      state.matched.splice(0, state.matched.length)
    },

    update(x: number, y: number) {
      if (!state.origin) return
      state.rect = normalizeRect(state.origin.x, state.origin.y, x, y)
    },

    setMatched(matches: AreaSelectionMatch[]) {
      state.matched.splice(0, state.matched.length, ...matches)
    },

    clear() {
      state.active = false
      state.origin = null
      state.rect = null
      state.matched.splice(0, state.matched.length)
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): AreaSelectionRect {
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const right = Math.max(startX, endX)
  const bottom = Math.max(startY, endY)

  return { left, top, right, bottom, width: right - left, height: bottom - top }
}
