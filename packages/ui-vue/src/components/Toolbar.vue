<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance, type CSSProperties } from "vue"
import { ANNOTATIONS_STORE_KEY, FREEZE_KEY, I18N_KEY, OVERLAY_KEY, RUNTIME_BRIDGE_KEY, SELECTION_KEY, SETTINGS_KEY } from "../injection-keys.js"
import { writeTextToClipboard } from "../clipboard.js"
import { COPY_EXCLUDE_FIELDS } from "../copy-fields.js"
import { COLOR_OPTIONS } from "../composables/useSettings.js"
import { originalSetTimeout } from "../composables/useFreezeState.js"
import { useToolbarDrag } from "../composables/useToolbarDrag.js"
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "../i18n/index.js"
import { injectStrict } from "../utils.js"
import type { ExportActions } from "../composables/useExport.js"
import type {
  AgentDispatchState,
  AgentSessionSummary,
  AgentSummary,
} from "../types.js"
import {
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconCheckSmallAnimated,
  IconClose,
  IconClockList,
  IconConnectedNodes,
  IconCopyAnimated,
  IconEye,
  IconEyeOff,
  IconExternalLink,
  IconGear,
  IconHelp,
  IconJson,
  IconListSparkle,
  IconMarkdown,
  IconMoon,
  IconPause,
  IconPaperPlane,
  IconPlay,
  IconRefresh,
  IconSun,
  IconTrashAlt,
  IconXmarkLarge,
} from "./icons.js"
import AgentProviderIcon from "./AgentProviderIcon.vue"
import AgTooltip from "./AgTooltip.vue"

const OUTPUT_DETAIL_KEYS = ["compact", "standard", "detailed", "forensic"] as const
const SETTINGS_PAGE_KEYS = ["main", "copy", "automations", "sessions"] as const
const HELP_ICON_SIZE = 16
const SETTINGS_PANEL_MAX_HEIGHT = 520
const COLLAPSED_TOOL_ICON_SIZE = 18
const PRIMARY_CONTROL_ICON_SIZE = 17
const SECONDARY_CONTROL_ICON_SIZE = 16

type SettingsPage = typeof SETTINGS_PAGE_KEYS[number]

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
const mainSettingsPageRef = ref<HTMLElement | null>(null)
const copySettingsPageRef = ref<HTMLElement | null>(null)
const automationsSettingsPageRef = ref<HTMLElement | null>(null)
const sessionsSettingsPageRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const settingsOpen = ref(false)
const settingsPage = ref<SettingsPage>("main")
const settingsPagesHeight = ref<number | null>(null)
const guideCopyFeedback = ref<string | null>(null)
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
const messages = computed(() => i18n.messages)
const settingsPageIndex = computed(() => SETTINGS_PAGE_KEYS.indexOf(settingsPage.value))
const settingsPagesStyle = computed<CSSProperties>(() => {
  const pageCount = SETTINGS_PAGE_KEYS.length
  return {
    "--ag-settings-page-count": String(pageCount),
    width: `${pageCount * 100}%`,
    transform: `translateX(-${(settingsPageIndex.value * 100) / pageCount}%)`,
    ...(settingsPagesHeight.value === null ? {} : { height: `${settingsPagesHeight.value}px` }),
  } as CSSProperties
})
const currentOutputDetailLabel = computed(() => messages.value.outputDetail[settings.outputDetail])
const settingsPanelPlacement = computed(
  () => (drag.position.value?.y ?? Number.POSITIVE_INFINITY) < 230 ? "below" : "above",
)
const syncBridgeAvailable = computed(() => Boolean(bridge.sync))
const mcpConnected = computed(() => !!bridge.sync)
const syncInfo = computed(() => bridge.sync?.info)
const companionEndpoint = computed(() => syncInfo.value?.endpoint ?? "http://localhost:4748")
const mcpHttpEndpoint = computed(() => syncInfo.value?.mcpHttpUrl ?? "http://localhost:4748/mcp")
const agentSummaries = ref<AgentSummary[]>([])
const agentSessions = ref<AgentSessionSummary[]>([])
const agentDispatchState = ref<AgentDispatchState | null>(null)
const agentActionPending = ref<"select" | "connect" | "disconnect" | "dispatch" | "cancel" | null>(null)
const sessionActionPending = ref<string | null>(null)
const agentBridgeAvailable = computed(() => Boolean(bridge.agent))
const showCompanionPanel = computed(() => syncBridgeAvailable.value || agentBridgeAvailable.value)
const activeAgent = computed(() => agentSummaries.value.find((agent) => agent.isActive) ?? null)
const sortedAgentSummaries = computed(() =>
  [...agentSummaries.value].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    if (getAgentAvailabilityRank(left) !== getAgentAvailabilityRank(right)) {
      return getAgentAvailabilityRank(right) - getAgentAvailabilityRank(left)
    }
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return left.label.localeCompare(right.label)
  }))
const sortedAgentSessions = computed(() =>
  [...agentSessions.value].sort((left, right) => {
    if ((left.status === "closed") !== (right.status === "closed")) {
      return left.status === "closed" ? 1 : -1
    }

    const rightTime = Date.parse(right.updatedAt ?? right.createdAt)
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt)
    return rightTime - leftTime
  }))
