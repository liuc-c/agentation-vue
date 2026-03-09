import type {
  AnnotationV2,
  OutputDetailLevel,
  SourceLocation,
  StorageOptions,
} from "@liuovo/agentation-vue-core"

export interface UiNotification {
  message: string
  kind?: "info" | "warning" | "error"
  duration?: number
}

export interface RuntimeSyncInfo {
  endpoint: string
  mcpEndpoint?: string
  projectId?: string
  mcpHttpUrl?: string
  mcpSseUrl?: string
}

export interface RuntimeSyncEvent {
  type: "reconciled" | "error"
  source: "init" | "flush" | "remote"
  annotationCount?: number
  message?: string
}

// ---------------------------------------------------------------------------
// Runtime bridge — structural contract consumed by ui-vue
// ---------------------------------------------------------------------------
// Defined here (not in the Vite plugin package) to avoid circular imports.
// The plugin satisfies this interface structurally when mounting the Vue app.

export interface RuntimeStorageBridge {
  options: StorageOptions
  load(): AnnotationV2[]
  save(annotations: AnnotationV2[]): void
  clear(): void
}

/**
 * Sync bridge — optional, created when `sync` config is provided.
 * Handles debounced annotation syncing to the MCP server.
 */
export interface RuntimeSyncBridge {
  /** Connection info surfaced to the product UI. */
  readonly info: RuntimeSyncInfo
  /** Perform initial sync (flush any unsynced annotations). */
  init(): Promise<void>
  /** Enqueue an annotation for upsert to the server. */
  enqueueUpsert(annotation: AnnotationV2): void
  /** Enqueue an annotation update to the server. */
  enqueueUpdate(annotation: AnnotationV2): void
  /** Enqueue a delete for the given annotation. */
  enqueueDelete(annotation: AnnotationV2): void
  /** Subscribe to sync lifecycle events. */
  subscribe(listener: (event: RuntimeSyncEvent) => void): () => void
  /** Dispose network listeners and timers. */
  dispose(): void
}

export interface RuntimeBridge {
  appRoot: HTMLDivElement
  overlayRoot: HTMLDivElement
  options: { outputDetail: OutputDetailLevel }
  storage: RuntimeStorageBridge
  /** Optional sync bridge — present when sync is configured. */
  sync?: RuntimeSyncBridge
  /** Emit a UI notification to the overlay. */
  notify?(notification: UiNotification): void
  /** Subscribe to UI notifications emitted through the runtime bridge. */
  subscribeNotifications?(listener: (notification: UiNotification) => void): () => void
  /** Resolve a DOM element to its Vue source location. */
  resolveSource(el: HTMLElement): SourceLocation | null
}

// ---------------------------------------------------------------------------
// Interaction snapshots
// ---------------------------------------------------------------------------

/** Document-space bounding box (relative to page, not viewport). */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/** Viewport-space rectangle used during drag selection. */
export interface AreaSelectionRect {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

/** An element matched during drag-to-select area selection. */
export interface AreaSelectionMatch extends HoverSnapshot {
  elementPath: string
  source?: SourceLocation | null
}

/** Lightweight snapshot captured during pointer-over. */
export interface HoverSnapshot {
  element: HTMLElement
  rect: DOMRectReadOnly
  elementName: string
}

/** Extended snapshot captured on click-select, including resolved source. */
export interface SelectionSnapshot extends HoverSnapshot {
  source: SourceLocation
  elementPath: string
  /** Text selected by the user at click time (if any). */
  selectedText?: string
  /** True when created from drag/region selection. */
  isMultiSelect?: boolean
  /** Document-space bounding boxes for the selected elements. */
  elementBoundingBoxes?: BoundingBox[]
  /** Live DOM elements included in the multi-select. */
  multiSelectElements?: HTMLElement[]
}
