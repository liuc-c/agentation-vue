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
  /** Sync endpoint URL (default: "http://localhost:4747") */
  endpoint: string
  /** Optional MCP transport endpoint. When omitted, defaults to endpoint port + 1. */
  mcpEndpoint?: string
  /** Optional stable project identifier for multi-project shared servers. */
  projectId?: string
  /** Whether to automatically sync annotations (default: true) */
  autoSync?: boolean
  /** Debounce window in ms for batching syncs (default: 400) */
  debounceMs?: number
  /**
   * Ensure the shared Agentation server is running during `vite dev`.
   * When multiple projects point to the same ports, the plugin health-checks
   * first and reuses the existing process instead of starting a duplicate.
   */
  ensureServer?: boolean
}

export const DEFAULT_AGENTATION_SYNC_OPTIONS: Readonly<Required<Omit<AgentationVueSyncOptions, "mcpEndpoint" | "projectId">>> = {
  endpoint: "http://localhost:4747",
  autoSync: true,
  debounceMs: 400,
  ensureServer: true,
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
  /** Sync endpoint configuration for shared Agentation API/MCP workflow. Defaults on unless set to false. */
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
  const resolvedSync = raw.sync === false
    ? false
    : {
        ...DEFAULT_AGENTATION_SYNC_OPTIONS,
        ...raw.sync,
      }

  return {
    enabled: raw.enabled ?? (command === "serve"),
    storagePrefix: raw.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
    outputDetail: raw.outputDetail ?? "standard",
    locale: raw.locale ?? "en",
    sync: resolvedSync,
    inspector: raw.inspector ?? "tracer",
  }
}

export function resolveMcpEndpoint(sync: AgentationVueSyncOptions): string | undefined {
  if (sync.mcpEndpoint) {
    return sync.mcpEndpoint.replace(/\/+$/, "")
  }

  try {
    const apiUrl = new URL(sync.endpoint)
    const protocolDefaultPort = apiUrl.protocol === "https:" ? 443 : 80
    const apiPort = parseInt(apiUrl.port || String(protocolDefaultPort), 10)
    if (!Number.isFinite(apiPort)) {
      return undefined
    }

    const nextPort = apiPort + 1
    apiUrl.port = String(nextPort)
    return apiUrl.toString().replace(/\/+$/, "")
  } catch {
    return undefined
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