const hasAvailableAgent = computed(() => agentSummaries.value.some((agent) => agent.available))
const hasInstallableAgent = computed(() => agentSummaries.value.some((agent) => agent.availability === "installable"))
const dispatchInFlight = computed(() => {
  const state = agentDispatchState.value?.state
  return state === "queued" || state === "sending"
})
const latestAgentActivity = computed(() => agentDispatchState.value?.message ?? activeAgent.value?.lastError ?? "")
const activeSessionCount = computed(() => agentSessions.value.filter((session) => session.status !== "closed").length)
const showToolbarSendButton = computed(() => Boolean(activeAgent.value && bridge.agent))
const canSendToAgent = computed(() =>
  Boolean(activeAgent.value?.available)
  && agentActionPending.value === null
  && !dispatchInFlight.value)
const automationsPanelLabel = computed(() =>
  agentBridgeAvailable.value
    ? messages.value.settings.manageAgents
    : messages.value.settings.manageCompanion)
const automationsPanelDescription = computed(() =>
  agentBridgeAvailable.value
    ? messages.value.settings.agentWorkspaceDescription
    : messages.value.settings.companionWorkspaceDescription)
const agentsAvailabilitySummaryLabel = computed(() => {
  if (hasAvailableAgent.value) {
    return messages.value.settings.availableOnMachine
  }

  if (hasInstallableAgent.value) {
    return messages.value.settings.installableOnMachine
  }

  return messages.value.settings.notInstalledOnMachine
})
const connectionCards = computed(() => [
  { key: "companion", label: messages.value.settings.companionEndpointLabel, value: companionEndpoint.value },
  { key: "mcp-http", label: messages.value.settings.mcpEndpointLabel, value: mcpHttpEndpoint.value },
])
const activeAgentConnected = computed(() => {
  const status = activeAgent.value?.status
  return status === "ready" || status === "busy" || status === "error"
})
const primaryAgentTitle = computed(() => activeAgent.value?.label ?? messages.value.settings.noAgentSelected)
const primaryAgentStatus = computed(() =>
  activeAgent.value ? getAgentStatusLabel(activeAgent.value) : messages.value.settings.mcpStatusDisconnected)
const primaryAgentGuidance = computed(() => {
  if (!activeAgent.value) {
    return messages.value.settings.selectAgentToStart
  }

  if (!activeAgent.value.available) {
    return activeAgent.value.installHint ?? messages.value.settings.installAgentHint
  }

  return dispatchInFlight.value
    ? messages.value.settings.cancelSend
    : activeAgentConnected.value
      ? messages.value.settings.sendPendingToStart
      : messages.value.settings.connectAgentToStart
})
const primaryAgentActionLabel = computed(() => {
  if (!activeAgent.value) {
    return messages.value.settings.noAgentSelected
  }

  if (!activeAgent.value.available) {
    return activeAgent.value.homepage ? messages.value.settings.openHomepage : messages.value.settings.installAgent
  }

  return messages.value.settings.manualSend
})
const primaryAgentActionDisabled = computed(() => {
  if (!agentBridgeAvailable.value || agentActionPending.value !== null) {
    return true
  }

  if (!activeAgent.value) {
    return true
  }

  if (!activeAgent.value.available) {
    return !activeAgent.value.homepage
  }

  return dispatchInFlight.value
})

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
let guideCopyTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeAgent: (() => void) | null = null

onMounted(() => {
  document.addEventListener("pointerdown", onOutsideClick, true)
  window.addEventListener("resize", syncSettingsPanelHeight)
  showEntranceAnimation.value = true
  entranceTimer = originalSetTimeout(() => {
    showEntranceAnimation.value = false
    entranceTimer = null
  }, 760)
})

onUnmounted(() => {
  document.removeEventListener("pointerdown", onOutsideClick, true)
  window.removeEventListener("resize", syncSettingsPanelHeight)
  unsubscribeAgent?.()
  if (entranceTimer) window.clearTimeout(entranceTimer)
  if (guideCopyTimer) window.clearTimeout(guideCopyTimer)
})

function onOutsideClick(e: PointerEvent): void {
  if (!panelOpen.value) return
  if (isEventInsideToolbar(e)) return
  closeSettingsPanel()
}

function setToolbarRef(element: Element | ComponentPublicInstance | null): void {
  const el = typeof HTMLElement !== "undefined" && element instanceof HTMLElement ? element : null
  toolbarRef.value = el
  drag.bindToolbarRef(el)
}

function isEventInsideToolbar(event: Event): boolean {
  const toolbar = toolbarRef.value
  if (!toolbar) return false

  const path = typeof event.composedPath === "function" ? event.composedPath() : []
  if (path.length > 0) {
    return path.some((entry) => entry instanceof Node && toolbar.contains(entry))
  }

  return event.target instanceof Node && toolbar.contains(event.target)
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
  void refreshAgents()
  void refreshAgentSessions()
}

function openAgentSessionsPanel(): void {
  settingsOpen.value = true
  settingsPage.value = "sessions"
  void refreshAgentSessions()
}

function openCopySettingsPanel(): void {
  settingsOpen.value = true
  settingsPage.value = "copy"
}

function showMainSettings(): void {
  settingsPage.value = "main"
}

function showAutomationsSettings(): void {
  settingsPage.value = "automations"
}

function openAgentHomepage(agent?: AgentSummary | null): void {
  if (!agent?.homepage || typeof window === "undefined") return
  window.open(agent.homepage, "_blank", "noopener,noreferrer")
}

function getAgentAvailabilityRank(agent: AgentSummary): number {
  switch (agent.availability) {
    case "installed":
      return 2
    case "installable":
      return 1
    default:
      return 0
  }
}

