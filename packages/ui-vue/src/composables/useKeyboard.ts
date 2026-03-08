import { onMounted, onUnmounted } from "vue"
import type { AnnotationsStore } from "./useAnnotationsStore.js"
import type { ExportActions } from "./useExport.js"
import type { FreezeState } from "./useFreezeState.js"
import type { OverlayState } from "./useOverlay.js"
import type { SelectionState } from "./useSelection.js"
import type { SettingsState } from "./useSettings.js"

// ---------------------------------------------------------------------------
// Keyboard shortcuts composable
// ---------------------------------------------------------------------------

/**
 * Registers global keyboard shortcuts scoped to the agentation overlay.
 *
 * Global shortcuts (work with modifiers):
 * - `Cmd/Ctrl+Shift+F`: Toggle annotation mode
 *
 * Single-key shortcuts (ignored while typing):
 * - `P`: Toggle animation freeze
 * - `H`: Toggle marker visibility
 * - `C`: Copy the currently selected export format
 * - `X`: Clear all annotations
 * - `Escape`: Dismiss popover → deselect → disable annotation mode
 *
 * Must be called inside a Vue component `setup()`.
 */
export function useKeyboardShortcuts(deps: {
  store: AnnotationsStore
  selection: SelectionState
  overlay: OverlayState
  settings: SettingsState
  exportActions?: ExportActions
  freezeState?: FreezeState
}): void {
  const { store, selection, overlay, settings, exportActions, freezeState } = deps

  function isOwnElement(el: Element): boolean {
    return !!el.closest("[data-agentation-root]")
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.isComposing) return

    const active = document.activeElement

    // Cmd/Ctrl+Shift+F → toggle annotation mode
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyF") {
      e.preventDefault()
      store.enabled = !store.enabled
      if (!store.enabled) {
        selection.clearHovered()
        selection.clearSelection()
        overlay.hidePopover()
      }
      return
    }

    // Escape — priority chain
    if (e.key === "Escape") {
      if (isEditableField(active) && !isOwnElement(active)) return

      // 1. Dismiss popover if visible
      if (overlay.popoverVisible) {
        e.preventDefault()
        selection.clearSelection()
        overlay.hidePopover()
        return
      }

      // 2. Deselect if selected
      if (selection.selected) {
        e.preventDefault()
        selection.clearSelection()
        return
      }

      // 3. Disable annotation mode
      if (store.enabled) {
        e.preventDefault()
        store.enabled = false
        selection.clearHovered()
        return
      }
    }

    // --- Single-key shortcuts (skip while typing or with modifiers) ------
    if (isEditableField(active) || isEditableField(e.target)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const key = e.key.toLowerCase()

    // P → toggle animation freeze (works even with 0 annotations)
    if (key === "p") {
      e.preventDefault()
      freezeState?.toggleFreeze()
      return
    }

    if (store.annotations.length === 0) return

    // H → toggle marker visibility
    if (key === "h") {
      e.preventDefault()
      settings.showMarkers = !settings.showMarkers
      return
    }

    // C → copy current export format
    if (key === "c") {
      e.preventDefault()
      if (settings.copyFormat === "json") {
        void exportActions?.exportJSON()
      } else {
        void exportActions?.exportMarkdown()
      }
      return
    }

    // X → clear all annotations
    if (key === "x") {
      e.preventDefault()
      store.clearAll()
      selection.clearHovered()
      selection.clearSelection()
      overlay.hidePopover()
    }
  }

  onMounted(() => {
    document.addEventListener("keydown", onKeydown, true)
  })

  onUnmounted(() => {
    document.removeEventListener("keydown", onKeydown, true)
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEditableField(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement
    && (
      target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT"
      || target.isContentEditable
    )
}
