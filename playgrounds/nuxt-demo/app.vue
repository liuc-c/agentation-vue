<script setup lang="ts">
const appName = "Agentation Nuxt Demo"
const features = [
  "Annotation overlay in Nuxt dev mode",
  "Vue source resolution via vue-tracer",
  "Client-only plugin bootstrap (no SSR)",
]
</script>

<template>
  <main class="app">
    <h1>{{ appName }}</h1>
    <p>Playground for testing <strong>agentation-vue</strong> with Nuxt.</p>

    <section class="demo-card">
      <h2>Features</h2>
      <ul>
        <li v-for="feature in features" :key="feature">{{ feature }}</li>
      </ul>
    </section>

    <section class="demo-card">
      <h2>Interactive Elements</h2>
      <div class="button-row">
        <button @click="() => {}">Click Me</button>
        <a href="#">Sample Link</a>
      </div>
      <p>Try hovering and clicking on elements to create annotations.</p>
    </section>

    <section class="demo-card">
      <h2>Animation Freeze Demo</h2>
      <p>Use the pause button or press <code>P</code> to freeze all animations.</p>
      <div class="animation-grid">
        <div class="animation-tile">
          <strong>CSS progress bar</strong>
          <div class="progress-track">
            <div class="progress-fill" />
          </div>
        </div>
        <div class="animation-tile">
          <strong>Pulse dots</strong>
          <div class="pulse-dots">
            <span class="pulse-dot" style="animation-delay: 0s" />
            <span class="pulse-dot" style="animation-delay: 0.33s" />
            <span class="pulse-dot" style="animation-delay: 0.66s" />
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.app {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  color: #e2e8f0;
}

:global(body) {
  margin: 0;
  background: #0f172a;
}

code {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  font-size: 0.9em;
}

.demo-card {
  margin-top: 1.25rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.55);
}

.button-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.button-row button,
.button-row a {
  color: #93c5fd;
}

.animation-grid {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.animation-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 1rem;
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.55);
}

.progress-track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  animation: progressSlide 1.4s ease-in-out infinite;
}

.pulse-dots {
  display: flex;
  gap: 10px;
  align-items: center;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #60a5fa;
  animation: pulseDot 2s ease-in-out infinite;
}

@keyframes progressSlide {
  0% { width: 0; }
  100% { width: 100%; }
}

@keyframes pulseDot {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.6); opacity: 1; }
}
</style>
