<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue"
import { ANNOTATIONS_STORE_KEY, FREEZE_KEY, I18N_KEY, OVERLAY_KEY, RUNTIME_BRIDGE_KEY, SELECTION_KEY, SETTINGS_KEY } from "../injection-keys.js"
import { COLOR_OPTIONS } from "../composables/useSettings.js"
import { originalSetTimeout } from "../composables/useFreezeState.js"
import { useToolbarDrag } from "../composables/useToolbarDrag.js"
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "../i18n/index.js"
import { injectStrict } from "../utils.js"
import type { ExportActions } from "../composables/useExport.js"
import {
  IconChevronLeft,
  IconChevronRight,
  IconCheckSmallAnimated,
  IconConnectedNodes,
  IconCopyAnimated,
  IconEye,
  IconEyeOff,
  IconGear,
  IconHelp,
  IconJson,
  IconListSparkle,
  IconMarkdown,
  IconMoon,
  IconPause,
  IconPlay,
  IconSun,
  IconTrashAlt,
  IconXmarkLarge,
} from "./icons.js"
import AgTooltip from "./AgTooltip.vue"

const OUTPUT_DETAIL_KEYS = ["compact", "standard", "detailed", "forensic"] as const
const HELP_ICON_SIZE = 16

type SettingsPage = "main" | "automations"

const props = defineProps<{
  exportActions: ExportActions
}>()

const store = injectStrict(ANNOTATIONS_STORE_KEY, "annotations store")
const selection = injectStrict(SELECTION_KEY, "selection state")
const overlay = injectStrict(OVERLAY_KEY, "overlay state")
const settings = injectStrict(SETTINGS_KEY, "settings state")
const i18n = injectStrict(I18N_KEY, "i18n state")
const freezeState = injectStrict(FREEZE_KEY, "freeze state")
const bridge = injectStrict(RUNTIME_BRIDGE_KEY, "runtime bridge")

const toolbarRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const settingsOpen = ref(false)
const settingsPage = ref<SettingsPage>("main")
const showEntranceAnimation = ref(false)
const drag = useToolbarDrag({})

const count = computed(() => store.annotations.length)
const hasAnnotations = computed(() => count.value > 0)
const isLight = computed(() => !settings.darkMode)
const isFrozen = computed(() => freezeState.isFrozen.value)
const copyFormat = computed(() => settings.copyFormat)
const isMarkdownFormat = computed(() => copyFormat.value === "markdown")
const copyFeedbackActive = computed(() => props.exportActions.copyFeedback === copyFormat.value)
const showMarkers = computed(() => settings.showMarkers)
const panelOpen = computed(() => settingsOpen.value)
const isAutomationsPanelOpen = computed(() => settingsPage.value === "automations")
const messages = computed(() => i18n.messages)
const currentOutputDetailLabel = computed(() => messages.value.outputDetail[settings.outputDetail])
const settingsPanelPlacement = computed(
  () => (drag.position.value?.y ?? Number.POSITIVE_INFINITY) < 230 ? "below" : "above",
)
const mcpConnected = computed(() => !!bridge.sync)

// Sync toolbar expanded state → annotation mode.
// Collapsing disables selection; expanding re-enables it.
// `immediate` ensures store.enabled = false on startup (expanded starts false).
watch(expanded, async (isExpanded) => {
  if (!isExpanded) {
    closeSettingsPanel()
    selection.clearHovered()
    selection.clearSelection()
    overlay.hidePopover()
  }
  store.enabled = isExpanded
  await nextTick()
  drag.syncConstraints()
}, { immediate: true })

let entranceTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  document.addEventListener("pointerdown", onOutsideClick, true)
  showEntranceAnimation.value = true
  entranceTimer = originalSetTimeout(() => {
    showEntranceAnimation.value = false
    entranceTimer = null
  }, 760)
})

