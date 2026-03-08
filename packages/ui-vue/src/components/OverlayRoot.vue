<script setup lang="ts">
import { markRaw, onMounted, onUnmounted, provide, ref, watch } from "vue"
import {
  AREA_SELECTION_KEY,
  ANNOTATIONS_STORE_KEY,
  FREEZE_KEY,
  I18N_KEY,
  OVERLAY_KEY,
  RUNTIME_BRIDGE_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
} from "../injection-keys.js"
import { createOverlayState } from "../composables/useOverlay.js"
import { createExportActions } from "../composables/useExport.js"
import { createI18nState } from "../composables/useI18n.js"
import { createFreezeState, originalSetTimeout } from "../composables/useFreezeState.js"
import { useKeyboardShortcuts } from "../composables/useKeyboard.js"
import type { AnnotationsStore } from "../composables/useAnnotationsStore.js"
import type { AreaSelectionState } from "../composables/useAreaSelection.js"
import type { SelectionState } from "../composables/useSelection.js"
import type { SettingsState } from "../composables/useSettings.js"
import type { RuntimeBridge, UiNotification } from "../types.js"
import AnnotationPopover from "./AnnotationPopover.vue"
import DragSelectionLayer from "./DragSelectionLayer.vue"
import HighlightLayer from "./HighlightLayer.vue"
import MarkerLayer from "./MarkerLayer.vue"
import Toolbar from "./Toolbar.vue"

const props = defineProps<{
  bridge: RuntimeBridge
  store: AnnotationsStore
  selection: SelectionState
  settings: SettingsState
  areaSelection: AreaSelectionState
}>()

const overlay = createOverlayState(props.selection)
const settings = props.settings
const i18n = createI18nState(() => settings.locale)
const freezeState = createFreezeState()
const exportActions = createExportActions(props.store, settings)
const toast = ref<(UiNotification & { id: number }) | null>(null)

// Provide all dependencies to the component tree.
// markRaw the bridge because it contains DOM nodes and functions
// that must not be made reactive.
provide(RUNTIME_BRIDGE_KEY, markRaw(props.bridge))
provide(ANNOTATIONS_STORE_KEY, props.store)
provide(SELECTION_KEY, props.selection)
provide(AREA_SELECTION_KEY, props.areaSelection)
provide(OVERLAY_KEY, overlay)
provide(SETTINGS_KEY, settings)
provide(I18N_KEY, i18n)
provide(FREEZE_KEY, freezeState)

// Register keyboard shortcuts
useKeyboardShortcuts({
  store: props.store,
  selection: props.selection,
  overlay,
  settings,
  exportActions,
  freezeState,
})

onMounted(() => {
  props.bridge.overlayRoot.dataset.agentationRoot = ""
  props.store.hydrate()
  // Kick off initial sync (flushes any unsynced annotations to the server).
  void props.bridge.sync?.init()
})

let toastTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeNotifications: (() => void) | null = null

onMounted(() => {
  unsubscribeNotifications = props.bridge.subscribeNotifications?.((notification) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
    }

    toast.value = {
      ...notification,
      id: Date.now(),
    }

    toastTimer = originalSetTimeout(() => {
      toast.value = null
      toastTimer = null
    }, notification.duration ?? 2600)
  }) ?? null
})

onUnmounted(() => {
  unsubscribeNotifications?.()
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  delete props.bridge.overlayRoot.dataset.agentationRoot
  freezeState.cleanup()
})

// Auto-show popover when an element is selected;
// auto-hide when selection is cleared.
watch(
  () => props.selection.selected,
  (selected) => {
    if (selected) {
      overlay.showPopover()
    } else {
      overlay.hidePopover()
    }
  },
)

// Sync dark mode CSS vars to overlayRoot so Teleported layers inherit them.
watch(
  () => settings.darkMode,
  (isDark) => {
    props.bridge.overlayRoot.dataset.agTheme = isDark ? "dark" : "light"
  },
  { immediate: true },
)

// Sync outputDetail from settings back to bridge so export uses current setting.
watch(
  () => settings.outputDetail,
  (outputDetail) => {
    props.bridge.options.outputDetail = outputDetail
  },
  { immediate: true },
)

