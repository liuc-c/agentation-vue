import { reactive, watch } from "vue"
import type { ExportExcludeField, OutputDetailLevel } from "@liuovo/agentation-vue-core"
import { DEFAULT_LOCALE, isValidLocale } from "../i18n/index.js"
import type { ColorKey, Locale } from "../i18n/types.js"
import { COPY_EXCLUDE_FIELDS } from "../copy-fields.js"

// ---------------------------------------------------------------------------
// Settings state — persistent user preferences
// ---------------------------------------------------------------------------

const STORAGE_KEY = "agentation-vue-settings"

export const COLOR_OPTIONS = [
  { key: "purple" as const, value: "#AF52DE" },
  { key: "blue" as const, value: "#3c82f7" },
  { key: "cyan" as const, value: "#5AC8FA" },
  { key: "green" as const, value: "#34C759" },
  { key: "yellow" as const, value: "#FFD60A" },
  { key: "orange" as const, value: "#FF9500" },
  { key: "red" as const, value: "#FF3B30" },
] as const satisfies ReadonlyArray<{ key: ColorKey; value: string }>

export const DEFAULT_ANNOTATION_COLOR = "#3c82f7"

export type CopyFormat = "json" | "markdown"

export interface SettingsState {
  /** Level of detail in export output. */
  outputDetail: OutputDetailLevel
  /** Whether dark mode is active. */
  darkMode: boolean
  /** Whether annotation mode is enabled on load. */
  enabled: boolean
  /** Whether component source resolution is shown. */
  componentSourceEnabled: boolean
  /** Accent colour for annotation markers. */
  annotationColor: string
  /** Whether annotation markers are visible. */
  showMarkers: boolean
  /** Preferred export format for copy actions. */
  copyFormat: CopyFormat
  /** Prompt prefix prepended before clipboard output. */
  copyPrefix: string
  /** Export detail fields to remove from clipboard output. */
  copyExcludeFields: ExportExcludeField[]
  /** Whether to clear annotations after a successful copy. */
  autoClearAfterCopy: boolean
  /** Whether page interactions are blocked while annotating. */
  blockInteractions: boolean
  /** Current UI locale. */
  locale: Locale
  /** Whether auto-dispatch to the active agent is enabled. */
  agentAutoSendEnabled: boolean
  /** Locally preferred agent selection for the current project. */
  selectedAgentId: string

  /** Toggle between dark and light mode. */
  toggleDarkMode(): void
}

interface PersistedSettings {
  outputDetail?: OutputDetailLevel
  darkMode?: boolean
  enabled?: boolean
  componentSourceEnabled?: boolean
  annotationColor?: string
  showMarkers?: boolean
  copyFormat?: CopyFormat
  copyPrefix?: string
  copyExcludeFields?: ExportExcludeField[]
  autoClearAfterCopy?: boolean
  blockInteractions?: boolean
  locale?: Locale
  agentAutoSendEnabled?: boolean
  selectedAgentId?: string
}

/**
 * Creates the settings state with layered priority:
 *   plugin config < localStorage < runtime toggle
 */
