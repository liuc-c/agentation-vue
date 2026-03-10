<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue"
import type { AnnotationStatus, AnnotationV2 } from "@liuovo/agentation-vue-core"
import { findAnnotationTarget } from "../annotation-target.js"
import { ANNOTATIONS_STORE_KEY, I18N_KEY, OVERLAY_KEY, SETTINGS_KEY } from "../injection-keys.js"
import { injectStrict } from "../utils.js"

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface MarkerPosition {
  id: string
  number: number
  top: number
  left: number
  annotation: AnnotationV2
}

const store = injectStrict(ANNOTATIONS_STORE_KEY, "annotations store")
const overlay = injectStrict(OVERLAY_KEY, "overlay state")
const settings = injectStrict(SETTINGS_KEY, "settings state")
const i18n = injectStrict(I18N_KEY, "i18n state")

const hoveredId = ref<string | null>(null)
const messages = computed(() => i18n.messages)
const syncVersion = ref(0)

const scroll = reactive({
  x: window.scrollX,
  y: window.scrollY,
})

const showMarkers = computed(() => settings.showMarkers)
const annotationColor = computed(() => settings.annotationColor || "#3c82f7")

const markers = computed<MarkerPosition[]>(() => {
  syncVersion.value

  return store.annotations
    .map((annotation, index) => {
      const metadata = annotation.metadata as { isMultiSelect?: boolean } | undefined

      if (metadata?.isMultiSelect) {
        const bb = getBoundingBox(annotation)
        if (!bb) return null

        return {
          id: annotation.id,
          number: index + 1,
          top: bb.y - scroll.y,
          left: bb.x + bb.width / 2 - scroll.x,
          annotation,
        }
      }

      const liveTarget = findAnnotationTarget(annotation)
      if (!liveTarget) return null

      const liveRect = liveTarget.getBoundingClientRect()

      return {
        id: annotation.id,
        number: index + 1,
        top: liveRect.top,
        left: liveRect.left + liveRect.width / 2,
        annotation,
      }
    })
    .filter((m): m is MarkerPosition => m !== null)
})

let syncFrame: number | null = null
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
  window.addEventListener("scroll", scheduleLayoutSync, true)
  window.addEventListener("resize", scheduleLayoutSync)
  document.addEventListener("load", scheduleLayoutSync, true)
  document.addEventListener("transitionend", scheduleLayoutSync, true)
  document.addEventListener("animationend", scheduleLayoutSync, true)

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => scheduleLayoutSync())
    resizeObserver.observe(document.documentElement)
    if (document.body) {
      resizeObserver.observe(document.body)
    }
  }

  mutationObserver = new MutationObserver(() => scheduleLayoutSync())
  mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  })
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  })
  if (document.body) {
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    })
  }

  scheduleLayoutSync()
})

onUnmounted(() => {
  window.removeEventListener("scroll", scheduleLayoutSync, true)
  window.removeEventListener("resize", scheduleLayoutSync)
  document.removeEventListener("load", scheduleLayoutSync, true)
  document.removeEventListener("transitionend", scheduleLayoutSync, true)
  document.removeEventListener("animationend", scheduleLayoutSync, true)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  if (syncFrame !== null) {
    window.cancelAnimationFrame(syncFrame)
  }
})

function scheduleLayoutSync(): void {
  if (syncFrame !== null) return

  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = null
    syncLayout()
  })
}

function syncLayout(): void {
  scroll.x = window.scrollX
  scroll.y = window.scrollY
  syncVersion.value += 1
}

function onMarkerHover(id: string): void {
  hoveredId.value = id
}

function onMarkerLeave(): void {
  hoveredId.value = null
}

function onMarkerClick(marker: MarkerPosition, event: MouseEvent): void {
  event.stopPropagation()
  hoveredId.value = null

  const btn = event.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  overlay.showEditPopover(marker.annotation, rect)
}

function truncate(text: string, max = 72): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function getStatus(annotation: AnnotationV2): AnnotationStatus {
  return annotation.status ?? "pending"
}

function getStatusLabel(annotation: AnnotationV2): string {
  switch (getStatus(annotation)) {
    case "acknowledged":
      return messages.value.workflow.statusAcknowledged
    case "processing":
      return messages.value.workflow.statusProcessing
    case "resolved":
      return messages.value.workflow.statusResolved
    case "dismissed":
      return messages.value.workflow.statusDismissed
    default:
      return messages.value.workflow.statusPending
  }
}

