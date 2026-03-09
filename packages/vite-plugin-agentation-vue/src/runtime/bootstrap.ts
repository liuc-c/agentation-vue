import {
  clearAnnotations,
  identifyElement,
  loadAnnotations,
  saveAnnotations,
} from "@liuovo/agentation-vue-core"
import type { AnnotationV2, SourceLocation, StorageOptions } from "@liuovo/agentation-vue-core"
import type {
  AnnotationsStore,
  AreaSelectionMatch,
  AreaSelectionRect,
  AreaSelectionState,
  BoundingBox,
  SelectionState,
  SettingsState,
  UiNotification,
} from "@liuovo/agentation-vue-ui"
import { resolveMessages } from "@liuovo/agentation-vue-ui"
import type { AgentationStorageBridge } from "../types.ts"
import { resolveElementSource } from "./resolver/index.ts"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_CONTAINER_ID = "agentation-app"
const OVERLAY_CONTAINER_ID = "agentation-overlay"
const APP_ROOT_ID = "agentation-app-root"
const OVERLAY_ROOT_ID = "agentation-overlay-root"
const OWN_SELECTOR = `#${APP_CONTAINER_ID}, #${OVERLAY_CONTAINER_ID}`
const CONTAINER_BASE_STYLES = [
  ["display", "block"],
  ["position", "fixed"],
  ["inset", "0"],
  ["margin", "0"],
  ["padding", "0"],
  ["border", "0"],
  ["overflow", "visible"],
  ["pointer-events", "none"],
  ["background", "none"],
] as const
const SHADOW_ROOT_CONTAINER_BASE_STYLES = [
  ["font-size", "16px"],
  ["line-height", "1.5"],
  ["font-family", "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"],
] as const
const UI_STYLE_MARKER = "data-agentation-shadow-style"
const UI_STYLE_PATTERNS = [
  "packages/ui-vue/",
  "agentation-vue-ui/",
  "agentation-vue-ui\\",
] as const

/** Minimum drag distance (px) before area selection activates. */
const DRAG_THRESHOLD = 20
/** Throttle interval (ms) for area detection during drag. */
const AREA_UPDATE_INTERVAL_MS = 24

/** Tags that contain meaningful interactive/content elements. */
const AREA_CANDIDATE_SELECTOR = [
  "button", "a", "input", "select", "textarea",
  "img", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "label", "td", "th", "article", "section",
].join(", ")

/** Tags where drag should not start (allow native text selection instead). */
const DRAG_TEXT_SELECTOR = "p, span, a, h1, h2, h3, h4, h5, h6, li"

// ---------------------------------------------------------------------------
// Infrastructure setup (containers + storage)
// ---------------------------------------------------------------------------

export interface RuntimeInfrastructure {
  appRoot: HTMLDivElement
  overlayRoot: HTMLDivElement
  storage: AgentationStorageBridge
  resolveSource(el: HTMLElement): SourceLocation | null
  cleanup(): void
}

/**
 * Creates the DOM containers and storage bridge.
 * Does NOT register event listeners — that's done in `attachListeners()`.
 */
export function setupInfrastructure(
  storagePrefix: string,
): RuntimeInfrastructure {
  const appMount = ensureShadowMount(APP_CONTAINER_ID, APP_ROOT_ID, "100000")
  const overlayMount = ensureShadowMount(OVERLAY_CONTAINER_ID, OVERLAY_ROOT_ID, "99999")
  const storage = createStorageBridge(storagePrefix)

  function resolveSource(el: HTMLElement): SourceLocation | null {
    try {
      return resolveElementSource(el)
    } catch {
      return null
    }
  }

  return {
    appRoot: appMount.root,
    overlayRoot: overlayMount.root,
    storage,
    resolveSource,
    cleanup() {
      appMount.cleanup()
      overlayMount.cleanup()
    },
  }
}

// ---------------------------------------------------------------------------
// Event listener attachment
// ---------------------------------------------------------------------------

export interface ListenerCleanup {
  dispose(): void
}

/**
 * Registers pointer/click event listeners that drive Vue selection state.
 *
 * Handles:
 * - Single-click element selection
 * - Drag-to-select area selection (like React's multi-select)
 * - `blockInteractions` setting for click interception
 */