function getAgentStatusLabel(agent: AgentSummary): string {
  if (agent.availability === "installable" && agent.status === "missing") {
    return messages.value.settings.agentStatusInstallable
  }

  switch (agent.status) {
    case "ready":
      return messages.value.settings.agentStatusReady
    case "available":
      return messages.value.settings.agentStatusAvailable
    case "missing":
      return messages.value.settings.agentStatusMissing
    case "connecting":
      return messages.value.settings.agentStatusConnecting
    case "busy":
      return messages.value.settings.agentStatusBusy
    case "error":
      return messages.value.settings.agentStatusError
  }
}

function getAgentStatusTone(agent: AgentSummary): AgentSummary["status"] | "installable" {
  if (agent.availability === "installable" && agent.status === "missing") {
    return "installable"
  }

  return agent.status
}

function applyAgentState(state: { agents?: AgentSummary[]; dispatch?: AgentDispatchState | null }): void {
  if (state.agents) {
    agentSummaries.value = state.agents
    const selected = state.agents.find((agent) => agent.isActive)
    if (selected) {
      settings.selectedAgentId = selected.id
    }
  }

  if ("dispatch" in state) {
    agentDispatchState.value = state.dispatch ?? null
  }
}

function upsertAgentSummary(summary: AgentSummary): void {
  const idx = agentSummaries.value.findIndex((agent) => agent.id === summary.id)
  if (idx >= 0) {
    agentSummaries.value.splice(idx, 1, summary)
  } else {
    agentSummaries.value = [...agentSummaries.value, summary]
  }
}

async function refreshAgents(): Promise<void> {
  if (!bridge.agent) return

  try {
    applyAgentState(await bridge.agent.listAgents())
  } catch (error) {
    bridge.notify?.({
      kind: "warning",
      duration: 2800,
      message: error instanceof Error ? error.message : "Failed to refresh agents",
    })
  }
}

async function refreshAgentSessions(): Promise<void> {
  if (!bridge.agent) return

  try {
    const state = await bridge.agent.listSessions()
    agentSessions.value = state.sessions
  } catch (error) {
    bridge.notify?.({
      kind: "warning",
      duration: 2800,
      message: error instanceof Error ? error.message : "Failed to refresh agent sessions",
    })
  }
}

async function runAgentAction(
  action: NonNullable<typeof agentActionPending.value>,
  fn: () => Promise<void>,
): Promise<void> {
  if (!bridge.agent) return
  agentActionPending.value = action

  try {
    await fn()
  } catch (error) {
    bridge.notify?.({
      kind: "warning",
      duration: 2800,
      message: error instanceof Error ? error.message : "Agent action failed",
    })
  } finally {
    agentActionPending.value = null
  }
}

async function selectAgent(agentId: string): Promise<void> {
  if (!bridge.agent) return
  await runAgentAction("select", async () => {
    settings.selectedAgentId = agentId
    applyAgentState(await bridge.agent!.selectAgent(agentId))
  })
}

async function connectAgent(agentId?: string): Promise<void> {
  if (!bridge.agent) return
  await runAgentAction("connect", async () => {
    applyAgentState(await bridge.agent!.connect(agentId))
  })
}

async function disconnectAgent(agentId?: string): Promise<void> {
  if (!bridge.agent) return
  await runAgentAction("disconnect", async () => {
    applyAgentState(await bridge.agent!.disconnect(agentId))
  })
}

async function sendToAgent(): Promise<void> {
  if (!bridge.agent) return
  await runAgentAction("dispatch", async () => {
    applyAgentState(await bridge.agent!.dispatch("manual", "manual.send"))
  })
}

async function closeAgentSession(sessionId: string): Promise<void> {
  if (!bridge.agent || sessionActionPending.value) return
  sessionActionPending.value = sessionId

  try {
    const state = await bridge.agent.closeSession(sessionId)
    agentSessions.value = state.sessions
  } catch (error) {
    bridge.notify?.({
      kind: "warning",
      duration: 2800,
      message: error instanceof Error ? error.message : "Failed to close agent session",
    })
  } finally {
    sessionActionPending.value = null
  }
}

async function cancelAgentDispatch(): Promise<void> {
  if (!bridge.agent) return
  await runAgentAction("cancel", async () => {
    applyAgentState(await bridge.agent!.cancelDispatch())
  })
}

async function runPrimaryAgentAction(): Promise<void> {
  if (!activeAgent.value) return

  if (!activeAgent.value.available) {
    openAgentHomepage(activeAgent.value)
    return
  }

  await sendToAgent()
}

function getAgentAvailabilityLabel(agent: AgentSummary): string {
  switch (agent.availability) {
    case "installed":
      return messages.value.settings.availableOnMachine
    case "installable":
      return messages.value.settings.installableOnMachine
    default:
      return messages.value.settings.notInstalledOnMachine
  }
}

function getSessionStatusLabel(status: AgentSessionSummary["status"]): string {
  switch (status) {
    case "approved":
      return messages.value.settings.sessionStatusApproved
    case "closed":
      return messages.value.settings.sessionStatusClosed
    default:
      return messages.value.settings.sessionStatusActive
  }
}

function getSessionDisplayTitle(session: AgentSessionSummary): string {
  try {
    const url = new URL(session.url)
    return url.pathname && url.pathname !== "/"
      ? `${url.host}${url.pathname}`
      : url.host
  } catch {
    return session.id
  }
}

