// =============================================================================
// Freeze Animations
// =============================================================================
//
// Pauses CSS animations/transitions, WAAPI animations, and videos.
//
// We intentionally do NOT monkey-patch timer APIs or requestAnimationFrame.
// Global timer/rAF patching also freezes framework scheduling and overlay
// interactions, which breaks marker rendering and panel updates.
//
// Import it explicitly only when animation freezing is needed —
// do NOT re-export from the package barrel (index.ts).
// =============================================================================

// Exclude selectors — agentation UI elements should never be frozen.
// Include the runtime containers directly so teleported overlay content is
// always whitelisted even if a child node misses a marker attribute.
const EXCLUDE_SELECTORS = [
  "#agentation-app",
  "#agentation-overlay",
  "[data-agentation-root]",
  "[data-feedback-toolbar]",
  "[data-annotation-popup]",
  "[data-annotation-marker]",
]
const NOT_SELECTORS = EXCLUDE_SELECTORS
  .flatMap((selector) => [`:not(${selector})`, `:not(${selector} *)`])
  .join("")

const STYLE_ID = "feedback-freeze-styles"
const STATE_KEY = "__agentation_freeze"

// ---------------------------------------------------------------------------
// Shared mutable state on window (survives HMR module re-execution)
// ---------------------------------------------------------------------------
interface FreezeState {
  frozen: boolean
  origSetTimeout: typeof setTimeout
  origSetInterval: typeof setInterval
  pausedAnimations: Animation[]
}

function getState(): FreezeState {
  if (typeof window === "undefined") {
    return {
      frozen: false,
      origSetTimeout: setTimeout,
      origSetInterval: setInterval,
      pausedAnimations: [],
    }
  }

  const w = window as Window & { [STATE_KEY]?: FreezeState }
  if (!w[STATE_KEY]) {
    w[STATE_KEY] = {
      frozen: false,
      origSetTimeout: window.setTimeout.bind(window),
      origSetInterval: window.setInterval.bind(window),
      pausedAnimations: [],
    }
  }
  return w[STATE_KEY]
}

const _s = getState()

// ---------------------------------------------------------------------------
// Exports — timing functions kept stable for overlay UI helpers
// ---------------------------------------------------------------------------
export const originalSetTimeout = _s.origSetTimeout
export const originalSetInterval = _s.origSetInterval

// ---------------------------------------------------------------------------
// Freeze / Unfreeze
// ---------------------------------------------------------------------------

function isAgentationElement(el: Element | null): boolean {
  if (!el) return false
  return EXCLUDE_SELECTORS.some((selector) => !!el.closest?.(selector))
}

export function freeze(): void {
  if (typeof document === "undefined") return
  if (_s.frozen) return
  _s.frozen = true

  // CSS injection — pause CSS animations and kill transitions
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement("style")
    style.id = STYLE_ID
  }
  style.textContent = `
    *${NOT_SELECTORS},
    *${NOT_SELECTORS}::before,
    *${NOT_SELECTORS}::after {
      animation-play-state: paused !important;
      transition: none !important;
    }
  `
  document.head.appendChild(style)

  // WAAPI — pause only RUNNING non-agentation animations and store references
  _s.pausedAnimations = []
  try {
    document.getAnimations().forEach((anim) => {
      if (anim.playState !== "running") return
      const target = (anim.effect as KeyframeEffect)?.target as Element | null
      if (!isAgentationElement(target)) {
        anim.pause()
        _s.pausedAnimations.push(anim)
      }
    })
  } catch {
    // getAnimations may not be available in all environments
  }

  // Pause videos
  document.querySelectorAll("video").forEach((video) => {
    if (!video.paused) {
      video.dataset.wasPaused = "false"
      video.pause()
    }
  })
}

export function unfreeze(): void {
  if (typeof document === "undefined") return
  if (!_s.frozen) return
  _s.frozen = false

  // WAAPI — resume the exact animations we paused BEFORE removing CSS
  for (const anim of _s.pausedAnimations) {
    try {
      anim.play()
    } catch (e) {
      console.warn("[agentation] Error resuming animation:", e)
    }
  }
  _s.pausedAnimations = []

  // Now remove CSS injection
  document.getElementById(STYLE_ID)?.remove()

  // Resume videos
  document.querySelectorAll("video").forEach((video) => {
    if (video.dataset.wasPaused === "false") {
      video.play().catch(() => {})
      delete video.dataset.wasPaused
    }
  })
}
