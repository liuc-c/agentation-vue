import { createApp } from "vue"
import { findTraceFromElement } from "vite-plugin-vue-tracer/client/record"
import {
  OverlayRoot,
  createAnnotationsStore,
  createAreaSelectionState,
  createSelectionState,
  createSettingsState,
} from "@liuovo/agentation-vue-ui"
import type { RuntimeBridge, UiNotification } from "@liuovo/agentation-vue-ui"
import type { ResolvedAgentationVueOptions } from "../types.ts"
import { bindTracer } from "./resolver/index.ts"
import { setupInfrastructure, attachListeners } from "./bootstrap.ts"
import { createRuntimeSyncBridge } from "./sync.ts"

// ---------------------------------------------------------------------------
// Browser console logging (styled with %c)
// ---------------------------------------------------------------------------

const badgeStyle = [
  "background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  "color: #34d399",
  "font-weight: 700",
  "padding: 2px 8px",
  "border-radius: 4px",
  "font-size: 11px",
].join(";")

const msgStyle = "color: #22d3ee; font-weight: 600;"
const detailStyle = "color: #a78bfa;"

function logBrowser(emoji: string, message: string, detail = ""): void {
  console.log(
    `%c🛰 agentation%c ${emoji} ${message}%c${detail ? ` ${detail}` : ""}`,
    badgeStyle,
    msgStyle,
    detailStyle,
  )
}

/**
 * Runtime entry point — executed in the browser via the virtual module.
 *
 * 1. Disposes any previous runtime instance (supports HMR re-injection)
 * 2. Binds the vue-tracer lookup function into the resolver
 * 3. Sets up DOM containers and storage bridge
 * 4. Creates store, selection, settings, and area selection state
 * 5. Attaches event listeners that drive Vue state
 * 6. Mounts the Vue overlay app
 */
export function runAgentationRuntime(options: ResolvedAgentationVueOptions): void {
  logBrowser("✨", "Runtime starting", `storagePrefix="${options.storagePrefix}" locale="${options.locale}"`)

  // Dispose previous instance if re-injected (e.g. HMR)
  window.__agentationRuntime?.dispose()

  // Bind vue-tracer into the resolver
  const tracerAvailable = typeof findTraceFromElement === "function"
  if (tracerAvailable) {
    logBrowser("🔎", "Binding vue-tracer", "precise source mapping enabled")
    bindTracer(findTraceFromElement)
  } else {
    console.warn(
      "%c🛰 agentation%c ⚠️ vue-tracer not found — using Vue internals fallback",
      badgeStyle,
      "color: #f59e0b; font-weight: 600;",
    )
  }

  // 1. Infrastructure: DOM containers + storage + source resolver
  logBrowser("🏗️", "Setting up infrastructure", "DOM containers + storage bridge")
  const infra = setupInfrastructure(options.storagePrefix)
  const notificationListeners = new Set<(notification: UiNotification) => void>()

  // 2. Build the bridge for the UI layer
  const bridge: RuntimeBridge = {
    appRoot: infra.appRoot,
    overlayRoot: infra.overlayRoot,
    options: { outputDetail: options.outputDetail },
    storage: infra.storage,
    sync: options.sync
      ? createRuntimeSyncBridge(options.sync, infra.storage)
      : undefined,
    notify(notification) {
      for (const listener of notificationListeners) {
        listener(notification)
      }
    },
    subscribeNotifications(listener) {
      notificationListeners.add(listener)
      return () => {
        notificationListeners.delete(listener)
      }
    },
    resolveSource: infra.resolveSource,
  }

  // 3. Create store, selection, settings, and area selection state
  logBrowser("🗂️", "Creating annotations store + selection + settings")
  const store = createAnnotationsStore(bridge)
  const selection = createSelectionState()
  const settings = createSettingsState({
    outputDetail: options.outputDetail,
    locale: options.locale,
  })
  const areaSelection = createAreaSelectionState()

  // 4. Attach event listeners (pointer/click/drag → store/selection)
  logBrowser("👂", "Attaching event listeners", "pointer + click + drag selection")
  const listeners = attachListeners(
    store,
    selection,
    areaSelection,
    settings,
    infra.resolveSource,
    bridge.notify,
  )

  // 5. Mount the Vue overlay app
  logBrowser("🪄", "Mounting overlay app")
  const app = createApp(OverlayRoot, {
    bridge,
    store,
    selection,
    settings,
    areaSelection,
  })
  app.mount(infra.appRoot)

  // 6. Expose runtime context for HMR disposal + console debugging
  window.__agentationRuntime = {
    dispose() {
      bridge.sync?.dispose()
      app.unmount()
      listeners.dispose()
      areaSelection.clear()
      selection.clearHovered()
      selection.clearSelection()
      infra.cleanup()
      delete window.__agentationDemo
    },
  }

  // Diagnostics
  logBrowser("✅", "Runtime ready!", "Try: __agentationDemo.inspect($0)")
}