function readRecordedSessionAgent(metadata?: Record<string, unknown>): { id?: string; label: string } | null {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const label = typeof metadata.agentationLastAgentLabel === "string"
    ? metadata.agentationLastAgentLabel.trim()
    : ""
  const id = typeof metadata.agentationLastAgentId === "string"
    ? metadata.agentationLastAgentId.trim()
    : ""
  if (!label && !id) {
    return null
  }

  return {
    ...(id ? { id } : {}),
    label: label || id,
  }
}

function getSessionAgentLabel(session: AgentSessionSummary): string {
  return readRecordedSessionAgent(session.metadata)?.label ?? ""
}

function formatSessionTimestamp(value?: string): string {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function toggleCopyExcludedField(field: typeof COPY_EXCLUDE_FIELDS[number]): void {
  settings.copyExcludeFields = settings.copyExcludeFields.includes(field)
    ? settings.copyExcludeFields.filter((item) => item !== field)
    : [...settings.copyExcludeFields, field]
}

watch(
  [
    panelOpen,
    settingsPage,
    messages,
    mcpHttpEndpoint,
    () => settings.copyExcludeFields.length,
    () => agentSummaries.value.length,
    () => agentDispatchState.value?.state,
    latestAgentActivity,
    () => agentSessions.value.length,
  ],
  async ([isOpen]) => {
    if (!isOpen) {
      settingsPagesHeight.value = null
      return
    }
    await nextTick()
    syncSettingsPanelHeight()
  },
  { flush: "post" },
)

watch(agentBridgeAvailable, (available) => {
  if (available) return
  if (settingsPage.value === "sessions") {
    settingsPage.value = "automations"
  }
})

onMounted(() => {
  unsubscribeAgent = bridge.agent?.subscribe((event) => {
    if (event.agents) {
      agentSummaries.value = event.agents
    }
    if (event.agent) {
      upsertAgentSummary(event.agent)
    }
    if (event.dispatch) {
      agentDispatchState.value = event.dispatch
    }
  }) ?? null

  void refreshAgents()
  void refreshAgentSessions()
})

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

async function copyGuideValue(key: string, value: string): Promise<void> {
  const copied = await writeTextToClipboard(value)
  if (!copied) return

  guideCopyFeedback.value = key
  if (guideCopyTimer) {
    window.clearTimeout(guideCopyTimer)
  }

  guideCopyTimer = originalSetTimeout(() => {
    if (guideCopyFeedback.value === key) {
      guideCopyFeedback.value = null
    }
    guideCopyTimer = null
  }, 1400)
}

function syncSettingsPanelHeight(): void {
  if (!panelOpen.value) {
    settingsPagesHeight.value = null
    return
  }

  const activePage = settingsPage.value === "copy"
    ? copySettingsPageRef.value
    : settingsPage.value === "automations"
      ? automationsSettingsPageRef.value
      : settingsPage.value === "sessions"
        ? sessionsSettingsPageRef.value
        : mainSettingsPageRef.value

  if (!activePage) return

  settingsPagesHeight.value = Math.min(activePage.scrollHeight, getMaxSettingsPanelHeight())
}

function getMaxSettingsPanelHeight(): number {
  if (typeof window === "undefined") return SETTINGS_PANEL_MAX_HEIGHT
  return Math.min(SETTINGS_PANEL_MAX_HEIGHT, Math.round(window.innerHeight * 0.72))
}
</script>

<template>
  <div :ref="setToolbarRef" class="toolbar"
    :class="{ dragging: drag.isDragging.value, 'has-agent-send': showToolbarSendButton }"
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
        <IconListSparkle :size="COLLAPSED_TOOL_ICON_SIZE" />
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
          <IconPlay v-if="isFrozen" :size="PRIMARY_CONTROL_ICON_SIZE" />
          <IconPause v-else :size="PRIMARY_CONTROL_ICON_SIZE" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button"
          :title="showMarkers ? messages.toolbar.hideMarkers : messages.toolbar.showMarkers"
          :aria-label="showMarkers ? messages.toolbar.hideMarkersAria : messages.toolbar.showMarkersAria"
          :data-state="showMarkers ? undefined : 'hidden'" :disabled="!hasAnnotations" @click.stop="toggleMarkers">
          <IconEye v-if="showMarkers" :size="PRIMARY_CONTROL_ICON_SIZE" />
          <IconEyeOff v-else :size="PRIMARY_CONTROL_ICON_SIZE" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button"
          :title="isMarkdownFormat ? messages.toolbar.copyMarkdown : messages.toolbar.copyJson"
          :aria-label="isMarkdownFormat ? messages.toolbar.copyMarkdownAria : messages.toolbar.copyJsonAria"
          :disabled="!hasAnnotations" :data-active="copyFeedbackActive || undefined"
          @click.stop="void exportCurrentFormat()">
          <IconCopyAnimated :size="PRIMARY_CONTROL_ICON_SIZE" :copied="copyFeedbackActive" />
        </button>

        <button v-if="showToolbarSendButton" class="control-btn" :class="{ light: isLight }" type="button"
          :title="messages.toolbar.sendToAgent" :aria-label="messages.toolbar.sendToAgentAria"
          :disabled="!canSendToAgent" :data-active="dispatchInFlight || undefined" @click.stop="void sendToAgent()">
          <IconPaperPlane :size="SECONDARY_CONTROL_ICON_SIZE" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.clearAll"
          :aria-label="messages.toolbar.clearAllAria" :disabled="!hasAnnotations" data-danger @click.stop="clearAll">
          <IconTrashAlt :size="SECONDARY_CONTROL_ICON_SIZE" />
        </button>

        <div class="divider" :class="{ light: isLight }" />

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.settings"
          :aria-label="messages.toolbar.toggleSettingsAria" :data-active="panelOpen || undefined"
          @click.stop="toggleSettingsPanel">
          <IconGear :size="SECONDARY_CONTROL_ICON_SIZE" />
        </button>

        <button class="control-btn" :class="{ light: isLight }" type="button" :title="messages.toolbar.closeToolbar"
          :aria-label="messages.toolbar.closeToolbarAria" @click.stop="close">
          <IconXmarkLarge :size="SECONDARY_CONTROL_ICON_SIZE" />
        </button>
      </div>

      <!-- Settings / automations panel -->
      <Transition name="settings-panel">
        <div v-if="expanded && panelOpen" class="settings-panel" :class="{
          light: isLight,
          below: settingsPanelPlacement === 'below',
        }" data-no-drag @click.stop>
          <div class="settings-pages" :style="settingsPagesStyle">
            <div ref="mainSettingsPageRef" class="settings-page">
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
                <button class="nav-btn" :class="{ light: isLight }" type="button" @click="openCopySettingsPanel">
                  <span class="nav-btn-left">
                    <IconCopyAnimated :size="18" />
                    <span>{{ messages.settings.copySettings }}</span>
                  </span>
                  <span class="nav-btn-right">
                    <IconChevronRight :size="16" />
                  </span>
                </button>
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

              <div v-if="showCompanionPanel" class="settings-section">
                <button class="nav-btn" :class="{ light: isLight }" type="button" @click="openAutomationsPanel">
                  <span class="nav-btn-left">
                    <IconConnectedNodes :size="18" />
                    <span>{{ automationsPanelLabel }}</span>
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

            <div ref="copySettingsPageRef" class="settings-page">
              <div class="settings-header automations-header" :class="{ light: isLight }">
                <button class="back-btn" :class="{ light: isLight }" type="button" @click="showMainSettings">
                  <IconChevronLeft :size="16" />
                  <span>{{ messages.settings.copySettings }}</span>
                </button>
              </div>

              <div class="settings-section">
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.copySettingsDescription }}
                </p>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.copyPrefix }}</span>
                </div>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.copyPrefixDescription }}
                </p>
                <textarea class="copy-prefix-input" :class="{ light: isLight }" :value="settings.copyPrefix"
                  :placeholder="messages.settings.copyPrefixPlaceholder"
                  :style="{ borderColor: settings.annotationColor }" rows="3" spellcheck="false"
                  @input="settings.copyPrefix = ($event.target as HTMLTextAreaElement).value" />
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.copyExclusions }}</span>
                </div>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.copyExclusionsDescription }}
                </p>

                <div class="copy-field-list">
                  <label v-for="field in COPY_EXCLUDE_FIELDS" :key="field" class="toggle-row copy-field-row">
                    <input class="sr-only" type="checkbox" :checked="settings.copyExcludeFields.includes(field)"
                      @change="toggleCopyExcludedField(field)">
                    <span class="checkbox"
                      :class="{ checked: settings.copyExcludeFields.includes(field), light: isLight }">
                      <IconCheckSmallAnimated v-if="settings.copyExcludeFields.includes(field)" :size="14" />
                    </span>
                    <span class="toggle-label" :class="{ light: isLight }">
                      {{ messages.settings.copyFieldLabels[field] }}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div ref="automationsSettingsPageRef" class="settings-page">
              <div class="settings-header automations-header" :class="{ light: isLight }">
                <button class="back-btn" :class="{ light: isLight }" type="button" @click="showMainSettings">
                  <IconChevronLeft :size="16" />
                  <span>{{ automationsPanelLabel }}</span>
                </button>
              </div>

              <div class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.companionStatus
                  }}</span>
                  <span class="mcp-status" :class="{ light: isLight }">
                    <span class="status-dot" :class="mcpConnected ? 'connected' : 'disconnected'" />
                    {{ mcpConnected ? messages.settings.mcpStatusConnected : messages.settings.mcpStatusDisconnected }}
                  </span>
                </div>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ automationsPanelDescription }}
                </p>
              </div>

              <div v-if="agentBridgeAvailable" class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.currentAgent }}</span>
                  <span class="agent-inline-status" :class="{ light: isLight }">
                    {{ primaryAgentStatus }}
                  </span>
                </div>

                <div class="agent-summary-panel" :class="{ light: isLight }">
                  <div class="agent-summary-row">
                    <strong class="agent-summary-title">{{ primaryAgentTitle }}</strong>
                    <span class="agent-pill"
                      :class="[activeAgent ? getAgentStatusTone(activeAgent) : 'missing', { light: isLight }]">
                      {{ primaryAgentStatus }}
                    </span>
                  </div>

                  <p class="settings-description" :class="{ light: isLight }">
                    {{ primaryAgentGuidance }}
                  </p>

                  <div class="agent-primary-actions">
                    <button class="agent-primary-btn" :class="{ light: isLight }" type="button"
                      :disabled="primaryAgentActionDisabled" @click="void runPrimaryAgentAction()">
                      <IconExternalLink v-if="activeAgent && !activeAgent.available" :size="14" />
                      <IconPaperPlane v-else :size="14" />
                      <span>{{ primaryAgentActionLabel }}</span>
                    </button>
                    <button v-if="activeAgentConnected && activeAgent && !dispatchInFlight"
                      class="icon-action-btn compact-action" :class="{ light: isLight }" type="button"
                      :title="messages.settings.disconnectAgent" :aria-label="messages.settings.disconnectAgent"
                      :disabled="agentActionPending !== null && agentActionPending !== 'disconnect'"
                      @click="void disconnectAgent(activeAgent.id)">
                      <IconClose :size="14" />
                    </button>
                    <button v-if="dispatchInFlight" class="icon-action-btn compact-action" :class="{ light: isLight }"
                      type="button" :title="messages.settings.cancelSend" :aria-label="messages.settings.cancelSend"
                      :disabled="(agentActionPending !== null && agentActionPending !== 'dispatch') || !agentBridgeAvailable"
                      @click="void cancelAgentDispatch()">
                      <IconClose :size="14" />
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="agentBridgeAvailable" class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.agentsConnection
                  }}</span>
                  <span class="agent-inline-status" :class="{ light: isLight }">
                    {{ agentsAvailabilitySummaryLabel }}
                  </span>
                </div>

                <label class="toggle-row webhook-toggle">
                  <input class="sr-only" type="checkbox" :checked="settings.agentAutoSendEnabled"
                    @change="settings.agentAutoSendEnabled = ($event.target as HTMLInputElement).checked">
                  <span class="checkbox" :class="{ checked: settings.agentAutoSendEnabled, light: isLight }">
                    <IconCheckSmallAnimated v-if="settings.agentAutoSendEnabled" :size="14" />
                  </span>
                  <span class="toggle-label" :class="{ light: isLight }">{{ messages.settings.autoSendToAgent }}</span>
                </label>

                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.autoSendDescription }}
                </p>
              </div>

              <div v-if="agentBridgeAvailable" class="settings-section">
                <button class="nav-btn" :class="{ light: isLight }" type="button" @click="openAgentSessionsPanel">
                  <span class="nav-btn-left">
                    <IconClockList :size="18" />
                    <span>{{ messages.settings.agentSessions }}</span>
                  </span>
                  <span class="nav-btn-right">
                    <span class="agent-inline-status" :class="{ light: isLight }">
                      {{ messages.settings.agentSessionsCount(activeSessionCount, agentSessions.length) }}
                    </span>
                    <IconChevronRight :size="16" />
                  </span>
                </button>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.agentSessionsDescription }}
                </p>
              </div>

              <div v-if="agentBridgeAvailable" class="settings-section">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.agentSelection }}</span>
                </div>

                <div v-if="agentBridgeAvailable && sortedAgentSummaries.length > 0" class="agent-list compact">
                  <div v-for="agent in sortedAgentSummaries" :key="agent.id" class="agent-card compact"
                    :class="{ light: isLight, active: agent.isActive }">
                    <div class="agent-card-leading compact">
                      <AgentProviderIcon :icon="agent.icon" :label="agent.label" :light="isLight" />
                      <div class="agent-card-copy">
                        <div class="agent-card-title-row compact">
                          <span class="guide-card-title">{{ agent.label }}</span>
                          <span class="agent-pill" :class="[getAgentStatusTone(agent), { light: isLight }]">
                            {{ getAgentStatusLabel(agent) }}
                          </span>
                        </div>
                        <div class="agent-card-meta" :class="{ light: isLight }">
                          <span>{{ getAgentAvailabilityLabel(agent) }}</span>
                          <span v-if="agent.lastError">{{ agent.lastError }}</span>
                          <span v-else-if="!agent.available && agent.installHint">{{ agent.installHint }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="agent-card-actions compact">
                      <button class="icon-action-btn" :class="{ light: isLight, active: agent.isActive }" type="button"
                        :title="agent.isActive ? messages.settings.selectedAgentAria(agent.label) : messages.settings.useAgentAria(agent.label)"
                        :aria-label="agent.isActive ? messages.settings.selectedAgentAria(agent.label) : messages.settings.useAgentAria(agent.label)"
                        :disabled="!agent.available || agentActionPending !== null || agent.isActive"
                        @click="void selectAgent(agent.id)">
                        <IconCheckCircle v-if="agent.isActive" :size="16" />
                        <IconChevronRight v-else :size="16" />
                      </button>
                      <button v-if="agent.homepage" class="icon-action-btn" :class="{ light: isLight }" type="button"
                        :title="messages.settings.openHomepage" :aria-label="messages.settings.openHomepage"
                        :disabled="agentActionPending !== null" @click="openAgentHomepage(agent)">
                        <IconExternalLink :size="14" />
                      </button>
                    </div>
                  </div>
                </div>
                <p v-else class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.noAgentsAvailable }}
                </p>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ messages.settings.agentInstallPrerequisite }}
                </p>
              </div>

              <div class="settings-section" v-if="agentBridgeAvailable && latestAgentActivity">
                <div class="settings-row">
                  <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.agentLastActivity
                  }}</span>
                </div>
                <p class="settings-description" :class="{ light: isLight }">
                  {{ latestAgentActivity }}
                </p>
              </div>

              <div class="settings-section">
                <div class="guide-grid">
                  <div v-for="item in connectionCards" :key="item.key" class="guide-card" :class="{ light: isLight }">
                    <div class="guide-card-header">
                      <div class="guide-card-title">{{ item.label }}</div>
                      <button class="guide-copy-btn" :class="{ light: isLight }" type="button"
                        :title="messages.settings.copyValueAria(item.label)"
                        :aria-label="messages.settings.copyValueAria(item.label)"
                        :data-copied="guideCopyFeedback === item.key || undefined"
                        @click="void copyGuideValue(item.key, item.value)">
                        <IconCopyAnimated :size="16" :copied="guideCopyFeedback === item.key" />
                      </button>
                    </div>
                    <pre class="guide-code" :class="{ light: isLight }">{{ item.value }}</pre>
                  </div>
                </div>
              </div>

            </div>

            <div ref="sessionsSettingsPageRef" class="settings-page">
              <template v-if="agentBridgeAvailable">
                <div class="settings-header automations-header" :class="{ light: isLight }">
                  <button class="back-btn" :class="{ light: isLight }" type="button" @click="showAutomationsSettings">
                    <IconChevronLeft :size="16" />
                    <span>{{ messages.settings.agentSessions }}</span>
                  </button>
                </div>

                <div class="settings-section">
                  <div class="settings-row">
                    <span class="settings-label" :class="{ light: isLight }">{{ messages.settings.agentSessions }}</span>
                    <button class="icon-action-btn" :class="{ light: isLight }" type="button"
                      :title="messages.settings.refreshSessions" :aria-label="messages.settings.refreshSessions"
                      :disabled="sessionActionPending !== null" @click="void refreshAgentSessions()">
                      <IconRefresh :size="14" />
                    </button>
                  </div>
                  <p class="settings-description" :class="{ light: isLight }">
                    {{ messages.settings.agentSessionsDescription }}
                  </p>
                </div>

                <div class="settings-section">
                  <div v-if="sortedAgentSessions.length > 0" class="session-list">
                    <div v-for="session in sortedAgentSessions" :key="session.id" class="session-card"
                      :class="{ light: isLight }">
                      <div class="session-card-main">
                        <div class="session-card-title-row">
                          <strong class="guide-card-title">{{ getSessionDisplayTitle(session) }}</strong>
                          <span class="agent-pill" :class="[session.status, { light: isLight }]">
                            {{ getSessionStatusLabel(session.status) }}
                          </span>
                        </div>
                        <div class="session-card-meta" :class="{ light: isLight }">
                          <span>{{ formatSessionTimestamp(session.updatedAt ?? session.createdAt) }}</span>
                          <span>{{ messages.settings.sessionAnnotationCount(session.annotationCount) }}</span>
                          <span v-if="getSessionAgentLabel(session)">{{ messages.settings.sessionAgentLabel }}: {{
                            getSessionAgentLabel(session) }}</span>
                        </div>
                        <pre class="guide-code session-url" :class="{ light: isLight }">{{ session.url }}</pre>
                      </div>

                      <div v-if="session.status !== 'closed'" class="session-card-actions">
                        <button class="icon-action-btn" :class="{ light: isLight }"
                          type="button" :title="messages.settings.closeSession"
                          :aria-label="messages.settings.closeSession" :disabled="sessionActionPending !== null"
                          @click="void closeAgentSession(session.id)">
                          <IconClose :size="14" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p v-else class="settings-description" :class="{ light: isLight }">
                    {{ messages.settings.noAgentSessions }}
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
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
  --ag-toolbar-expanded-width: 220px;
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: var(--ag-toolbar-expanded-width);
  z-index: 100000;
  pointer-events: none;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.toolbar.has-agent-send {
  --ag-toolbar-expanded-width: 248px;
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
  height: 40px;
  background: rgba(14, 18, 26, 0.94);
  color: #f8fafc;
  border: none;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.06);
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
  width: 40px;
  border-radius: 14px;
  padding: 0;
  cursor: pointer;
}

