import type { InjectionKey } from "vue"
import type { RuntimeBridge } from "./types.js"
import type { AnnotationsStore } from "./composables/useAnnotationsStore.js"
import type { AreaSelectionState } from "./composables/useAreaSelection.js"
import type { SelectionState } from "./composables/useSelection.js"
import type { OverlayState } from "./composables/useOverlay.js"
import type { SettingsState } from "./composables/useSettings.js"
import type { I18nState } from "./composables/useI18n.js"
import type { FreezeState } from "./composables/useFreezeState.js"

export const RUNTIME_BRIDGE_KEY: InjectionKey<RuntimeBridge> = Symbol("agentation-runtime-bridge")
export const ANNOTATIONS_STORE_KEY: InjectionKey<AnnotationsStore> = Symbol("agentation-annotations-store")
export const SELECTION_KEY: InjectionKey<SelectionState> = Symbol("agentation-selection")
export const AREA_SELECTION_KEY: InjectionKey<AreaSelectionState> = Symbol("agentation-area-selection")
export const OVERLAY_KEY: InjectionKey<OverlayState> = Symbol("agentation-overlay")
export const SETTINGS_KEY: InjectionKey<SettingsState> = Symbol("agentation-settings")
export const I18N_KEY: InjectionKey<I18nState> = Symbol("agentation-i18n")
export const FREEZE_KEY: InjectionKey<FreezeState> = Symbol("agentation-freeze")
