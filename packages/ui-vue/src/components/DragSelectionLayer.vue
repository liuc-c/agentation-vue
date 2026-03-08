<script setup lang="ts">
import { computed } from "vue"
import { AREA_SELECTION_KEY } from "../injection-keys.js"
import { injectStrict } from "../utils.js"

const areaSelection = injectStrict(AREA_SELECTION_KEY, "area selection state")

const selectionRectStyle = computed(() => {
  const rect = areaSelection.rect
  if (!rect) return null
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})

const matchedBoxes = computed(() => {
  if (!areaSelection.active) return []
  return areaSelection.matched
    .filter((item) => document.contains(item.element))
    .map((item, index) => {
      const rect = item.element.getBoundingClientRect()
      return { key: `match-${index}`, top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    })
    .filter((box) => box.width > 0 && box.height > 0)
})
</script>

<template>
  <div v-if="areaSelection.active && selectionRectStyle" class="drag-selection-layer" aria-hidden="true">
    <div
      v-for="box in matchedBoxes"
      :key="box.key"
      class="matched-box"
      :style="{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }"
    />
    <div class="selection-rect" :style="selectionRectStyle" />
  </div>
</template>

<style scoped>
.drag-selection-layer {
  position: fixed;
  inset: 0;
  z-index: 99997;
  pointer-events: none;
}

.matched-box {
  position: fixed;
  border: 2px solid var(--ag-selected, #f59e0b);
  border-radius: 4px;
  background: color-mix(in srgb, var(--ag-selected, #f59e0b) 10%, transparent);
}

.selection-rect {
  position: fixed;
  border: 1.5px dashed var(--ag-accent, #3b82f6);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ag-accent, #3b82f6) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ag-accent, #3b82f6) 20%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .matched-box,
  .selection-rect {
    transition: none;
  }
}
</style>