.toolbar-container.collapsed:hover {
  background: rgba(22, 28, 39, 0.98);
}

.toolbar-container.collapsed:active {
  transform: scale(0.95);
}

/* Expanded pill */
.toolbar-container.expanded {
  width: var(--ag-toolbar-expanded-width);
  border-radius: 14px;
  padding: 4px;
}

/* Light mode */
.toolbar-container.light {
  background: rgba(255, 255, 255, 0.96);
  color: rgba(15, 23, 42, 0.86);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.06);
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
  gap: 3px;
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
  top: -10px;
  right: -10px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
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
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(248, 250, 252, 0.82);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease,
    opacity 0.2s ease;
}

.control-btn:hover:not(:disabled):not([data-active]):not([data-state]) {
  background: rgba(255, 255, 255, 0.08);
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
  background: rgba(15, 23, 42, 0.025);
  color: rgba(15, 23, 42, 0.56);
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
  height: 16px;
  margin: 0 1px;
  background: rgba(255, 255, 255, 0.12);
}

.divider.light {
  background: rgba(0, 0, 0, 0.1);
}

/* --- Settings panel -------------------------------------------------- */

.settings-panel {
  position: absolute;
  right: 5px;
  bottom: calc(100% + 8px);
  width: min(320px, calc(100vw - 24px));
  z-index: 1;
  background: rgba(14, 18, 26, 0.98);
  border-radius: 18px;
  padding: 0;
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.06);
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
  position: sticky;
  top: -13px;
  z-index: 2;
  display: flex;
  align-items: center;
  min-height: 24px;
  margin: -13px -16px 8px -16px;
  background: #0f121a;
  padding: 13px 16px 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
}

