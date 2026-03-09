import {
  formatToJSON,
  formatToMarkdown,
  getAccessibilityInfo,
  getElementClasses,
  getElementPath,
  getForensicComputedStyles,
  getFullElementPath,
  getNearbyElements,
  getNearbyText,
  identifyElement,
} from "@liuovo/agentation-vue-core"
import type {
  AnnotationExportDocument,
  AnnotationV2,
  ExportPageContext,
} from "@liuovo/agentation-vue-core"
import { reactive } from "vue"
import { buildElementLocator } from "../annotation-target.js"
import type { BoundingBox, RuntimeBridge, SelectionSnapshot } from "../types.js"

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface AnnotationsStore {
  /** Reactive annotation list — components can read directly. */
  readonly annotations: readonly AnnotationV2[]
  /** Whether annotation mode is enabled. */
  enabled: boolean

  /** Load persisted annotations from storage into state. */
  hydrate(): void
  /** Create & persist a new annotation from a comment + selection snapshot. */
  saveAnnotation(comment: string, snapshot: SelectionSnapshot): AnnotationV2
  /** Update the comment of an existing annotation by ID. */
  updateAnnotation(id: string, comment: string): void
  /** Remove an annotation by ID and persist the change. */
  removeAnnotation(id: string): void
  /** Remove all annotations and clear storage. */
  clearAll(): void
  /** Export all annotations as a structured JSON document. */
  exportJSON(): AnnotationExportDocument
  /** Export all annotations as a Markdown string. */
  exportMarkdown(): string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the singleton annotations store.
 *
 * Called once during app bootstrap; OverlayRoot provides it
 * to the component tree via `provide()`.
 */
export function createAnnotationsStore(bridge: RuntimeBridge): AnnotationsStore {
  const state = reactive({
    annotations: [] as AnnotationV2[],
    enabled: true,
  })

  // -- Hydrate ---------------------------------------------------------------

  function hydrate(): void {
    try {
      const loaded = bridge.storage.load()
      state.annotations.splice(0, state.annotations.length, ...loaded)
    } catch {
      console.warn("[agentation] Failed to hydrate annotations from storage")
    }
  }

  // -- CRUD ------------------------------------------------------------------

  function saveAnnotation(comment: string, snapshot: SelectionSnapshot): AnnotationV2 {
    const trimmed = comment.trim()
    if (!trimmed) {
      throw new Error("[agentation] Annotation comment must not be empty")
    }

    const annotation = buildAnnotation(trimmed, snapshot)
    state.annotations.push(annotation)
    persist()
    bridge.sync?.enqueueUpsert(annotation)
    return annotation
  }

  function removeAnnotation(id: string): void {
    const idx = state.annotations.findIndex((a) => a.id === id)
    if (idx < 0) return
    const removed = state.annotations[idx]
    state.annotations.splice(idx, 1)
    persist()
    bridge.sync?.enqueueDelete(removed)
  }

  function updateAnnotation(id: string, comment: string): void {
    const trimmed = comment.trim()
    if (!trimmed) return

    const idx = state.annotations.findIndex((a) => a.id === id)
    if (idx < 0) return

    const updated = { ...state.annotations[idx], comment: trimmed }
    state.annotations.splice(idx, 1, updated)
    persist()
    bridge.sync?.enqueueUpdate(updated)
  }

  function clearAll(): void {
    const toDelete = [...state.annotations]
    state.annotations.splice(0, state.annotations.length)
    bridge.storage.clear()
    for (const annotation of toDelete) {
      bridge.sync?.enqueueDelete(annotation)
    }
  }

  // -- Export ----------------------------------------------------------------

  function exportJSON(): AnnotationExportDocument {
    return formatToJSON([...state.annotations], {
      detailLevel: bridge.options.outputDetail,
      page: buildPageContext(),
    })
  }

  function exportMarkdown(): string {
    return formatToMarkdown([...state.annotations], {
      detailLevel: bridge.options.outputDetail,
      page: buildPageContext(),
    })
  }

  // -- Persistence -----------------------------------------------------------

  function persist(): void {
    try {
      if (state.annotations.length === 0) {
        bridge.storage.clear()
      } else {
        bridge.storage.save([...state.annotations])
      }
    } catch {
      console.warn("[agentation] Failed to persist annotations")
    }
  }

  // -- Public store object ---------------------------------------------------

  return {
    get annotations() {
      return state.annotations
    },
    get enabled() {
      return state.enabled
    },
    set enabled(value: boolean) {
      state.enabled = value
    },
    hydrate,
    saveAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAll,
    exportJSON,
    exportMarkdown,
  }
}

// ---------------------------------------------------------------------------
// Annotation builder
// ---------------------------------------------------------------------------

function buildAnnotation(comment: string, snapshot: SelectionSnapshot): AnnotationV2 {
  const { element, source, elementName, selectedText, isMultiSelect } = snapshot
  const identified = identifyElement(element)

  return {
    id: generateId(),
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    elementSelector: isMultiSelect ? elementName : (identified.name || elementName),
    elementText: selectedText,
    comment,
    source: { ...source },
    metadata: buildMetadata(snapshot),
  }
}

function buildMetadata(snapshot: SelectionSnapshot): Record<string, unknown> {
  const {
    element,
    rect,
    elementPath,
    source,
    selectedText,
    isMultiSelect = false,
    multiSelectElements,
    elementBoundingBoxes,
  } = snapshot

  const fixed = !isMultiSelect && isFixedPosition(element)

  // For multi-select, try to get live bounding boxes from the DOM elements
  const liveBoxes = multiSelectElements
    ?.filter((el) => document.contains(el))
    .map((el) => {
      const elRect = el.getBoundingClientRect()
      return elRect.width > 0 && elRect.height > 0
        ? toDocumentBox(elRect, isFixedPosition(el))
        : null
    })
    .filter((box): box is BoundingBox => box !== null)

  const selectionBoxes = liveBoxes?.length ? liveBoxes : elementBoundingBoxes
  const boundingBox = toDocumentBox(rect, isMultiSelect ? false : fixed)

  const raw: Record<string, unknown> = {
    elementPath: elementPath || getElementPath(element) || undefined,
    fullPath: getFullElementPath(element) || undefined,
    cssClasses: getElementClasses(element) || undefined,
    boundingBox,
    elementLocator: isMultiSelect ? undefined : buildElementLocator(element),
    nearbyText: getNearbyText(element) || undefined,
    nearbyElements: getNearbyElements(element) || undefined,
    computedStyles: getForensicComputedStyles(element) || undefined,
    accessibility: getAccessibilityInfo(element) || undefined,
    isMultiSelect: isMultiSelect || undefined,
    elementBoundingBoxes: selectionBoxes?.length ? selectionBoxes : undefined,
    isFixed: isMultiSelect ? undefined : fixed,
    project_area: buildProjectArea(snapshot),
    context_hints: buildContextHints({
      element,
      source,
      selectedText,
      nearbyText: getNearbyText(element) || undefined,
      isMultiSelect,
    }),
  }

  // Strip undefined entries for clean JSON
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  )
}

