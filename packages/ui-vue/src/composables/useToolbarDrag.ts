import { useDraggable } from "@vueuse/core"
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  type ComputedRef,
  type CSSProperties,
  type Ref,
} from "vue"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const STORAGE_KEY = "agentation-vue-toolbar-position"

export interface ToolbarPosition {
  x: number
  y: number
}

export interface ToolbarDragState {
  readonly position: Readonly<Ref<ToolbarPosition | null>>
  readonly isDragging: Readonly<Ref<boolean>>
  readonly justFinishedDrag: Readonly<Ref<boolean>>
  readonly toolbarStyle: ComputedRef<CSSProperties | undefined>
  bindToolbarRef(element: HTMLElement | null): void
  onMouseDown(event: MouseEvent): void
  consumeJustFinishedDrag(): boolean
  syncConstraints(): void
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Drag composable for the toolbar, powered by @vueuse/core `useDraggable`.
 *
 * Fully reactive — VueUse's `x`/`y` refs are the single source of truth
 * for position. `toolbarStyle` derives from them so Vue's `:style` binding
 * and the drag position are always in sync. No direct DOM writes needed.
 */
export function useToolbarDrag(options: {
  padding?: number
  toolbarHeight?: number
  dragThreshold?: number
} = {}): ToolbarDragState {
  const padding = options.padding ?? 20
  const toolbarHeight = options.toolbarHeight ?? 44
  const dragThreshold = options.dragThreshold ?? 5

  // --- Element ref for useDraggable ----------------------------------------
  const toolbarEl = shallowRef<HTMLElement | null>(null)

  // --- Whether a position has been set (saved or dragged) ------------------
  // When false, toolbar uses its default CSS position (right/bottom).
  const hasPosition = ref(false)

  // --- Drag state ----------------------------------------------------------
  const isDragging = ref(false)
  const justFinishedDrag = ref(false)

  interface DragSession {
    pointerX: number
    pointerY: number
    startX: number
    startY: number
  }
  let session: DragSession | null = null
  let cachedWrapperWidth = 297
  let cachedContentWidth = 44

  function updateMeasurements(): void {
    const el = toolbarEl.value
    if (!el) return

    cachedWrapperWidth = el.offsetWidth || cachedWrapperWidth

    const content = el.querySelector<HTMLElement>(".toolbar-container")
    if (content) {
      cachedContentWidth = content.offsetWidth || cachedContentWidth
    }
  }

  // --- Viewport constraint -------------------------------------------------
  function constrain(pos: ToolbarPosition): ToolbarPosition {
    if (typeof window === "undefined") return pos
    const contentOffset = Math.max(0, cachedWrapperWidth - cachedContentWidth)
    const minX = padding - contentOffset
    const maxX = window.innerWidth - cachedWrapperWidth - padding
    const maxY = window.innerHeight - toolbarHeight - padding
    return {
      x: Math.max(minX, Math.min(Math.max(minX, maxX), pos.x)),
      y: Math.max(padding, Math.min(Math.max(padding, maxY), pos.y)),
    }
  }

  // --- Interaction locking -------------------------------------------------
  const DRAG_CLASS = "agentation-dragging"

  function lockInteraction(): void {
    document.documentElement.classList.add(DRAG_CLASS)
  }

  function unlockInteraction(): void {
    document.documentElement.classList.remove(DRAG_CLASS)
  }

  // --- Hit-test filter (ignore interactive children) -----------------------
  function isIgnoredTarget(target: EventTarget | null): boolean {
    return target instanceof Element
      && Boolean(target.closest("button, input, textarea, select, [data-no-drag]"))
  }

  // --- Load saved position for initialValue --------------------------------
  const saved = loadPosition()
  if (saved) hasPosition.value = true
  const initialPos = saved
    ? (typeof window !== "undefined" ? constrain(saved) : saved)
    : { x: 0, y: 0 }

  // --- useDraggable (pointer event lifecycle) ------------------------------
  const { x, y } = useDraggable(toolbarEl, {
    initialValue: initialPos,
    preventDefault: true,

    onStart(_pos, event) {
      if (event.pointerType === "mouse" && event.button !== 0) return false
      if (isIgnoredTarget(event.target)) return false

      const el = toolbarEl.value
      if (!el) return false

      updateMeasurements()
      justFinishedDrag.value = false

      // First drag with no saved position: adopt current CSS position
      if (!hasPosition.value) {
        const rect = el.getBoundingClientRect()
        x.value = rect.left
        y.value = rect.top
        hasPosition.value = true
      }

      session = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        startX: x.value,
        startY: y.value,
      }
    },

    onMove(dragPos, event) {
      if (!session) return

      // Enforce drag threshold before committing to drag mode
      if (!isDragging.value) {
        const dx = event.clientX - session.pointerX
        const dy = event.clientY - session.pointerY
        if (dx * dx + dy * dy <= dragThreshold * dragThreshold) {
          // Snap back to start (undo VueUse's premature position update)
          x.value = session.startX
          y.value = session.startY
          return
        }
        isDragging.value = true
        lockInteraction()
      }

      // Apply viewport constraint
      const constrained = constrain(dragPos)
      x.value = constrained.x
      y.value = constrained.y
    },

    onEnd() {
      if (session && isDragging.value) {
        savePosition({ x: x.value, y: y.value })
        justFinishedDrag.value = true
        unlockInteraction()
      }
      isDragging.value = false
      session = null
    },
  })