.settings-header.light {
  background: #fff;
  border-bottom-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}

.automations-header {
  padding-top: 20px;
  padding-bottom: 20px;
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
  margin-top: 6px;
  padding-top: 6px;
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

.copy-field-list {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.copy-field-row+.copy-field-row {
  margin-top: 0;
}

.webhook-toggle {
  margin-top: 8px;
}

.copy-prefix-input,
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
  line-height: 1.45;
  outline: none;
  transition: border-color 0.15s ease;
}

.copy-prefix-input {
  resize: none;
  font-family: inherit;
}

.webhook-url {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  resize: vertical;
}

.copy-prefix-input:focus,
.webhook-url:focus {
  border-color: inherit;
}

.copy-prefix-input::placeholder,
.webhook-url::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.copy-prefix-input.light,
.webhook-url.light {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
  color: rgba(0, 0, 0, 0.85);
}

.copy-prefix-input.light::placeholder,
.webhook-url.light::placeholder {
  color: rgba(0, 0, 0, 0.3);
}

/* --- Settings page slider -------------------------------------------- */

.settings-pages {
  display: flex;
  align-items: flex-start;
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.2s ease;
}

.settings-page {
  flex: 0 0 calc(100% / var(--ag-settings-page-count, 2));
  width: calc(100% / var(--ag-settings-page-count, 2));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
  max-height: min(72vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
  padding: 13px 16px 16px;
}

.settings-page::-webkit-scrollbar {
  width: 8px;
}

.settings-page::-webkit-scrollbar-track {
  background: transparent;
}

.settings-page::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.settings-page::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.24);
  border-color: transparent;
}