export function attachListeners(
  store: AnnotationsStore,
  selection: SelectionState,
  areaSelection: AreaSelectionState,
  settings: SettingsState,
  resolveSource: (el: HTMLElement) => SourceLocation | null,
  notify?: (notification: UiNotification) => void,
): ListenerCleanup {
  let lastHovered: HTMLElement | null = null
  let lastClicked: HTMLElement | null = null

  // --- Drag selection state (non-reactive for perf) ---
  let pointerDown: { x: number; y: number; target: HTMLElement } | null = null
  let dragActive = false
  let suppressNextClick = false
  let lastAreaUpdateTime = 0

  function notifySourceUnavailable(message: string): void {
    notify?.({
      kind: "warning",
      duration: 2600,
      message,
    })
  }

  // --- Hover ---

  const onPointerOver = (e: Event) => {
    const target = asInspectable(e.target)
    if (!target) return
    lastHovered = target
    if (!store.enabled || areaSelection.active) return

    const identified = identifyElement(target)
    selection.setHovered({
      element: target,
      rect: target.getBoundingClientRect(),
      elementName: identified.name,
    })
  }

  const onPointerOut = (e: PointerEvent) => {
    const target = asInspectable(e.target)
    if (target && lastHovered === target) lastHovered = null
    if (!store.enabled || areaSelection.active || !target) return

    const related = asInspectable(e.relatedTarget)
    if (!related) {
      selection.clearHovered()
    }
  }

  // --- Drag-to-select area selection ---

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = asInspectable(e.target)
    if (!target || !store.enabled) return
    if (shouldSkipDragStart(target)) return

    pointerDown = { x: e.clientX, y: e.clientY, target }
    dragActive = false
    lastAreaUpdateTime = 0
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return
    if (!store.enabled) {
      resetDrag()
      return
    }

    const dx = e.clientX - pointerDown.x
    const dy = e.clientY - pointerDown.y
    const distanceSq = dx * dx + dy * dy

    // Activate drag once the threshold is exceeded
    if (!dragActive && distanceSq >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
      dragActive = true
      selection.clearSelection()
      selection.clearHovered()
      areaSelection.start(pointerDown.x, pointerDown.y)
    }

    if (!dragActive) return

    areaSelection.update(e.clientX, e.clientY)

    // Throttle element detection
    const now = Date.now()
    if (now - lastAreaUpdateTime >= AREA_UPDATE_INTERVAL_MS) {
      const area = normalizeRect(pointerDown.x, pointerDown.y, e.clientX, e.clientY)
      areaSelection.setMatched(collectMatches(area, resolveSource, false))
      lastAreaUpdateTime = now
    }

    e.preventDefault()
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return

    const wasDragging = dragActive
    const startPos = pointerDown
    resetDrag()

    if (!wasDragging) return

    suppressNextClick = true
    e.preventDefault()
    e.stopPropagation()

    const area = normalizeRect(startPos.x, startPos.y, e.clientX, e.clientY)
    if (area.width < DRAG_THRESHOLD || area.height < DRAG_THRESHOLD) return

    const matches = collectMatches(area, resolveSource, true)
    if (matches.length === 0) return

    const messages = resolveMessages(settings.locale)

    // Find first match with a resolved source to use as anchor
    const anchor = matches.find((m) => m.source) ?? null
    if (!anchor?.source) {
      console.warn("[agentation] Could not resolve source for area selection")
      notifySourceUnavailable(messages.notifications.sourceUnavailableArea)
      return
    }

    selection.select({
      element: anchor.element,
      rect: getUnionRect(matches.map((m) => m.rect)),
      elementName: buildAreaLabel(matches, messages),
      elementPath: "multi-select",
      source: anchor.source,
      isMultiSelect: true,
      multiSelectElements: matches.map((m) => m.element),
      elementBoundingBoxes: matches.map((m) =>
        toDocumentBox(m.rect, isElementFixed(m.element)),
      ),
    })
  }

  const onPointerCancel = () => {
    resetDrag()
  }

  // --- Click (single-element selection) ---

  const onClick = (e: MouseEvent) => {
    if (suppressNextClick) {
      suppressNextClick = false
      e.preventDefault()
      e.stopPropagation()
      return
    }

    const target = asInspectable(e.target)
    if (!target) return

    const elementUnder = asInspectable(deepElementFromPoint(e.clientX, e.clientY)) ?? target
    lastClicked = elementUnder
    if (!store.enabled || areaSelection.active) return

    if (settings.blockInteractions) {
      e.preventDefault()
      e.stopPropagation()
    }

    const source = resolveSource(elementUnder)
    if (!source) {
      console.warn("[agentation] Could not resolve source for:", elementUnder)
      notifySourceUnavailable(resolveMessages(settings.locale).notifications.sourceUnavailableElement)
      return
    }

    const identified = identifyElement(elementUnder)
    const selectedText = window.getSelection()?.toString().trim() || undefined
    selection.select({
      element: elementUnder,
      rect: elementUnder.getBoundingClientRect(),
      elementName: identified.name,
      elementPath: identified.path,
      source,
      selectedText,
    })
  }

  // --- Helpers ---

  function resetDrag(): void {
    pointerDown = null
    dragActive = false
    areaSelection.clear()
  }

  // --- Register all listeners ---

  document.addEventListener("pointerover", onPointerOver, true)
  document.addEventListener("pointerout", onPointerOut, true)
  document.addEventListener("pointerdown", onPointerDown, true)
  document.addEventListener("pointermove", onPointerMove, true)
  document.addEventListener("pointerup", onPointerUp, true)
  document.addEventListener("pointercancel", onPointerCancel, true)
  document.addEventListener("click", onClick, true)

  // Console API
  function inspect(elOrSelector?: HTMLElement | string | null): SourceLocation | null {
    const el = resolveTarget(elOrSelector, lastClicked ?? lastHovered)
    if (!el) {
      console.warn("[agentation] No element to inspect. Try: __agentationDemo.inspect($0)")
      return null
    }

    const result = resolveSource(el)
    if (result) {
      console.log("[agentation] SourceLocation:", result)
    } else {
      console.warn("[agentation] Could not resolve source for:", el)
    }
    return result
  }

  window.__agentationDemo = { inspect }

  return {
    dispose() {
      document.removeEventListener("pointerover", onPointerOver, true)
      document.removeEventListener("pointerout", onPointerOut, true)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("pointermove", onPointerMove, true)
      document.removeEventListener("pointerup", onPointerUp, true)
      document.removeEventListener("pointercancel", onPointerCancel, true)
      document.removeEventListener("click", onClick, true)
      resetDrag()
      lastHovered = null
      lastClicked = null
    },
  }
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function ensureShadowMount(
  hostId: string,
  rootId: string,
  zIndex: string,
): {
  host: HTMLDivElement
  root: HTMLDivElement
  cleanup(): void
} {
  const host = ensureContainer(hostId, zIndex)
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" })
  const root = ensureShadowRootContainer(shadowRoot, rootId)
  const stopSync = syncUiStylesToShadowRoot(shadowRoot, root)

  return {
    host,
    root,
    cleanup() {
      stopSync()
      shadowRoot.replaceChildren()
    },
  }
}

