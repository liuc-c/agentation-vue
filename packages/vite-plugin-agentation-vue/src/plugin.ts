import type { Plugin } from "vite"
import VueTracer from "vite-plugin-vue-tracer"
import { resolveOptions, type AgentationVueOptions } from "./types.js"
import {
  INIT_SCRIPT_PATH,
  createInitModuleSource,
  createInjectionTag,
  loadVirtualModule,
  resolveVirtualId,
} from "./virtual.js"

// ---------------------------------------------------------------------------
// Terminal logging (ANSI colors + ASCII art)
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const

const PREFIX = `${c.bold}${c.cyan}🛰  agentation${c.reset}`

function printBanner(options: AgentationVueOptions): void {
  const status = options.enabled === false
    ? `${c.bold}${c.yellow}DISABLED${c.reset}`
    : `${c.bold}${c.green}AUTO${c.reset} ${c.dim}(active in serve mode)${c.reset}`

  console.log([
    "",
    `${c.magenta}   ╔═══════════════════════════════╗${c.reset}`,
    `${c.magenta}   ║${c.reset}  ${c.bold}${c.cyan}🛰  agentation-vue${c.reset}            ${c.magenta}║${c.reset}`,
    `${c.magenta}   ║${c.reset}  ${c.dim}vite plugin loaded${c.reset}             ${c.magenta}║${c.reset}`,
    `${c.magenta}   ╚═══════════════════════════════╝${c.reset}`,
    `   ${c.dim}status:${c.reset} ${status}  ✨`,
    "",
  ].join("\n"))
}

function logTerm(message: string, detail?: string): void {
  const d = detail ? ` ${c.dim}(${detail})${c.reset}` : ""
  console.log(`  ${PREFIX} ${c.green}${message}${c.reset}${d}`)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively flattens a Vite plugin value (single plugin, array, or falsy)
 * into a flat array of Plugin objects.
 */
function flattenPlugins(input: unknown): Plugin[] {
  if (Array.isArray(input)) return input.flatMap(flattenPlugins)
  if (input && typeof input === "object" && "name" in input) return [input as Plugin]
  return []
}

/**
 * Wraps a plugin so it only runs during `serve` (dev mode).
 * This ensures the internally-composed VueTracer plugin never activates in build.
 */
function serveOnly(plugin: Plugin): Plugin {
  return {
    ...plugin,
    apply(config, env) {
      if (env.command !== "serve") return false
      const original = plugin.apply
      if (original == null || original === "serve") return true
      if (original === "build") return false
      return original(config, env)
    },
  }
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

/**
 * Creates the main agentation Vite plugin.
 *
 * Responsibilities:
 * - Resolves & serves the `virtual:agentation` module
 * - Injects the runtime bootstrap `<script>` into the HTML
 * - Only active during `vite dev` (command === "serve")
 */
function createShellPlugin(options: AgentationVueOptions): Plugin {
  let resolved = resolveOptions(options, "build")

  return {
    name: "vite-plugin-agentation-vue",
    enforce: "pre",
    apply: "serve",

    configResolved(config) {
      resolved = resolveOptions(options, config.command)
      logTerm(
        resolved.enabled ? "configResolved ✅" : "configResolved ⏸️  plugin disabled",
        `command=${config.command}`,
      )
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!resolved.enabled) return next()

        const url = req.url?.split("?", 1)[0]
        if (url !== INIT_SCRIPT_PATH) return next()

        logTerm("init module served 🚀", INIT_SCRIPT_PATH)
        res.statusCode = 200
        res.setHeader("Content-Type", "text/javascript; charset=utf-8")
        res.setHeader("Cache-Control", "no-cache")
        res.end(createInitModuleSource(resolved))
      })
    },

    resolveId(id) {
      if (!resolved.enabled) return
      return resolveVirtualId(id)
    },

    load(id) {
      if (!resolved.enabled) return
      return loadVirtualModule(id, resolved)
    },

    transformIndexHtml() {
      if (!resolved.enabled) return
      logTerm("transformIndexHtml 🧩", "injecting runtime <script src> into HTML")
      return [createInjectionTag()]
    },
  }
}

/**
 * Agentation-Vue plugin factory.
 *
 * Returns an array of Vite plugins:
 * 1. The agentation shell plugin (virtual module + runtime injection)
 * 2. The `vite-plugin-vue-tracer` plugin (source position recording)
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import vue from '@vitejs/plugin-vue'
 * import agentation from 'vite-plugin-agentation-vue'
 *
 * export default defineConfig({
 *   plugins: [vue(), agentation()]
 * })
 * ```
 *
 * **Important:** `agentation()` must be registered after `vue()` so that
 * tracer transforms run after Vue SFC compilation.
 */
export function agentation(options: AgentationVueOptions = {}): Plugin[] {
  printBanner(options)

  const shell = createShellPlugin(options)

  // When explicitly disabled, return only the shell (which is a no-op)
  if (options.enabled === false) return [shell]

  // Compose vue-tracer plugins, restricting them to dev mode only
  const tracerPlugins = flattenPlugins(VueTracer()).map(serveOnly)

  return [shell, ...tracerPlugins]
}

/** @deprecated Use {@link agentation} instead */
export const agentationVue = agentation

export default agentation
