import {
  DEFAULT_STORAGE_PREFIX,
  type AnnotationV2,
  type OutputDetailLevel,
  type SourceLocation,
  type StorageOptions,
} from "@liuovo/agentation-vue-core"
import type { Locale } from "@liuovo/agentation-vue-ui"

// ---------------------------------------------------------------------------
// Plugin configuration (user-facing)
// ---------------------------------------------------------------------------

export interface AgentationVueSyncOptions {
  /** Sync endpoint URL (e.g. "http://localhost:4747") */
  endpoint: string
  /** Whether to automatically sync annotations (default: true) */
  autoSync?: boolean
  /** Debounce window in ms for batching syncs (default: 400) */
  debounceMs?: number
}

export interface AgentationVueOptions {
  /** Whether the plugin is enabled (default: true in dev, false in build) */
  enabled?: boolean
  /** localStorage key prefix (default: "agentation-vue-") */
  storagePrefix?: string
  /** Level of detail in export output (default: "standard") */
  outputDetail?: OutputDetailLevel
  /** Default UI locale (default: "en") */
  locale?: Locale
  /** Sync endpoint configuration — no-op placeholder until Phase 5 */
  sync?: AgentationVueSyncOptions | false
  /** Inspector strategy (default: "tracer") — reserved for future alternatives */
  inspector?: "tracer"
}

/** @deprecated Use {@link AgentationVueOptions} instead */
export type AgentationVuePluginOptions = AgentationVueOptions

// ---------------------------------------------------------------------------
// Resolved options (all defaults applied)
// ---------------------------------------------------------------------------

export interface ResolvedAgentationVueOptions {
  enabled: boolean
  storagePrefix: string
  outputDetail: OutputDetailLevel
  locale: Locale
  sync: AgentationVueSyncOptions | false
  inspector: "tracer"
}

export function resolveOptions(
  raw: AgentationVueOptions = {},
  command: "serve" | "build" = "serve",
): ResolvedAgentationVueOptions {
  return {
    enabled: raw.enabled ?? (command === "serve"),
    storagePrefix: raw.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
    outputDetail: raw.outputDetail ?? "standard",
    locale: raw.locale ?? "en",
    sync: raw.sync ?? false,
    inspector: raw.inspector ?? "tracer",
  }
}

// ---------------------------------------------------------------------------
// Runtime types (browser-side)
// ---------------------------------------------------------------------------

/**
 * Storage bridge — subset of core's storage API, scoped to a pathname.
 * Created by the runtime bootstrap, consumed by the annotations store.
 */
export interface AgentationStorageBridge {
  options: StorageOptions
  load(): AnnotationV2[]
  save(annotations: AnnotationV2[]): void
  clear(): void
}

/**
 * Minimal runtime handle exposed on `window.__agentationRuntime`.
 * Used only for HMR disposal — the real orchestration lives in entry.ts.
 */
export interface AgentationRuntimeHandle {
  dispose(): void
}

declare global {
  interface Window {
    __agentationRuntime?: AgentationRuntimeHandle
    __agentationDemo?: {
      inspect(elOrSelector?: HTMLElement | string | null): SourceLocation | null
    }
  }
}