onUnmounted(() => {
  document.removeEventListener("pointerdown", onOutsideClick, true)
  if (entranceTimer) window.clearTimeout(entranceTimer)
})

function onOutsideClick(e: PointerEvent): void {
  if (!panelOpen.value) return
  if (!(e.target instanceof Node)) return
  if (toolbarRef.value?.contains(e.target)) return
  closeSettingsPanel()
}

function setToolbarRef(element: Element | ComponentPublicInstance | null): void {
  const el = element instanceof HTMLElement ? element : null
  toolbarRef.value = el
  drag.bindToolbarRef(el)
}

// --- Actions ---

function handleClick(): void {
  if (expanded.value) return
  if (drag.consumeJustFinishedDrag()) return
  expanded.value = true
}

function close(): void {
  closeSettingsPanel()
  expanded.value = false
  if (isFrozen.value) {
    freezeState.toggleFreeze()
  }
}

function toggleFreeze(): void {
  freezeState.toggleFreeze()
}

function toggleMarkers(): void {
  settings.showMarkers = !showMarkers.value
}

function closeSettingsPanel(): void {
  settingsOpen.value = false
  settingsPage.value = "main"
}

function toggleSettingsPanel(): void {
  if (settingsOpen.value) {
    closeSettingsPanel()
    return
  }
  settingsPage.value = "main"
  settingsOpen.value = true
}

function openAutomationsPanel(): void {
  settingsOpen.value = true
  settingsPage.value = "automations"
}

function showMainSettings(): void {
  settingsPage.value = "main"
}

function clearAll(): void {
  store.clearAll()
  selection.clearHovered()
  selection.clearSelection()
  overlay.hidePopover()
}

function cycleOutputDetail(): void {
  const idx = OUTPUT_DETAIL_KEYS.findIndex((k) => k === settings.outputDetail)
  settings.outputDetail = OUTPUT_DETAIL_KEYS[(idx + 1) % OUTPUT_DETAIL_KEYS.length]
}

function exportCurrentFormat(): Promise<void> {
  return isMarkdownFormat.value
    ? props.exportActions.exportMarkdown()
    : props.exportActions.exportJSON()
}
</script>