function ensureContainer(id: string, zIndex: string): HTMLDivElement {
  const existing = document.getElementById(id)
  if (existing instanceof HTMLDivElement) {
    applyContainerBaseStyles(existing, zIndex)
    return existing
  }

  const el = document.createElement("div")
  el.id = id
  applyContainerBaseStyles(el, zIndex)

  if (existing) {
    existing.replaceWith(el)
  } else {
    document.body.appendChild(el)
  }
  return el
}

function applyContainerBaseStyles(el: HTMLDivElement, zIndex: string): void {
  for (const [property, value] of CONTAINER_BASE_STYLES) {
    el.style.setProperty(property, value)
  }
  el.style.setProperty("z-index", zIndex)
}

function ensureShadowRootContainer(
  shadowRoot: ShadowRoot,
  rootId: string,
): HTMLDivElement {
  const existing = shadowRoot.getElementById(rootId)
  if (existing instanceof HTMLDivElement) {
    applyShadowRootContainerBaseStyles(existing)
    return existing
  }

  const root = document.createElement("div")
  root.id = rootId
  applyShadowRootContainerBaseStyles(root)
  shadowRoot.appendChild(root)
  return root
}

function applyShadowRootContainerBaseStyles(el: HTMLDivElement): void {
  for (const [property, value] of SHADOW_ROOT_CONTAINER_BASE_STYLES) {
    el.style.setProperty(property, value)
  }
}

