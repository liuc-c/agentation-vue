import { reactive } from "vue"
import type { HoverSnapshot, SelectionSnapshot } from "../types.js"

// ---------------------------------------------------------------------------
// Selection state — tracks hover, click-select, and drag-select interactions
// ---------------------------------------------------------------------------

export interface SelectionState {
  readonly hovered: HoverSnapshot | null
  readonly selected: SelectionSnapshot | null
  setHovered(snapshot: HoverSnapshot): void
  clearHovered(): void
  select(snapshot: SelectionSnapshot): void
  clearSelection(): void
}

/**
 * Creates a singleton selection state manager.
 *
 * Called once by OverlayRoot during setup; runtime event listeners
 * drive state via `setHovered()` / `select()`.
 */
export function createSelectionState(): SelectionState {
  const state = reactive({
    hovered: null as HoverSnapshot | null,
    selected: null as SelectionSnapshot | null,
  })

  return {
    get hovered() {
      return state.hovered
    },
    get selected() {
      return state.selected
    },

    setHovered(snapshot: HoverSnapshot) {
      // Suppress hover updates while an element is selected
      if (state.selected) return
      state.hovered = snapshot
    },

    clearHovered() {
      state.hovered = null
    },

    select(snapshot: SelectionSnapshot) {
      state.selected = snapshot
      state.hovered = null
    },

    clearSelection() {
      state.selected = null
    },
  }
}