function buildProjectArea(snapshot: SelectionSnapshot): string | undefined {
  const route = window.location.pathname || "/"
  const hierarchy = snapshot.source.componentHierarchy || snapshot.source.componentName
  const landmark = getLandmarkLabel(snapshot.element)

  const parts = [route, hierarchy, landmark].filter(Boolean)
  return parts.length > 0 ? parts.join(" :: ") : undefined
}

function buildContextHints(input: {
  element: HTMLElement
  source: SelectionSnapshot["source"]
  selectedText?: string
  nearbyText?: string
  isMultiSelect?: boolean
}): string[] | undefined {
  const hints = new Set<string>()
  const { element, source, selectedText, nearbyText, isMultiSelect } = input

  const pushHint = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    hints.add(`${label}: ${trimmed.slice(0, 120)}`)
  }

  pushHint("route", window.location.pathname || "/")
  pushHint("component", source.componentName)
  pushHint("componentHierarchy", source.componentHierarchy)
  pushHint("framework", source.framework)
  pushHint("selectedText", selectedText)
  pushHint("nearbyText", nearbyText)
  pushHint("heading", findClosestHeadingText(element))
  pushHint("landmark", getLandmarkLabel(element))
  pushHint("role", element.getAttribute("role"))
  pushHint("ariaLabel", element.getAttribute("aria-label"))
  pushHint("name", element.getAttribute("name"))
  pushHint("placeholder", element.getAttribute("placeholder"))
  pushHint("title", element.getAttribute("title"))
  pushHint("testId", element.getAttribute("data-testid") || element.getAttribute("data-test"))
  pushHint("id", element.id || undefined)
  pushHint("multiSelect", isMultiSelect ? "true" : undefined)

  return hints.size > 0 ? [...hints].slice(0, 8) : undefined
}

function toDocumentBox(rect: DOMRectReadOnly, isFixed: boolean): BoundingBox {
  return {
    x: isFixed ? rect.left : rect.left + window.scrollX,
    y: isFixed ? rect.top : rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPageContext(): ExportPageContext {
  return {
    pathname: window.location.pathname,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    devicePixelRatio: window.devicePixelRatio,
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function findClosestHeadingText(element: HTMLElement): string | undefined {
  const heading = element.closest("section, article, main, aside, form, dialog")
    ?.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6")
    ?? element.closest<HTMLElement>("label")

  return heading?.innerText.trim() || undefined
}

function getLandmarkLabel(element: HTMLElement): string | undefined {
  const landmark = element.closest<HTMLElement>(
    "[role], main, header, nav, aside, footer, section, article, form, dialog",
  )
  if (!landmark) return undefined

  const role = landmark.getAttribute("role") || landmark.tagName.toLowerCase()
  const label = landmark.getAttribute("aria-label")
    || landmark.getAttribute("data-testid")
    || landmark.id

  return label ? `${role}:${label}` : role
}

function isFixedPosition(element: HTMLElement): boolean {
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    const position = window.getComputedStyle(current).position
    if (position === "fixed" || position === "sticky") return true
    current = current.parentElement
  }
  return false
}
