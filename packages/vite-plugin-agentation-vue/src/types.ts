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
  /** Unified companion endpoint URL (default: "http://localhost:4748") */
  endpoint: string
  /** @deprecated MCP now shares the same endpoint as the V2 API companion. */
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

export interface AgentationVueAgentOptions {
  /** Whether the agent companion UI and runtime bridge are enabled. */
  enabled?: boolean
  /** Whether new or updated annotations auto-dispatch to the active agent. */
  autoSend?: boolean
}

export const DEFAULT_AGENTATION_SYNC_OPTIONS: Readonly<Required<Omit<AgentationVueSyncOptions, "mcpEndpoint" | "projectId">>> = {
  endpoint: "http://localhost:4748",
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
  /** Local ACP companion bridge configuration. */
  agent?: AgentationVueAgentOptions | false
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
  projectId?: string
  projectRoot?: string
  outputDetail: OutputDetailLevel
  locale: Locale
  sync: AgentationVueSyncOptions | false
  agent: {
    enabled: boolean
    autoSend: boolean
  }
  inspector: "tracer"
}

function inferProjectIdFromRoot(rootDir?: string): string | undefined {
  const normalizedRoot = rootDir?.trim().replace(/[\\/]+$/g, "")
  if (!normalizedRoot) {
    return undefined
  }

  const segments = normalizedRoot.split(/[\\/]/).filter(Boolean)
  const projectId = segments.at(-1)
  if (!projectId || projectId === "." || projectId === ".." || /^[A-Za-z]:$/.test(projectId)) {
    return undefined
  }

  return projectId
}

export function resolveOptions(
  raw: AgentationVueOptions = {},
  command: "serve" | "build" = "serve",
  rootDir?: string,
): ResolvedAgentationVueOptions {
  const configuredSync = raw.sync === false ? undefined : raw.sync
  const projectId = configuredSync?.projectId?.trim() || inferProjectIdFromRoot(rootDir)
  const configuredAgent = raw.agent === false ? { enabled: false, autoSend: false } : {
    enabled: raw.agent?.enabled ?? command === "serve",
    autoSend: raw.agent?.autoSend ?? false,
  }
  const resolvedSync = raw.sync === false
    ? false
    : {
        ...DEFAULT_AGENTATION_SYNC_OPTIONS,
        ...configuredSync,
        projectId,
      }

  return {
    enabled: raw.enabled ?? (command === "serve"),
    storagePrefix: raw.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
    projectId,
    projectRoot: rootDir,
    outputDetail: raw.outputDetail ?? "standard",
    locale: raw.locale ?? "en",
    sync: resolvedSync,
    agent: configuredAgent,
    inspector: raw.inspector ?? "tracer",
  }
}

export function resolveMcpEndpoint(sync: AgentationVueSyncOptions): string | undefined {
  return (sync.mcpEndpoint || sync.endpoint).replace(/\/+$/, "")
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