// Sync locale to the Teleport target so marker labels inherit the right language.
watch(
  () => i18n.locale,
  (locale) => {
    props.bridge.overlayRoot.lang = locale
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="agentation-root"
    :class="{ dark: settings.darkMode, light: !settings.darkMode }"
    :lang="i18n.locale"
    data-agentation-root
  >
    <Toolbar :export-actions="exportActions" />
    <AnnotationPopover />

    <Transition name="toast">
      <div
        v-if="toast"
        class="toast"
        :data-kind="toast.kind ?? 'info'"
        role="status"
        aria-live="polite"
      >
        {{ toast.message }}
      </div>
    </Transition>

    <Teleport :to="bridge.overlayRoot">
      <HighlightLayer />
      <DragSelectionLayer />
      <MarkerLayer />
    </Teleport>
  </div>
</template>

<style scoped>
.agentation-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
}

/* Dark theme (default) */
.agentation-root.dark {
  --ag-bg: #1e293b;
  --ag-bg-surface: rgba(30, 41, 59, 0.96);
  --ag-bg-elevated: rgba(15, 23, 42, 0.72);
  --ag-text: #e2e8f0;
  --ag-muted: #94a3b8;
  --ag-border: rgba(148, 163, 184, 0.24);
  --ag-accent: #3b82f6;
  --ag-selected: #f59e0b;
  --ag-shadow: 0 16px 48px rgba(15, 23, 42, 0.35);
  color: var(--ag-text);
}

/* Light theme */
.agentation-root.light {
  --ag-bg: #ffffff;
  --ag-bg-surface: rgba(255, 255, 255, 0.96);
  --ag-bg-elevated: rgba(241, 245, 249, 0.72);
  --ag-text: #1e293b;
  --ag-muted: #64748b;
  --ag-border: rgba(148, 163, 184, 0.3);
  --ag-accent: #3b82f6;
  --ag-selected: #f59e0b;
  --ag-shadow: 0 16px 48px rgba(148, 163, 184, 0.2);
  color: var(--ag-text);
}

/*
 * Teleported layers (HighlightLayer, MarkerLayer) render inside
 * bridge.overlayRoot which is outside .agentation-root in the DOM.
 * We use :global selectors keyed by data-ag-theme to propagate
 * CSS variables into the Teleport target.
 */
:global([data-ag-theme="dark"]) {
  --ag-bg: #1e293b;
  --ag-bg-surface: rgba(30, 41, 59, 0.96);
  --ag-bg-elevated: rgba(15, 23, 42, 0.72);
  --ag-text: #e2e8f0;
  --ag-muted: #94a3b8;
  --ag-border: rgba(148, 163, 184, 0.24);
  --ag-accent: #3b82f6;
  --ag-selected: #f59e0b;
  --ag-shadow: 0 16px 48px rgba(15, 23, 42, 0.35);
  color: var(--ag-text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
}

:global([data-ag-theme="light"]) {
  --ag-bg: #ffffff;
  --ag-bg-surface: rgba(255, 255, 255, 0.96);
  --ag-bg-elevated: rgba(241, 245, 249, 0.72);
  --ag-text: #1e293b;
  --ag-muted: #64748b;
  --ag-border: rgba(148, 163, 184, 0.3);
  --ag-accent: #3b82f6;
  --ag-selected: #f59e0b;
  --ag-shadow: 0 16px 48px rgba(148, 163, 184, 0.2);
  color: var(--ag-text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
}

.agentation-root,
.agentation-root :deep(*),
:global([data-ag-theme]),
:global([data-ag-theme] *) {
  box-sizing: border-box;
}

.agentation-root :deep(button),
.agentation-root :deep(textarea),
:global([data-ag-theme] button),
:global([data-ag-theme] textarea) {
  font: inherit;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.92);
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.06);
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: -0.01em;
  pointer-events: none;
  z-index: 100010;
}

.toast[data-kind="warning"] {
  background: rgba(35, 25, 6, 0.94);
  color: rgba(255, 244, 214, 0.96);
  box-shadow: 0 12px 32px rgba(146, 64, 14, 0.22), 0 0 0 1px rgba(245, 158, 11, 0.18);
}

.light .toast {
  background: rgba(255, 255, 255, 0.96);
  color: rgba(15, 23, 42, 0.9);
  box-shadow: 0 12px 32px rgba(148, 163, 184, 0.24), 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.light .toast[data-kind="warning"] {
  background: rgba(255, 251, 235, 0.98);
  color: #92400e;
  box-shadow: 0 12px 32px rgba(251, 191, 36, 0.18), 0 0 0 1px rgba(245, 158, 11, 0.2);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.96);
  filter: blur(4px);
}
</style>