.settings-panel.light .settings-page {
  scrollbar-color: rgba(15, 23, 42, 0.16) transparent;
}

.settings-panel.light .settings-page::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.16);
  border-color: transparent;
}

.settings-panel.light .settings-page::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.22);
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
  font-size: 10.5px;
  line-height: 1.42;
  color: rgba(255, 255, 255, 0.42);
}

.settings-description.light {
  color: rgba(0, 0, 0, 0.4);
}

.agent-summary-panel {
  display: grid;
  gap: 10px;
  margin-top: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.agent-summary-panel.light {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
}

.agent-summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.agent-summary-title {
  font-size: 15px;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.agent-primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: #f5f5f5;
  color: #111827;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

.agent-primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
}

.agent-primary-btn.light {
  border-color: rgba(15, 23, 42, 0.14);
  background: #111827;
  color: #f8fafc;
}

.agent-primary-btn:disabled {
  opacity: 0.52;
  cursor: not-allowed;
  box-shadow: none;
}

.compact-action {
  flex-shrink: 0;
}

.agent-inline-status {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.58);
}

.agent-inline-status.light {
  color: rgba(0, 0, 0, 0.48);
}

.agent-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.agent-list.compact {
  gap: 8px;
}

.agent-card {
  display: grid;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.agent-card.light {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
}

.agent-card.active {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
}

.agent-card.active.light {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.035);
}

