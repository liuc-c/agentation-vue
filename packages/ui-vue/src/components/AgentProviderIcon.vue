<script setup lang="ts">
import { computed } from "vue"
import { Icon, addCollection, getIcon } from "@iconify/vue"
import vscodeIcons from "@iconify-json/vscode-icons/icons.json"

addCollection(vscodeIcons)

const DARK_FALLBACK_ICON = "vscode-icons:file-type-agents"
const LIGHT_FALLBACK_ICON = "vscode-icons:file-type-light-agents"

const props = withDefaults(defineProps<{
  icon?: string
  label: string
  light?: boolean
  size?: number
}>(), {
  icon: undefined,
  light: false,
  size: 22,
})

const fallbackIcon = computed(() => (props.light ? LIGHT_FALLBACK_ICON : DARK_FALLBACK_ICON))

const resolvedIcon = computed(() => {
  const requested = props.icon?.trim()
  if (requested && getIcon(requested)) {
    return requested
  }

  return fallbackIcon.value
})
</script>

<template>
  <span class="agent-provider-icon" :title="label" :aria-label="label">
    <Icon :icon="resolvedIcon" :height="size" :width="size" />
  </span>
</template>

<style scoped>
.agent-provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background:
    radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 55%),
    linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.74));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 18px rgba(15, 23, 42, 0.22);
  color: #fff;
}
</style>
