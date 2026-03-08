<script setup lang="ts">
import { computed } from "vue"
import StatusPill from "./StatusPill.vue"

const props = defineProps<{
  label: string
  description: string
  tone: "primary" | "secondary"
}>()

const actionLabel = computed(() =>
  props.tone === "primary" ? "Open review" : "Preview change",
)
</script>

<template>
  <article class="card" data-trace-target>
    <StatusPill :tone="tone" />
    <h3>{{ label }}</h3>
    <p>{{ description }}</p>
    <button class="action-button" type="button">
      {{ actionLabel }}
    </button>
  </article>
</template>

<style scoped>
.card {
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.96));
}

h3 {
  margin: 0;
  font-size: 1.1rem;
}

p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.65;
}

.action-button {
  justify-self: start;
  padding: 10px 14px;
  border: 0;
  border-radius: 999px;
  background: #818cf8;
  color: #0f172a;
  font-weight: 700;
  cursor: pointer;
}
</style>