function syncUiStylesToShadowRoot(
  shadowRoot: ShadowRoot,
  root: HTMLDivElement,
): () => void {
  const sync = () => {
    shadowRoot.querySelectorAll(`[${UI_STYLE_MARKER}]`).forEach((node) => {
      node.remove()
    })

    for (const node of getUiStyleNodes()) {
      const clone = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement
      clone.setAttribute(UI_STYLE_MARKER, "")
      shadowRoot.insertBefore(clone, root)
    }
  }

  sync()

  const observer = new MutationObserver(() => {
    sync()
  })

  observer.observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-vite-dev-id", "href", "media", "disabled"],
  })

  return () => {
    observer.disconnect()
  }
}

function getUiStyleNodes(): Array<HTMLStyleElement | HTMLLinkElement> {
  return Array.from(document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link[rel=\"stylesheet\"]"))
    .filter((node) => isUiStyleNode(node))
}

function isUiStyleNode(node: HTMLStyleElement | HTMLLinkElement): boolean {
  if (node instanceof HTMLStyleElement) {
    return matchesUiStyleId(node.dataset.viteDevId ?? "")
  }

  return matchesUiStyleId(node.getAttribute("href") ?? "")
}

function matchesUiStyleId(value: string): boolean {
  return UI_STYLE_PATTERNS.some((pattern) => value.includes(pattern))
}

function asInspectable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  // Walk up from SVG/other non-HTML elements to the nearest HTMLElement
  let el: Element | null = target
  while (el && !(el instanceof HTMLElement)) {
    el = el.parentElement
  }
  if (!el) return null
  if (el.closest(OWN_SELECTOR)) return null
  return el
}

function resolveTarget(
  elOrSelector: HTMLElement | string | null | undefined,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (!elOrSelector) return fallback

  if (typeof elOrSelector === "string") {
    const found = document.querySelector<HTMLElement>(elOrSelector)
    return found && !found.closest(OWN_SELECTOR) ? found : null
  }

  return elOrSelector.closest(OWN_SELECTOR) ? null : elOrSelector
}

/** Pierce shadow roots to find the deepest element at a point. */
function deepElementFromPoint(x: number, y: number): HTMLElement | null {
  let element = document.elementFromPoint(x, y) as HTMLElement | null
  if (!element) return null

  while (element.shadowRoot) {
    const deeper = element.shadowRoot.elementFromPoint(x, y) as HTMLElement | null
    if (!deeper || deeper === element) break
    element = deeper
  }

  return element
}

// ---------------------------------------------------------------------------
// Area selection helpers
// ---------------------------------------------------------------------------

/** Skip drag on text elements to allow native text selection. */
function shouldSkipDragStart(element: HTMLElement): boolean {
  return element.isContentEditable
    || !!element.closest(DRAG_TEXT_SELECTOR)
    || element.matches("article, section")
}

function isElementFixed(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    const position = window.getComputedStyle(current).position
    if (position === "fixed" || position === "sticky") return true
    current = current.parentElement
  }
  return false
}

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

function intersects(rect: DOMRectReadOnly, area: AreaSelectionRect): boolean {
  return rect.left < area.right
    && rect.right > area.left
    && rect.top < area.bottom
    && rect.bottom > area.top
}