<template>
  <div :ref="setToolbarRef" class="toolbar" :class="{ dragging: drag.isDragging.value }"
    :style="drag.toolbarStyle.value" data-feedback-toolbar>
    <div class="toolbar-container" :class="{
      collapsed: !expanded,
      expanded,
      light: isLight,
      dragging: drag.isDragging.value,
      entrance: showEntranceAnimation,
    }" :role="expanded ? undefined : 'button'" :tabindex="expanded ? -1 : 0" @click="handleClick"
      @keydown.enter.prevent="expanded = true" @keydown.space.prevent="expanded = true">
      <!-- Collapsed: icon + badge -->
      <div class="toggle-content" :class="expanded ? 'hidden' : 'visible'">
        <IconListSparkle :size="24" />
        <span v-if="hasAnnotations" class="badge" :class="{ entrance: showEntranceAnimation }"
          :style="{ backgroundColor: settings.annotationColor }">
          {{ count }}
        </span>
      </div>

      <!-- Expanded: controls row -->
      <div class="controls-content" :class="expanded ? 'visible' : 'hidden'">
        <button class="control-btn" :class="{ light: isLight }" type="button"
          :title="isFrozen ? messages.toolbar.resume : messages.toolbar.pause"
          :aria-label="isFrozen ? messages.toolbar.resumeAria : messages.toolbar.pauseAria"
          :data-state="isFrozen ? 'paused' : undefined" @click.stop="toggleFreeze">
          <IconPlay v-if="isFrozen" :size="24" />
          <IconPause v-else :size="24" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button"
          :title="showMarkers ? messages.toolbar.hideMarkers : messages.toolbar.showMarkers"
          :aria-label="showMarkers ? messages.toolbar.hideMarkersAria : messages.toolbar.showMarkersAria"
          :data-state="showMarkers ? undefined : 'hidden'" :disabled="!hasAnnotations" @click.stop="toggleMarkers">
          <IconEye v-if="showMarkers" :size="24" />
          <IconEyeOff v-else :size="24" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button"
          :title="isMarkdownFormat ? messages.toolbar.copyMarkdown : messages.toolbar.copyJson"
          :aria-label="isMarkdownFormat ? messages.toolbar.copyMarkdownAria : messages.toolbar.copyJsonAria"
          :disabled="!hasAnnotations" :data-active="copyFeedbackActive || undefined"
          @click.stop="void exportCurrentFormat()">
          <IconCopyAnimated :size="24" :copied="copyFeedbackActive" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.clearAll"
          :aria-label="messages.toolbar.clearAllAria" :disabled="!hasAnnotations" data-danger @click.stop="clearAll">
          <IconTrashAlt :size="18" />
        </button>

        <div class="divider" :class="{ light: isLight }" />

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.settings"
          :aria-label="messages.toolbar.toggleSettingsAria" :data-active="panelOpen || undefined"
          @click.stop="toggleSettingsPanel">
          <IconGear :size="20" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.closeToolbar"
          :aria-label="messages.toolbar.closeToolbarAria" @click.stop="close">
          <IconXmarkLarge :size="20" />
        </button>
      </div>

      <!-- Settings / automations panel -->
      <Transition name="settings-panel">
        <div v-if="expanded && panelOpen" class="settings-panel" :class="{
          light: isLight,
          below: settingsPanelPlacement === 'below',
        }" data-no-drag @click.stop>
          <div class="settings-pages" :class="{ 'show-automations': isAutomationsPanelOpen }">
            <div class="settings-page">
              <div class="settings-header" :class="{ light: isLight }">
                <span class="settings-brand" :class="{ light: isLight }">
                  <span class="settings-slash" :style="{ color: settings.annotationColor }">/</span>agentation
                </span>
                <button class="theme-toggle" :class="{ light: isLight }" type="button"
                  :title="settings.darkMode ? messages.settings.lightMode : messages.settings.darkMode"
                  :aria-label="settings.darkMode ? messages.settings.switchToLightAria : messages.settings.switchToDarkAria"
                  @click="settings.toggleDarkMode()">
                  <span class="theme-icon-wrapper">
                    <Transition name="theme-icon" mode="out-in">
                      <span :key="settings.darkMode ? 'sun' : 'moon'" class="theme-icon">
                        <IconSun v-if="settings.darkMode" :size="16" />
                        <IconMoon v-else :size="16" />
                      </span>
                    </Transition>
                  </span>
                </button>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.language }}</span>
                  <div class="locale-switch" :class="{ light: isLight }" role="group"
                    :aria-label="messages.settings.language">
                    <button v-for="loc in SUPPORTED_LOCALES" :key="loc" class="locale-btn"
                      :class="{ active: settings.locale === loc, light: isLight }" type="button" :lang="loc"
                      :aria-pressed="settings.locale === loc" @click="settings.locale = loc">
                      {{ LOCALE_LABELS[loc] }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label-with-help">
                    <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.outputDetail }}</span>
                    <AgTooltip :content="messages.settings.outputDetailHelp">
                      <IconHelp :size="HELP_ICON_SIZE"
                        :style="{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', cursor: 'help' }" />
                    </AgTooltip>
                  </span>
                  <button class="cycle-btn" :class="{ light: isLight }" type="button" @click="cycleOutputDetail">
                    <Transition name="cycle-text" mode="out-in">
                      <span :key="settings.outputDetail" class="cycle-text">{{ currentOutputDetailLabel }}</span>
                    </Transition>
                    <span class="cycle-dots">
                      <span v-for="k in OUTPUT_DETAIL_KEYS" :key="k" class="cycle-dot"
                        :class="{ active: k === settings.outputDetail, light: isLight }" />
                    </span>
                  </button>
                </div>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.exportFormat }}</span>
                  <div class="format-switch" :class="{ light: isLight }"
                    :style="{ '--ag-format-accent': settings.annotationColor }" role="group"
                    :aria-label="messages.settings.exportFormat">
                    <button class="format-btn" :class="{ light: isLight, active: settings.copyFormat === 'markdown' }"
                      type="button" :title="messages.toolbar.copyMarkdown"
                      :aria-label="messages.settings.exportFormatMarkdownAria"
                      :aria-pressed="settings.copyFormat === 'markdown'" @click="settings.copyFormat = 'markdown'">
                      <IconMarkdown :size="18" />
                    </button>
                    <button class="format-btn" :class="{ light: isLight, active: settings.copyFormat === 'json' }"
                      type="button" :title="messages.toolbar.copyJson"
                      :aria-label="messages.settings.exportFormatJsonAria"
                      :aria-pressed="settings.copyFormat === 'json'" @click="settings.copyFormat = 'json'">
                      <IconJson :size="16" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="settings-section">
                <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.markerColour }}</span>
                <div class="color-row">
                  <button v-for="c in COLOR_OPTIONS" :key="c.key" class="color-ring"
                    :class="{ selected: settings.annotationColor === c.value }"
                    :style="{ borderColor: settings.annotationColor === c.value ? c.value : 'transparent' }"
                    type="button" :title="messages.colors[c.key]" @click="settings.annotationColor = c.value">
                    <span class="color-dot" :class="{ selected: settings.annotationColor === c.value }"
                      :style="{ backgroundColor: c.value }" />
                  </button>
                </div>
              </div>

              <div class="settings-section">
                <label class="toggle-row">
                  <input class="sr-only" type="checkbox" :checked="settings.autoClearAfterCopy"
                    @change="settings.autoClearAfterCopy = ($event.target as HTMLInputElement).checked">
                  <span class="checkbox" :class="{ checked: settings.autoClearAfterCopy, light: isLight }">
                    <IconCheckSmallAnimated v-if="settings.autoClearAfterCopy" :size="14" />
                  </span>
                  <span class="toggle-label" :class="{ light: isLight }">{{ messages.settings.clearOnCopy }}</span>
                </label>

                <label class="toggle-row">
                  <input class="sr-only" type="checkbox" :checked="settings.blockInteractions"
                    @change="settings.blockInteractions = ($event.target as HTMLInputElement).checked">
                  <span class="checkbox" :class="{ checked: settings.blockInteractions, light: isLight }">
                    <IconCheckSmallAnimated v-if="settings.blockInteractions" :size="14" />
                  </span>
                  <span class="toggle-label" :class="{ light: isLight }">{{ messages.settings.blockPageInteractions
                    }}</span>
                  <AgTooltip :content="messages.settings.blockInteractionsHelp">
                    <IconHelp :size="HELP_ICON_SIZE"
                      :style="{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', cursor: 'help', marginLeft: '2px' }" />
                  </AgTooltip>
                </label>

                <label class="toggle-row">
                  <input class="sr-only" type="checkbox" :checked="settings.componentSourceEnabled"
                    @change="settings.componentSourceEnabled = ($event.target as HTMLInputElement).checked">
                  <span class="checkbox" :class="{ checked: settings.componentSourceEnabled, light: isLight }">
                    <IconCheckSmallAnimated v-if="settings.componentSourceEnabled" :size="14" />
                  </span>
                  <span class="toggle-label" :class="{ light: isLight }">{{ messages.settings.componentSource }}</span>
                  <AgTooltip :content="messages.settings.componentSourceHelp">
                    <IconHelp :size="HELP_ICON_SIZE"
                      :style="{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', cursor: 'help', marginLeft: '2px' }" />
                  </AgTooltip>
                </label>
              </div>

              <div class="settings-section">
                <button class="nav-btn" :class="{ light: isLight }" type="button" @click="openAutomationsPanel">
                  <span class="nav-btn-left">
                    <IconConnectedNodes :size="18" />
                    <span>{{ messages.settings.manageMcpWebhooks }}</span>
                  </span>
                  <span class="nav-btn-right">
                    <span class="nav-status-indicator"
                      :title="mcpConnected ? messages.settings.mcpStatusConnected : messages.settings.mcpStatusDisconnected"
                      :aria-label="mcpConnected ? messages.settings.mcpStatusConnected : messages.settings.mcpStatusDisconnected">
                      <span class="status-dot" :class="mcpConnected ? 'connected' : 'disconnected'" />
                    </span>
                    <IconChevronRight :size="16" />
                  </span>
                </button>
              </div>
            </div>

            <div class="settings-page">
              <div class="settings-header" :class="{ light: isLight }">
                <button class="back-btn" :class="{ light: isLight }" type="button" @click="showMainSettings">
                  <IconChevronLeft :size="16" />
                  <span>{{ messages.settings.manageMcpWebhooks }}</span>
                </button>
                <span class="mcp-status" :class="{ light: isLight }">
                  <span class="status-dot" :class="mcpConnected ? 'connected' : 'disconnected'" />
                  {{ mcpConnected ? messages.settings.mcpStatusConnected : messages.settings.mcpStatusDisconnected }}
                </span>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label-with-help">
                    <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.mcpConnection
                      }}</span>
                    <AgTooltip :content="messages.settings.mcpDescription">
                      <IconHelp :size="HELP_ICON_SIZE"
                        :style="{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', cursor: 'help' }" />
                    </AgTooltip>
                  </span>
                </div>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.mcpDescription }}
                </p>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label-with-help">
                    <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.webhooks }}</span>
                    <AgTooltip :content="messages.settings.webhooksDescription">
                      <IconHelp :size="HELP_ICON_SIZE"
                        :style="{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', cursor: 'help' }" />
                    </AgTooltip>
                  </span>
                </div>

                <label class="toggle-row webhook-toggle">
                  <input class="sr-only" type="checkbox" :checked="settings.webhooksEnabled"
                    @change="settings.webhooksEnabled = ($event.target as HTMLInputElement).checked">
                  <span class="checkbox" :class="{ checked: settings.webhooksEnabled, light: isLight }">
                    <IconCheckSmallAnimated v-if="settings.webhooksEnabled" :size="14" />
                  </span>
                  <span class="toggle-label" :class="{ light: isLight }">{{ messages.settings.webhooksAutoSend }}</span>
                </label>

                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.webhooksDescription }}
                </p>

                <textarea class="webhook-url" :class="{ light: isLight }" :value="settings.webhookUrl"
                  :placeholder="messages.settings.webhooksUrlPlaceholder"
                  :style="{ borderColor: settings.annotationColor }" rows="2" spellcheck="false"
                  @input="settings.webhookUrl = ($event.target as HTMLTextAreaElement).value" />
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* Protect stroke-based SVG icons */
:deep(svg[fill="none"]) {
  fill: none !important;
}

