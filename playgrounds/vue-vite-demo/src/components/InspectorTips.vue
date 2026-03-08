<script setup lang="ts">
const tips = [
  "Select an element in DevTools and run __agentationDemo.inspect($0)",
  "Or run __agentationDemo.inspect('[data-trace-target]') to inspect the first card",
  "Tracer resolves source positions first, then Vue internals fill the fallback path",
]
</script>

<template>
  <aside class="tips">
    <h2>Console checks</h2>
    <ul>
      <li v-for="tip in tips" :key="tip">{{ tip }}</li>
    </ul>
  </aside>
</template>

<style scoped>
.tips {
  max-width: 960px;
  margin: 0 auto 24px;
  padding: 20px 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.72);
}

h2 {
  margin: 0 0 12px;
  font-size: 1rem;
}

ul {
  margin: 0;
  padding-left: 18px;
  color: #cbd5e1;
  line-height: 1.7;
}
</style>
