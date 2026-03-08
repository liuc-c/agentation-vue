<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue"
import { originalSetTimeout } from "../composables/useFreezeState.js"

defineProps<{
  content: string
}>()

const visible = ref(false)
const position = ref({ top: 0, left: 0 })
const triggerRef = ref<HTMLElement | null>(null)

let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onMouseEnter(e: MouseEvent): void {
  const trigger = (e.currentTarget as HTMLElement)?.firstElementChild as HTMLElement | null
  triggerRef.value = trigger
  hoverTimer = originalSetTimeout(() => {
    if (!triggerRef.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    position.value = {
      top: rect.top + rect.height / 2,
      left: rect.left - 8,
    }
    visible.value = true
  }, 500)
}

function onMouseLeave(): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  visible.value = false
  triggerRef.value = null
}

onBeforeUnmount(() => {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
  }
})
</script>

<template>
  <span
    class="ag-tooltip-trigger"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <slot />
    <Teleport to="body">
      <Transition name="ag-tooltip">
        <div
          v-if="visible"
          data-feedback-toolbar
          :style="{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translate(-100%, -50%)',
            zIndex: 100010,
            maxWidth: '180px',
            padding: '6px 10px',
            borderRadius: '8px',
            background: '#383838',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '11px',
            lineHeight: '1.4',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: '400',
            letterSpacing: '-0.01em',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.ag-tooltip-trigger {
  display: inline-flex;
  align-items: center;
}

.ag-tooltip-enter-active {
  transition: opacity 0.15s ease;
}

.ag-tooltip-leave-active {
  transition: opacity 0.1s ease;
}

.ag-tooltip-enter-from,
.ag-tooltip-leave-to {
  opacity: 0;
}
</style>
