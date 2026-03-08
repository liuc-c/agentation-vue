/**
 * vite-plugin-agentation-vue
 *
 * One-line Vite plugin for Vue 3 page annotation in dev mode.
 * Internally composes vite-plugin-vue-tracer for source position recording.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import vue from '@vitejs/plugin-vue'
 * import agentation from 'vite-plugin-agentation-vue'
 *
 * export default defineConfig({
 *   plugins: [vue(), agentation()]
 * })
 * ```
 */

// Plugin factory (primary export)
export { agentation, agentationVue } from "./plugin.js"
export { agentation as default } from "./plugin.js"

// Plugin option types
export type {
  AgentationVueOptions,
  AgentationVuePluginOptions,
  AgentationVueSyncOptions,
  ResolvedAgentationVueOptions,
} from "./types.js"

// Resolver API — usable independently of the full plugin
export { resolveElementSource, bindTracer } from "./runtime/resolver/index.js"
export type { SourceLocation, FrameworkKind } from "@liuovo/agentation-vue-core"