function getUnionRect(rects: readonly DOMRectReadOnly[]): DOMRectReadOnly {
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

function toDocumentBox(rect: DOMRectReadOnly, isFixed: boolean): BoundingBox {
  return {
    x: isFixed ? rect.left : rect.left + window.scrollX,
    y: isFixed ? rect.top : rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  }
}

function buildAreaLabel(
  matches: readonly AreaSelectionMatch[],
  messages: ReturnType<typeof resolveMessages>,
): string {
  const names = matches.slice(0, 5).map((m) => m.elementName).join(", ")
  const remaining = Math.max(matches.length - 5, 0)
  return messages.selection.areaLabel(matches.length, names, remaining)
}

/**
 * Collect DOM elements that intersect with the drag area.
 *
 * Uses two strategies:
 * 1. `elementsFromPoint()` at key positions (corners, edges, center)
 * 2. `querySelectorAll()` for known interactive/content elements
 *
 * Filters out: invisible, tiny (<8px), oversized (page-covering) elements,
 * and deduplicates parents whose children are already in the set.
 */
function collectMatches(
  area: AreaSelectionRect,
  resolveSource: (el: HTMLElement) => SourceLocation | null,
  includeSource: boolean,
): AreaSelectionMatch[] {
  const candidates = new Set<HTMLElement>()

  // Sample points across the selection area
  const clampX = (v: number) => Math.max(0, Math.min(v, window.innerWidth - 1))
  const clampY = (v: number) => Math.max(0, Math.min(v, window.innerHeight - 1))
  const l = clampX(area.left)
  const r = clampX(area.right)
  const t = clampY(area.top)
  const b = clampY(area.bottom)
  const mx = (l + r) / 2
  const my = (t + b) / 2

  const samplePoints: Array<[number, number]> = [
    [l, t], [r, t], [l, b], [r, b],
    [mx, my], [mx, t], [mx, b], [l, my], [r, my],
  ]

  for (const [x, y] of samplePoints) {
    for (const el of document.elementsFromPoint(x, y)) {
      const inspectable = asInspectable(el)
      if (inspectable) candidates.add(inspectable)
    }
  }

  // Also check known interactive/content elements by selector
  document.querySelectorAll(AREA_CANDIDATE_SELECTOR).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const inspectable = asInspectable(node)
    if (!inspectable) return
    if (intersects(inspectable.getBoundingClientRect(), area)) {
      candidates.add(inspectable)
    }
  })

  // Filter and deduplicate
  const preliminary = [...candidates]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ element, rect }) => {
      const style = window.getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") return false
      if (style.pointerEvents === "none") return false
      if (rect.width < 8 || rect.height < 8) return false
      // Skip elements that cover most of the viewport (layout wrappers)
      if (rect.width > window.innerWidth * 0.9 && rect.height > window.innerHeight * 0.6) return false
      return intersects(rect, area)
    })

  // Remove parents whose children are already selected (prefer leaf elements)
  const filtered = preliminary.filter(({ element }, _i, items) =>
    !items.some(({ element: other }) => other !== element && element.contains(other)),
  )

  return filtered
    .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
    .map(({ element, rect }) => {
      const identified = identifyElement(element)
      return {
        element,
        rect,
        elementName: identified.name,
        elementPath: identified.path,
        source: includeSource ? resolveSource(element) : undefined,
      }
    })
}

// ---------------------------------------------------------------------------
// Storage bridge
// ---------------------------------------------------------------------------

function createStorageBridge(prefix: string): AgentationStorageBridge {
  const sessionPrefix = prefix
    ? (prefix.endsWith("-") ? `${prefix}session-` : `${prefix}-session-`)
    : "agentation-vue-session-"

  const opts: StorageOptions = { prefix, sessionPrefix }
  const pathname = () => window.location.pathname

  return {
    options: opts,
    load: () => loadAnnotations(pathname(), opts),
    save: (annotations: AnnotationV2[]) => {
      // Preserve _syncedTo markers from existing storage entries.
      // Without this, every persist() in the annotations store would
      // overwrite the markers, causing re-sync of already-synced data.
      const existing = loadAnnotations<AnnotationV2 & { _syncedTo?: string }>(pathname(), opts)
      const syncMap = new Map(
        existing
          .filter((a) => a._syncedTo)
          .map((a) => [a.id, a._syncedTo!]),
      )

      const merged = syncMap.size > 0
        ? annotations.map((a) => {
          const marker = syncMap.get(a.id)
          return marker ? { ...a, _syncedTo: marker } : a
        })
        : annotations

      saveAnnotations(pathname(), merged, opts)
    },
    clear: () => clearAnnotations(pathname(), opts),
  }
}
