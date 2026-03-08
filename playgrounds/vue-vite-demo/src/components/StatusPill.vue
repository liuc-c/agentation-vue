<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  tone: "primary" | "secondary"
}>()

const label = computed(() =>
  props.tone === "primary" ? "Needs review" : "Ready to ship",
)
</script>

<template>
  <span class="pill" :class="`tone-${tone}`">{{ label }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  justify-self: start;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.tone-primary {
  background: rgba(251, 191, 36, 0.18);
  color: #fde68a;
}

.tone-secondary {
  background: rgba(52, 211, 153, 0.16);
  color: #a7f3d0;
}
</style>