@keyframes toolbarEnter {
  from {
    opacity: 0;
    transform: scale(0.5) rotate(90deg);
  }

  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes badgeEnter {
  from {
    opacity: 0;
    transform: scale(0);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes themeIconIn {
  0% {
    opacity: 0;
    transform: scale(0.8) rotate(-30deg);
  }

  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes cycleTextIn {
  0% {
    opacity: 0;
    transform: translateY(-6px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- Toolbar wrapper ------------------------------------------------- */

.toolbar {
  --ag-toolbar-expanded-width: 280px;
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: var(--ag-toolbar-expanded-width);
  z-index: 100000;
  pointer-events: none;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.toolbar.dragging {
  cursor: grabbing;
  will-change: left, top;
}

/* --- Toolbar container ------------------------------------------------ */

.toolbar-container {
  position: relative;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 4px 16px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  user-select: none;
  cursor: grab;
  touch-action: none;
  will-change: width, transform;
  transition:
    width 0.4s cubic-bezier(0.19, 1, 0.22, 1),
    border-radius 0.4s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.4s cubic-bezier(0.19, 1, 0.22, 1),
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.toolbar-container.dragging {
  transition:
    width 0.4s cubic-bezier(0.19, 1, 0.22, 1),
    border-radius 0.4s cubic-bezier(0.19, 1, 0.22, 1),
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.toolbar-container.entrance {
  animation: toolbarEnter 0.5s cubic-bezier(0.34, 1.2, 0.64, 1) both;
}

/* Collapsed circle */
.toolbar-container.collapsed {
  width: 44px;
  border-radius: 22px;
  padding: 0;
  cursor: pointer;
}

.toolbar-container.collapsed:hover {
  background: #2a2a2a;
}

.toolbar-container.collapsed:active {
  transform: scale(0.95);
}

/* Expanded pill */
.toolbar-container.expanded {
  width: var(--ag-toolbar-expanded-width);
  border-radius: 24px;
  padding: 6px;
}

/* Light mode */
.toolbar-container.light {
  background: #fff;
  color: rgba(0, 0, 0, 0.85);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.toolbar-container.light.collapsed:hover {
  background: #f5f5f5;
}

/* --- Toggle content (collapsed icon) --------------------------------- */

.toggle-content {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center;
  transition:
    opacity 0.12s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.2s cubic-bezier(0.19, 1, 0.22, 1);
}

.toggle-content.visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: scale(1);
}

.toggle-content.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: scale(0.72);
}

/* --- Controls row (expanded) ----------------------------------------- */

.controls-content {
  display: flex;
  align-items: center;
  gap: 6px;
  transform-origin: center;
  will-change: opacity, transform, filter;
  transition:
    filter 0.45s cubic-bezier(0.19, 1, 0.22, 1),
    opacity 0.35s cubic-bezier(0.19, 1, 0.22, 1),
    transform 0.35s cubic-bezier(0.19, 1, 0.22, 1);
}

.controls-content.visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  filter: blur(0);
  transform: scale(1);
}

.controls-content.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  filter: blur(10px);
  transform: scale(0.4);
}

/* --- Badge ----------------------------------------------------------- */

.badge {
  position: absolute;
  top: -13px;
  right: -13px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #3c82f7;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  will-change: transform, opacity;
  transition:
    transform 0.3s ease,
    opacity 0.2s ease;
  transform: scale(1);
}

.badge.entrance {
  animation: badgeEnter 0.3s cubic-bezier(0.34, 1.2, 0.64, 1) 0.32s both;
}

/* --- Control buttons ------------------------------------------------- */

.control-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease,
    opacity 0.2s ease;
}

.control-btn:hover:not(:disabled):not([data-active]):not([data-state]) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.control-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.control-btn[data-active] {
  color: #3c82f7;
  background: rgba(60, 130, 247, 0.25);
}

.control-btn[data-state="paused"] {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.18);
}

.control-btn[data-state="hidden"] {
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.06);
}

.control-btn[data-danger]:hover:not(:disabled):not([data-active]) {
  background: rgba(255, 59, 48, 0.25);
  color: #ff3b30;
}

/* Light variants */
.control-btn.light {
  color: rgba(0, 0, 0, 0.5);
}

.control-btn.light:hover:not(:disabled):not([data-active]):not([data-state]) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

.control-btn.light[data-active] {
  color: #3c82f7;
  background: rgba(60, 130, 247, 0.15);
}

.control-btn.light[data-state="paused"] {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.control-btn.light[data-state="hidden"] {
  color: rgba(0, 0, 0, 0.35);
  background: rgba(0, 0, 0, 0.04);
}

.control-btn.light[data-danger]:hover:not(:disabled):not([data-active]) {
  background: rgba(255, 59, 48, 0.15);
  color: #ff3b30;
}

/* --- Divider --------------------------------------------------------- */

.divider {
  width: 1px;
  height: 12px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.15);
}

.divider.light {
  background: rgba(0, 0, 0, 0.1);
}

/* --- Settings panel -------------------------------------------------- */

.settings-panel {
  position: absolute;
  right: 5px;
  bottom: calc(100% + 8px);
  width: min(344px, calc(100vw - 24px));
  z-index: 1;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08);
  cursor: default;
  --ag-settings-shift: 8px;
  transform-origin: bottom right;
  will-change: opacity, transform, filter;
  overflow: hidden;
}

.settings-panel.below {
  top: calc(100% + 8px);
  bottom: auto;
  --ag-settings-shift: -8px;
  transform-origin: top right;
}

.settings-panel.light {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.settings-panel-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    filter 0.2s ease;
}

.settings-panel-leave-active {
  pointer-events: none;
  transition:
    opacity 0.1s ease,
    transform 0.1s ease,
    filter 0.1s ease;
}

.settings-panel-enter-from,
.settings-panel-leave-to {
  opacity: 0;
  transform: translateY(var(--ag-settings-shift)) scale(0.95);
  filter: blur(5px);
}

.settings-panel-enter-to,
.settings-panel-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
}

/* --- Settings header ------------------------------------------------- */

.settings-header {
  display: flex;
  align-items: center;
  min-height: 24px;
  margin-bottom: 8px;
  padding-bottom: 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.settings-header.light {
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

.settings-brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
}

.settings-brand.light {
  color: rgba(0, 0, 0, 0.85);
}

.theme-toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.theme-toggle.light {
  color: rgba(0, 0, 0, 0.4);
}

.theme-toggle.light:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

.theme-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-icon-enter-active {
  animation: themeIconIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.theme-icon-leave-active {
  position: absolute;
  inset: 0;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.theme-icon-leave-to {
  opacity: 0;
  transform: scale(0.82) rotate(18deg);
}

/* --- Settings sections ----------------------------------------------- */

.settings-section+.settings-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.settings-panel.light .settings-section+.settings-section {
  border-top-color: rgba(0, 0, 0, 0.08);
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}

.settings-label {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.5);
}

.settings-label.light {
  color: rgba(0, 0, 0, 0.5);
}

/* --- Locale switch --------------------------------------------------- */

.locale-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.locale-switch.light {
  background: rgba(0, 0, 0, 0.04);
}

.locale-btn {
  appearance: none;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.locale-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.locale-btn:active {
  transform: scale(0.97);
}

.locale-btn.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.locale-btn.light {
  color: rgba(0, 0, 0, 0.55);
}

.locale-btn.light:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.85);
}

.locale-btn.light.active {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

/* --- Export format switch -------------------------------------------- */

.format-switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0;
}

.format-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.36);
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease,
    opacity 0.15s ease;
}

.format-btn::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 0;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  transform: translateX(-50%);
  transition:
    width 0.15s ease,
    opacity 0.15s ease;
}

