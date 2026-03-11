<script setup lang="ts">
import TraceTarget from "./TraceTarget.vue"

defineProps<{
  title: string
  description: string
}>()

const cards = [
  {
    id: "checkout-copy",
    label: "Review checkout copy",
    description: "Inspect the badge, heading, paragraph, or button inside this card.",
    tone: "primary" as const,
  },
  {
    id: "shipping-note",
    label: "Confirm shipping notice",
    description: "A second sibling subtree helps validate stable traces across multiple targets.",
    tone: "secondary" as const,
  },
]
</script>

<template>
  <section class="panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">Nested components</p>
        <h2>{{ title }}</h2>
      </div>
      <p class="description">{{ description }}</p>
    </header>

    <div class="grid">
      <TraceTarget
        v-for="card in cards"
        :key="card.id"
        :label="card.label"
        :description="card.description"
        :tone="card.tone"
      />
    </div>
  </section>
</template>

<style scoped>
.panel {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 28px;
  background: rgba(15, 23, 42, 0.82);
}

.panel-header {
  display: flex;
  gap: 24px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #67e8f9;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #ef4444;
  font-size: 1.5rem;
}

.description {
  max-width: 420px;
  margin: 0;
  color: #22c55e;
  line-height: 1.65;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}
</style>