export function createSettingsState(defaults?: Partial<PersistedSettings>): SettingsState {
  const persisted = loadSettings()

  const state = reactive({
    outputDetail: persisted.outputDetail ?? defaults?.outputDetail ?? "standard",
    darkMode: persisted.darkMode ?? defaults?.darkMode ?? true,
    enabled: persisted.enabled ?? defaults?.enabled ?? true,
    componentSourceEnabled: persisted.componentSourceEnabled ?? defaults?.componentSourceEnabled ?? true,
    annotationColor: persisted.annotationColor ?? defaults?.annotationColor ?? DEFAULT_ANNOTATION_COLOR,
    showMarkers: persisted.showMarkers ?? defaults?.showMarkers ?? true,
    copyFormat: persisted.copyFormat ?? defaults?.copyFormat ?? "markdown",
    copyPrefix: persisted.copyPrefix ?? defaults?.copyPrefix ?? "",
    copyExcludeFields: [...(persisted.copyExcludeFields ?? defaults?.copyExcludeFields ?? [])],
    autoClearAfterCopy: persisted.autoClearAfterCopy ?? defaults?.autoClearAfterCopy ?? false,
    blockInteractions: persisted.blockInteractions ?? defaults?.blockInteractions ?? true,
    locale: persisted.locale ?? defaults?.locale ?? DEFAULT_LOCALE,
    agentAutoSendEnabled: persisted.agentAutoSendEnabled ?? defaults?.agentAutoSendEnabled ?? false,
    selectedAgentId: persisted.selectedAgentId ?? defaults?.selectedAgentId ?? "",
  })

  // Persist on every change
  watch(
    () => ({
      outputDetail: state.outputDetail,
      darkMode: state.darkMode,
      enabled: state.enabled,
      componentSourceEnabled: state.componentSourceEnabled,
      annotationColor: state.annotationColor,
      showMarkers: state.showMarkers,
      copyFormat: state.copyFormat,
      copyPrefix: state.copyPrefix,
      copyExcludeFields: state.copyExcludeFields,
      autoClearAfterCopy: state.autoClearAfterCopy,
      blockInteractions: state.blockInteractions,
      locale: state.locale,
      agentAutoSendEnabled: state.agentAutoSendEnabled,
      selectedAgentId: state.selectedAgentId,
    }),
    (settings) => saveSettings(settings),
    { deep: true },
  )

  return {
    get outputDetail() { return state.outputDetail },
    set outputDetail(v: OutputDetailLevel) { state.outputDetail = v },
    get darkMode() { return state.darkMode },
    set darkMode(v: boolean) { state.darkMode = v },
    get enabled() { return state.enabled },
    set enabled(v: boolean) { state.enabled = v },
    get componentSourceEnabled() { return state.componentSourceEnabled },
    set componentSourceEnabled(v: boolean) { state.componentSourceEnabled = v },
    get annotationColor() { return state.annotationColor },
    set annotationColor(v: string) { state.annotationColor = v },
    get showMarkers() { return state.showMarkers },
    set showMarkers(v: boolean) { state.showMarkers = v },
    get copyFormat() { return state.copyFormat },
    set copyFormat(v: CopyFormat) { state.copyFormat = v },
    get copyPrefix() { return state.copyPrefix },
    set copyPrefix(v: string) { state.copyPrefix = v },
    get copyExcludeFields() { return state.copyExcludeFields },
    set copyExcludeFields(v: ExportExcludeField[]) { state.copyExcludeFields = [...v] },
    get autoClearAfterCopy() { return state.autoClearAfterCopy },
    set autoClearAfterCopy(v: boolean) { state.autoClearAfterCopy = v },
    get blockInteractions() { return state.blockInteractions },
    set blockInteractions(v: boolean) { state.blockInteractions = v },
    get locale() { return state.locale },
    set locale(v: Locale) { state.locale = v },
    get agentAutoSendEnabled() { return state.agentAutoSendEnabled },
    set agentAutoSendEnabled(v: boolean) { state.agentAutoSendEnabled = v },
    get selectedAgentId() { return state.selectedAgentId },
    set selectedAgentId(v: string) { state.selectedAgentId = v },

    toggleDarkMode() {
      state.darkMode = !state.darkMode
    },
  }
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function normalizeLocale(value: unknown): Locale | undefined {
  return isValidLocale(value) ? value : undefined
}

function normalizeCopyExcludeFields(value: unknown): ExportExcludeField[] | undefined {
  if (!Array.isArray(value)) return undefined

  const allowed = new Set<ExportExcludeField>(COPY_EXCLUDE_FIELDS)
  return [...new Set(
    value.filter((field): field is ExportExcludeField => allowed.has(field as ExportExcludeField)),
  )]
}

function loadSettings(): PersistedSettings {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedSettings & { locale?: unknown }
    return {
      ...parsed,
      locale: normalizeLocale(parsed.locale),
      copyExcludeFields: normalizeCopyExcludeFields(parsed.copyExcludeFields) ?? [],
    }
  } catch {
    return {}
  }
}

function saveSettings(settings: PersistedSettings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // silent — localStorage may be full or disabled
  }
}