function getMarkerColor(annotation: AnnotationV2): string {
  switch (getStatus(annotation)) {
    case "acknowledged":
      return "#0ea5e9"
    case "processing":
      return "#f59e0b"
    case "resolved":
      return "#22c55e"
    case "dismissed":
      return "#94a3b8"
    default:
      return annotationColor.value
  }
}

function getBoundingBox(annotation: AnnotationV2): BoundingBox | undefined {
  return (annotation.metadata as { boundingBox?: BoundingBox } | undefined)?.boundingBox
}
</script>

<template>
  <div v-if="showMarkers" class="marker-layer" aria-hidden="true" data-annotation-marker>
    <TransitionGroup name="marker">
      <div
        v-for="marker in markers"
        :key="marker.id"
        class="marker-wrapper"
        :style="{ top: `${marker.top}px`, left: `${marker.left}px` }"
      >
        <button
          class="marker-dot"
          :class="[{ hovered: hoveredId === marker.id }, `status-${getStatus(marker.annotation)}`]"
          :style="{ backgroundColor: hoveredId === marker.id ? '#ff3b30' : getMarkerColor(marker.annotation) }"
          type="button"
          :aria-label="messages.marker.annotationAria(marker.number)"
          @click.stop="onMarkerClick(marker, $event)"
          @mouseenter="onMarkerHover(marker.id)"
          @mouseleave="onMarkerLeave"
        >
          {{ marker.number }}
        </button>

        <!-- Tooltip (below marker) -->
        <Transition name="tooltip">
          <div
            v-if="hoveredId === marker.id"
            class="tooltip"
          >
            <div class="tooltip-element">{{ marker.annotation.elementSelector }}</div>
            <div class="tooltip-meta">
              <span class="tooltip-status" :data-status="getStatus(marker.annotation)">
                {{ getStatusLabel(marker.annotation) }}
              </span>
              <span v-if="marker.annotation.thread?.length" class="tooltip-thread">
                {{ messages.workflow.replyCount(marker.annotation.thread.length) }}
              </span>
            </div>
            <div class="tooltip-comment">{{ truncate(marker.annotation.comment) }}</div>
            <div class="tooltip-hint">{{ messages.marker.clickToEdit }}</div>
          </div>
        </Transition>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
@keyframes markerIn {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes markerOut {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
}

.marker-layer {
  position: fixed;
  inset: 0;
  z-index: 99998;
  pointer-events: none;
}

.marker-wrapper {
  position: fixed;
  pointer-events: none;
}

.marker-dot {
  position: absolute;
  transform: translate(-50%, -50%) scale(1);
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  color: white;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  will-change: transform, background-color;
  z-index: 1;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.marker-dot:hover {
  transform: translate(-50%, -50%) scale(1.1);
  z-index: 2;
}

.marker-dot.hovered {
  background-color: #ff3b30;
}

/* Marker enter/exit animations */
.marker-enter-active {
  animation: markerIn 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.marker-leave-active {
  animation: markerOut 0.2s ease-out both;
  pointer-events: none;
}

/* Tooltip — positioned below marker */
.tooltip {
  position: absolute;
  top: calc(50% + 18px);
  left: 50%;
  /* Counter-scale: 1/1.1 ≈ 0.909 to offset parent hover scale */
  transform: translateX(-50%) scale(0.909);
  z-index: 100002;
  background: #1a1a1a;
  padding: 8px 12px;
  border-radius: 12px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: 400;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08);
  min-width: 120px;
  max-width: 200px;
  pointer-events: none;
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
}

.tooltip-enter-active {
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;
}
.tooltip-leave-active {
  transition: opacity 0.08s ease-in;
}
.tooltip-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(2px) scale(0.891);
}
.tooltip-leave-to {
  opacity: 0;
}

.tooltip-element {
  font-size: 12px;
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tooltip-comment {
  font-size: 13px;
  line-height: 1.4;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-bottom: 2px;
}

.tooltip-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 10px;
}

.tooltip-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 999px;
  font-weight: 600;
  background: rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.tooltip-status[data-status="pending"] {
  background: rgba(59, 130, 246, 0.16);
  color: #93c5fd;
}

.tooltip-status[data-status="acknowledged"] {
  background: rgba(14, 165, 233, 0.16);
  color: #67e8f9;
}

.tooltip-status[data-status="processing"] {
  background: rgba(245, 158, 11, 0.18);
  color: #fcd34d;
}

.tooltip-status[data-status="resolved"] {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.tooltip-thread {
  color: rgba(255, 255, 255, 0.48);
}

.tooltip-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .marker-dot { transition: none; }
  .marker-enter-active,
  .marker-leave-active { animation: none; }
  .tooltip-enter-active,
  .tooltip-leave-active { transition: none; }
}
</style>
