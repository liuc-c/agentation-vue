// Types
export type {
  RuntimeBridge,
  RuntimeStorageBridge,
  RuntimeSyncBridge,
  RuntimeSyncEvent,
  RuntimeSyncInfo,
  UiNotification,
  BoundingBox,
  AreaSelectionRect,
  AreaSelectionMatch,
  HoverSnapshot,
  SelectionSnapshot,
} from "./types.js"

// Injection keys
export {
  AREA_SELECTION_KEY,
  ANNOTATIONS_STORE_KEY,
  I18N_KEY,
  OVERLAY_KEY,
  RUNTIME_BRIDGE_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "./injection-keys.js"

// I18n
export type { Locale, Messages, ColorKey } from "./i18n/types.js"
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  isValidLocale,
  resolveMessages,
} from "./i18n/index.js"
export type { I18nState } from "./composables/useI18n.js"
export { createI18nState } from "./composables/useI18n.js"

// Composables
export type { AnnotationsStore } from "./composables/useAnnotationsStore.js"
export { createAnnotationsStore } from "./composables/useAnnotationsStore.js"
export type { SelectionState } from "./composables/useSelection.js"
export { createSelectionState } from "./composables/useSelection.js"
export type { AreaSelectionState } from "./composables/useAreaSelection.js"
export { createAreaSelectionState } from "./composables/useAreaSelection.js"
export type { OverlayState, OverlayPosition } from "./composables/useOverlay.js"
export { createOverlayState } from "./composables/useOverlay.js"
export type { SettingsState } from "./composables/useSettings.js"
export { createSettingsState } from "./composables/useSettings.js"
export type { ExportActions, ExportFormat } from "./composables/useExport.js"
export { createExportActions } from "./composables/useExport.js"
export { useKeyboardShortcuts } from "./composables/useKeyboard.js"

export const AGENTATION_UI_STYLE_HREF = ""

// Components
import OverlayRoot from "./components/OverlayRoot.vue"

export { OverlayRoot }
