<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue"
import type { AnnotationV2 } from "@liuovo/agentation-vue-core"
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
  left: string
  annotation: AnnotationV2
}

const store = injectStrict(ANNOTATIONS_STORE_KEY, "annotations store")
const overlay = injectStrict(OVERLAY_KEY, "overlay state")
const settings = injectStrict(SETTINGS_KEY, "settings state")
const i18n = injectStrict(I18N_KEY, "i18n state")

const hoveredId = ref<string | null>(null)
const messages = computed(() => i18n.messages)

const scroll = reactive({
  x: window.scrollX,
  y: window.scrollY,
})

const showMarkers = computed(() => settings.showMarkers)
const annotationColor = computed(() => settings.annotationColor || "#3c82f7")

const markers = computed<MarkerPosition[]>(() => {
  return store.annotations
    .map((annotation, index) => {
      const bb = getBoundingBox(annotation)
      if (!bb) return null

      const isFixed = (annotation.metadata as { isFixed?: boolean } | undefined)?.isFixed ?? false
      const markerXPercent = getMarkerXPercent(annotation)
      const fallbackLeft = isFixed ? bb.x + bb.width : bb.x + bb.width - scroll.x

      return {
        id: annotation.id,
        number: index + 1,
        top: isFixed ? bb.y : bb.y - scroll.y,
        left: markerXPercent === null ? `${fallbackLeft}px` : `${markerXPercent}%`,
        annotation,
      }
    })
    .filter((m): m is MarkerPosition => m !== null)
})

onMounted(() => {
  window.addEventListener("scroll", syncScroll, true)
  window.addEventListener("resize", syncScroll)
})

onUnmounted(() => {
  window.removeEventListener("scroll", syncScroll, true)
  window.removeEventListener("resize", syncScroll)
})

function syncScroll(): void {
  scroll.x = window.scrollX
  scroll.y = window.scrollY
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

function getBoundingBox(annotation: AnnotationV2): BoundingBox | undefined {
  return (annotation.metadata as { boundingBox?: BoundingBox } | undefined)?.boundingBox
}

function getMarkerXPercent(annotation: AnnotationV2): number | null {
  const value = (annotation.metadata as { markerXPercent?: unknown } | undefined)?.markerXPercent
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
</script>

<template>
  <div v-if="showMarkers" class="marker-layer" aria-hidden="true" data-annotation-marker>
    <TransitionGroup name="marker">
      <div
        v-for="marker in markers"
        :key="marker.id"
        class="marker-wrapper"
        :style="{ top: `${marker.top}px`, left: marker.left }"
      >
        <button
          class="marker-dot"
          :class="{ hovered: hoveredId === marker.id }"
          :style="{ backgroundColor: hoveredId === marker.id ? '#ff3b30' : annotationColor }"
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