.format-btn:hover {
  color: #fff;
}

.format-btn:active {
  transform: scale(0.96);
}

.format-btn.active {
  color: var(--ag-format-accent, #3c82f7);
  transform: scale(1.08);
}

.format-btn.active::after {
  width: 14px;
  opacity: 1;
}

.format-btn.light {
  color: rgba(0, 0, 0, 0.32);
}

.format-btn.light:hover {
  color: rgba(0, 0, 0, 0.8);
}

.format-btn.light.active {
  color: var(--ag-format-accent, #3c82f7);
}

/* --- Cycle button ---------------------------------------------------- */

.cycle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.cycle-btn.light {
  color: rgba(0, 0, 0, 0.85);
}

.cycle-text {
  display: inline-block;
}

.cycle-text-enter-active {
  animation: cycleTextIn 0.2s ease-out;
}

.cycle-dots {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cycle-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0.667);
  transition:
    background-color 0.25s ease-out,
    transform 0.25s ease-out;
}

.cycle-dot.active {
  background: #fff;
  transform: scale(1);
}

.cycle-dot.light {
  background: rgba(0, 0, 0, 0.2);
}

.cycle-dot.light.active {
  background: rgba(0, 0, 0, 0.7);
}

/* --- Colour picker --------------------------------------------------- */

.color-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.color-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    transform 0.15s ease;
}

