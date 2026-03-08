<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, watch } from "vue"
import { AREA_SELECTION_KEY, SELECTION_KEY } from "../injection-keys.js"
import { injectStrict } from "../utils.js"

interface HighlightBox {
  key: string
  isSelected: boolean
  top: number
  left: number
  width: number
  height: number
}

const selection = injectStrict(SELECTION_KEY, "selection state")
const areaSelection = injectStrict(AREA_SELECTION_KEY, "area selection state")

const state = reactive({
  boxes: [] as HighlightBox[],
})

const boxes = computed(() =>
  state.boxes.map((box) => ({
    ...box,
    style: {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    },
  })),
)

watch(
  () => [selection.hovered, selection.selected, areaSelection.active] as const,
  () => syncBoxes(),
  { immediate: true },
)

onMounted(() => {
  window.addEventListener("scroll", syncBoxes, true)
  window.addEventListener("resize", syncBoxes)
})

onUnmounted(() => {
  window.removeEventListener("scroll", syncBoxes, true)
  window.removeEventListener("resize", syncBoxes)
})

function syncBoxes(): void {
  // Hide highlights during area drag (DragSelectionLayer handles visuals)
  if (areaSelection.active) {
    state.boxes = []
    return
  }

  const selected = selection.selected

  // Multi-select: show highlight per selected element
  if (selected?.multiSelectElements?.length) {
    const next = selected.multiSelectElements
      .filter((el) => document.contains(el))
      .map((el, index) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
          ? { key: `selected-${index}`, isSelected: true, top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          : null
      })
      .filter((box): box is HighlightBox => box !== null)

    if (next.length > 0) {
      state.boxes = next
      return
    }
  }

  // Fallback for persisted multi-select (no live DOM refs)
  if (selected?.isMultiSelect && selected.elementBoundingBoxes?.length) {
    state.boxes = selected.elementBoundingBoxes
      .map((bb, index) => ({
        key: `selected-${index}`,
        isSelected: true,
        top: bb.y - window.scrollY,
        left: bb.x - window.scrollX,
        width: bb.width,
        height: bb.height,
      }))
      .filter((box) => box.width > 0 && box.height > 0)
    return
  }

  // Single-element: hover or selected
  const snapshot = selected ?? selection.hovered
  if (!snapshot) {
    state.boxes = []
    return
  }

  const rect = snapshot.element.getBoundingClientRect()
  if (rect.width <= 0 && rect.height <= 0) {
    state.boxes = []
    return
  }

  state.boxes = [{
    key: selected ? "selected" : "hovered",
    isSelected: selected !== null,
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }]
}
</script>

<template>
  <div class="highlight-layer" aria-hidden="true">
    <TransitionGroup name="highlight">
      <div
        v-for="box in boxes"
        :key="box.key"
        class="highlight-box"
        :class="{ selected: box.isSelected }"
        :style="box.style"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.highlight-layer {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.highlight-box {
  position: fixed;
  border: 2px solid var(--ag-accent, #3b82f6);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ag-accent, #3b82f6) 8%, transparent);
  transition:
    top 0.06s ease-out,
    left 0.06s ease-out,
    width 0.06s ease-out,
    height 0.06s ease-out,
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.highlight-box.selected {
  border-color: var(--ag-selected, #f59e0b);
  background: color-mix(in srgb, var(--ag-selected, #f59e0b) 10%, transparent);
}

.highlight-enter-active,
.highlight-leave-active {
  transition: opacity 0.15s ease;
}

.highlight-enter-from,
.highlight-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .highlight-box {
    transition: none;
  }

  .highlight-enter-active,
  .highlight-leave-active {
    transition: none;
  }
}
</style>