  // --- Derived state -------------------------------------------------------

  const position = computed<ToolbarPosition | null>(() => {
    if (!hasPosition.value) return null
    return { x: x.value, y: y.value }
  })

  const toolbarStyle = computed<CSSProperties | undefined>(() => {
    if (!hasPosition.value) return undefined
    return {
      left: `${x.value}px`,
      top: `${y.value}px`,
      right: "auto",
      bottom: "auto",
    }
  })

  // --- Window blur handler (abort drag cleanly) ----------------------------
  function onWindowBlur(): void {
    if (session && isDragging.value) {
      savePosition({ x: x.value, y: y.value })
      justFinishedDrag.value = true
      unlockInteraction()
    }
    isDragging.value = false
    session = null
  }

  // --- Resize handler (re-constrain saved position) ------------------------
  function onResize(): void {
    updateMeasurements()
    if (isDragging.value || !hasPosition.value) return
    const constrained = constrain({ x: x.value, y: y.value })
    x.value = constrained.x
    y.value = constrained.y
    savePosition(constrained)
  }

  function syncConstraints(): void {
    updateMeasurements()
    if (!hasPosition.value) return
    const constrained = constrain({ x: x.value, y: y.value })
    x.value = constrained.x
    y.value = constrained.y
    savePosition(constrained)
  }

  // --- Public API ----------------------------------------------------------

  function bindToolbarRef(element: HTMLElement | null): void {
    if (toolbarEl.value === element) return
    toolbarEl.value = element
    updateMeasurements()
  }

  /** Noop — retained for API compatibility. Drag is now handled by useDraggable. */
  function onMouseDown(_event: MouseEvent): void {}

  function consumeJustFinishedDrag(): boolean {
    const v = justFinishedDrag.value
    justFinishedDrag.value = false
    return v
  }

  // --- Lifecycle -----------------------------------------------------------

  onMounted(() => {
    // Re-constrain on mount (window size may differ from when position was saved)
    updateMeasurements()
    if (hasPosition.value) {
      const constrained = constrain({ x: x.value, y: y.value })
      x.value = constrained.x
      y.value = constrained.y
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("blur", onWindowBlur)
  })

  onUnmounted(() => {
    if (isDragging.value) unlockInteraction()
    isDragging.value = false
    session = null
    window.removeEventListener("resize", onResize)
    window.removeEventListener("blur", onWindowBlur)
  })

  return {
    position,
    isDragging,
    justFinishedDrag,
    toolbarStyle,
    bindToolbarRef,
    onMouseDown,
    consumeJustFinishedDrag,
    syncConstraints,
  }
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadPosition(): ToolbarPosition | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ToolbarPosition>
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

function savePosition(pos: ToolbarPosition): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // silent
  }
}
