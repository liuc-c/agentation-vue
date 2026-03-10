<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import FeaturePanel from "./components/FeaturePanel.vue"

const jsCounter = ref(0)
let counterTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  counterTimer = window.setInterval(() => {
    jsCounter.value++
  }, 500)
})

onUnmounted(() => {
  if (counterTimer) window.clearInterval(counterTimer)
})
</script>

<template>
  <main class="app">
    <header class="hero">
      <p class="eyebrow">Agentation Vue</p>
      <h1>Phase 5 — Codex Verified</h1>
      <p class="subtitle">
        Click any element to annotate it. Hover to see the highlight.
        Use the toolbar (bottom-right) to export, open settings, or toggle annotation mode.
      </p>
    </header>

    <FeaturePanel
      title="Sample content"
      description="Each card is a nested component. Click any element to create an annotation."
    />

    <section class="demo-section">
      <h2>Animation pause demo</h2>
      <p>Use the pause button or press <code>P</code> to freeze all animations.</p>

      <div class="animation-grid">
        <!-- Progress bar (CSS keyframes) -->
        <div class="animation-card">
          <strong>CSS progress bar</strong>
          <div class="progress-track">
            <div class="progress-fill" />
          </div>
        </div>

        <!-- Pulse dots (CSS animation, staggered) -->
        <div class="animation-card">
          <strong>Pulse dots</strong>
          <div class="pulse-dots">
            <span class="pulse-dot" style="animation-delay: 0s" />
            <span class="pulse-dot" style="animation-delay: 0.33s" />
            <span class="pulse-dot" style="animation-delay: 0.66s" />
          </div>
        </div>

        <!-- JS counter (setInterval) -->
        <div class="animation-card">
          <strong>JS counter</strong>
          <span class="counter-value">{{ jsCounter }}</span>
          <span class="counter-hint">setInterval 500ms</span>
        </div>
      </div>
    </section>

    <section class="demo-section">
      <h2>More elements to annotate</h2>
      <p>Try clicking this paragraph, the heading above, or the button below.</p>
      <button class="demo-button" type="button">
        Sample Button
      </button>
      <a href="#" class="demo-link">Sample Link</a>
    </section>
  </main>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

code {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  font-size: 0.9em;
}
</style>

<style scoped>
.app {
  max-width: 1080px;
  margin: 0 auto;
  padding: 48px 24px;
}

.hero {
  margin-bottom: 32px;
  text-align: center;
}

.eyebrow {
  margin: 0 0 12px;
  color: #93c5fd;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  line-height: 1.05;
}

.subtitle {
  max-width: 720px;
  margin: 16px auto 0;
  color: #cbd5e1;
  font-size: 1.05rem;
  line-height: 1.7;
}

.demo-section {
  margin-top: 48px;
  padding: 32px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  background: rgba(30, 41, 59, 0.5);
}

.demo-section h2 {
  margin: 0 0 16px;
  font-size: 1.4rem;
}

.demo-section p {
  margin: 0 0 16px;
  color: #cbd5e1;
  line-height: 1.6;
}

.demo-button {
  appearance: none;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  padding: 10px 20px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  margin-right: 12px;
}

.demo-link {
  color: #93c5fd;
  text-decoration: underline;
  font-weight: 500;
}

/* --- Animation demo --- */

@keyframes progressSlide {
  0% { width: 0; }
  100% { width: 100%; }
}

@keyframes pulseDot {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.6); opacity: 1; }
}

.animation-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.animation-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.progress-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  overflow: hidden;
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

.counter-value {
  font-size: 2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #93c5fd;
}

.counter-hint {
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.6);
}
</style>
