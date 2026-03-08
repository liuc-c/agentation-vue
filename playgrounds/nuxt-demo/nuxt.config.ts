import agentation from "vite-plugin-agentation-vue"

export default defineNuxtConfig({
  typescript: { strict: true },

  // Register the Vite plugin for virtual module resolution and vue-tracer.
  // The runtime bootstrap is handled by plugins/agentation.client.ts instead
  // of relying on transformIndexHtml (which may not fire for Nuxt's app shell).
  vite: {
    plugins: [agentation()],
  },
})