.color-ring:hover {
  transform: scale(1.08);
}

.color-ring:active {
  transform: scale(0.95);
}

.color-dot {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}

.color-dot.selected {
  transform: scale(0.83);
}

/* --- Toggle rows (checkboxes) ---------------------------------------- */

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-row+.toggle-row {
  margin-top: 12px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.checkbox {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

.checkbox :deep(svg) {
  color: #1a1a1a;
}

.checkbox.checked {
  border-color: rgba(255, 255, 255, 0.3);
  background: #fff;
}

.checkbox.light {
  border-color: rgba(0, 0, 0, 0.15);
  background: #fff;
}

.checkbox.light.checked {
  border-color: #1a1a1a;
  background: #1a1a1a;
}

.checkbox.light.checked :deep(svg) {
  color: #fff;
}

.toggle-label {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.85);
}

.toggle-label.light {
  color: rgba(0, 0, 0, 0.5);
}

.webhook-toggle {
  margin-top: 8px;
}

/* --- Settings page slider -------------------------------------------- */

.settings-pages {
  display: flex;
  width: 200%;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.settings-pages.show-automations {
  transform: translateX(-50%);
}

.settings-page {
  flex: 0 0 50%;
  width: 50%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  padding: 13px 16px 16px;
}

/* --- Label with help icon -------------------------------------------- */

.settings-label-with-help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* --- Nav button (MCP/Webhooks) --------------------------------------- */

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.nav-btn.light {
  color: rgba(0, 0, 0, 0.7);
}

.nav-btn.light:hover {
  background: rgba(0, 0, 0, 0.04);
}

.nav-btn-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

.nav-status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
}

/* --- Status dot ------------------------------------------------------ */

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.connected {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.status-dot.disconnected {
  background: rgba(255, 255, 255, 0.25);
}

.settings-panel.light .status-dot.disconnected {
  background: rgba(0, 0, 0, 0.2);
}

/* --- Back button ----------------------------------------------------- */

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: color 0.15s ease;
}

.back-btn:hover {
  color: #fff;
}

.back-btn.light {
  color: rgba(0, 0, 0, 0.7);
}

.back-btn.light:hover {
  color: rgba(0, 0, 0, 0.95);
}

/* --- MCP status label ------------------------------------------------ */

.mcp-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.mcp-status.light {
  color: rgba(0, 0, 0, 0.5);
}

.settings-header .mcp-status {
  margin-left: auto;
  justify-content: flex-end;
  text-align: right;
}

/* --- Settings description -------------------------------------------- */

.settings-description {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.4);
}

.settings-description.light {
  color: rgba(0, 0, 0, 0.4);
}

/* --- Webhook URL textarea -------------------------------------------- */

.webhook-url {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.45;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s ease;
}

.webhook-url:focus {
  border-color: inherit;
}

.webhook-url::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.webhook-url.light {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
  color: rgba(0, 0, 0, 0.85);
}

.webhook-url.light::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

/* Global: applied to <html> during toolbar drag */
:global(html.agentation-dragging) {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

@media (prefers-reduced-motion: reduce) {

  .toolbar-container,
  .toggle-content,
  .controls-content,
  .badge,
  .control-btn,
  .settings-panel,
  .theme-icon,
  .cycle-text,
  .cycle-dot,
  .locale-btn,
  .format-btn,
  .color-ring,
  .color-dot,
  .checkbox {
    animation: none !important;
    transition: none !important;
    filter: none !important;
  }
}
</style>
