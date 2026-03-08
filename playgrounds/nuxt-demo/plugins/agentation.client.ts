/**
 * Client-only Nuxt plugin that bootstraps the agentation runtime.
 *
 * The `.client.ts` suffix ensures this only runs in the browser (no SSR).
 * Uses `onNuxtReady` to defer execution until after Nuxt's hydration is
 * complete, avoiding conflicts with the SSR reconciliation phase.
 */
export default defineNuxtPlugin(() => {
  onNuxtReady(async () => {
    await import("virtual:agentation")
  })
})