.agent-card.compact {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.agent-card-main {
  display: grid;
  gap: 8px;
}

.agent-card-leading {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
}

.agent-card-leading.compact {
  align-items: center;
}

.agent-card-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.agent-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-card-title-row.compact {
  flex-wrap: wrap;
  row-gap: 6px;
}

.agent-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10.5px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.46);
}

.agent-card-meta.light {
  color: rgba(0, 0, 0, 0.42);
}

.agent-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-card-actions.compact {
  align-items: center;
  justify-content: flex-end;
}

.agent-pill,
.mini-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.agent-pill {
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.82);
}

.agent-pill.light {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.72);
}

.agent-pill.available,
.agent-pill.ready {
  border-color: rgba(34, 197, 94, 0.24);
  color: #22c55e;
}

.agent-pill.connecting,
.agent-pill.busy {
  border-color: rgba(245, 158, 11, 0.24);
  color: #f59e0b;
}

.agent-pill.installable {
  border-color: rgba(251, 191, 36, 0.24);
  color: #fbbf24;
}

.agent-pill.approved {
  border-color: rgba(96, 165, 250, 0.24);
  color: #60a5fa;
}

.agent-pill.closed {
  border-color: rgba(148, 163, 184, 0.24);
  color: rgba(226, 232, 240, 0.86);
}

.agent-pill.missing,
.agent-pill.error {
  border-color: rgba(239, 68, 68, 0.24);
  color: #ef4444;
}

.mini-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.mini-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.mini-btn.light {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.75);
}

.mini-btn.light:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
}

.mini-btn.active {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
}

.mini-btn.active.light {
  border-color: rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.06);
  color: rgba(15, 23, 42, 0.84);
}

.icon-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.icon-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.icon-action-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.icon-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon-action-btn.active {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.icon-action-btn.light {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.7);
}

.icon-action-btn.light:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.88);
}

.icon-action-btn.light.active {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.mini-btn:disabled,
.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-actions {
  display: grid;
  gap: 8px;
}

.session-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.session-card {
  display: grid;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.session-card.light {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
}

.session-card-main {
  display: grid;
  gap: 6px;
}

.session-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.session-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 10.5px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.46);
}

.session-card-meta.light {
  color: rgba(0, 0, 0, 0.42);
}

.session-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.session-url {
  margin-top: 0;
}

/* --- Get started guide ----------------------------------------------- */

.guide-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.guide-card {
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.guide-card.light {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
}

.guide-card+.guide-card {
  margin-top: 8px;
}

.guide-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.guide-card-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.82);
}

.guide-copy-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s ease;
}

.guide-copy-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
}

.guide-copy-btn:active {
  transform: scale(0.94);
}

.guide-copy-btn[data-copied] {
  color: #22c55e;
}

.guide-copy-btn.light {
  color: rgba(0, 0, 0, 0.38);
}

.guide-copy-btn.light:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.74);
}

.settings-panel.light .guide-card-title {
  color: rgba(0, 0, 0, 0.74);
}

.guide-code {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.68);
  color: #e2e8f0;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.guide-code.light {
  background: rgba(241, 245, 249, 0.95);
  color: rgba(15, 23, 42, 0.9);
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
