import { existsSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { normalizePath, type HtmlTagDescriptor } from "vite"
import type { ResolvedAgentationVueOptions } from "./types.ts"

export const VIRTUAL_MODULE_ID = "virtual:agentation"
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_MODULE_ID}`

/** URL path the dev-server middleware serves the init module at. */
export const INIT_SCRIPT_PATH = "/@agentation-vue/init.js"

// ---------------------------------------------------------------------------
// Terminal logging
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const

const PREFIX = `${c.bold}${c.magenta}🧩 agentation:virtual${c.reset}`

function logVirtual(message: string, detail?: string): void {
  const d = detail ? ` ${c.dim}${detail}${c.reset}` : ""
  console.log(`  ${PREFIX} ${c.cyan}${message}${c.reset}${d}`)
}

// ---------------------------------------------------------------------------
// Runtime entry resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the `/@fs/…` path to the runtime entry file.
 * Uses the source runtime during workspace development and the built runtime
 * from published `dist/` output when loaded from an installed package.
 */
export function resolveRuntimeEntryFilePath(
  thisDir = dirname(fileURLToPath(import.meta.url)),
  fileExists: (path: string) => boolean = existsSync,
): string {
  const isSourceModule = basename(thisDir) === "src"
  const candidates = isSourceModule
    ? [
        resolve(thisDir, "runtime/entry.ts"),
        resolve(thisDir, "../dist/runtime/entry.js"),
      ]
    : [
        resolve(thisDir, "runtime/entry.js"),
        resolve(thisDir, "../src/runtime/entry.ts"),
      ]

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export function resolveRuntimeEntryPath(): string {
  const entryFile = resolveRuntimeEntryFilePath()
  const normalized = normalizePath(entryFile)
  return normalized.startsWith("/")
    ? `/@fs${normalized}`
    : `/@fs/${normalized}`
}

/**
 * Generates the init module source that imports and boots the runtime.
 * Shared by both the dev-server middleware and the virtual module loader.
 */
export function createInitModuleSource(options: ResolvedAgentationVueOptions): string {
  const entryPath = resolveRuntimeEntryPath()
  logVirtual("runtime entry resolved 📦", entryPath)

  return [
    `import { runAgentationRuntime } from ${JSON.stringify(entryPath)};`,
    `runAgentationRuntime(${JSON.stringify(options)});`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Virtual module hooks (resolveId / load)
// ---------------------------------------------------------------------------

/**
 * Resolves the virtual module ID.
 * Returns the resolved ID when matched, `undefined` otherwise.
 */
export function resolveVirtualId(id: string): string | undefined {
  if (id === VIRTUAL_MODULE_ID) {
    logVirtual("resolveId matched ✅", id)
    return RESOLVED_VIRTUAL_ID
  }
}

/**
 * Loads the virtual module content — a tiny script that imports
 * and executes the runtime entry with the resolved plugin options.
 *
 * The runtime entry is referenced via its source path so that Vite
 * serves it through its normal module pipeline (TypeScript transform, HMR).
 */
export function loadVirtualModule(
  id: string,
  options: ResolvedAgentationVueOptions,
): string | undefined {
  if (id !== RESOLVED_VIRTUAL_ID) return

  logVirtual("loadVirtualModule hit ✅", id)
  return createInitModuleSource(options)
}

// ---------------------------------------------------------------------------
// HTML injection
// ---------------------------------------------------------------------------

/**
 * Creates an HTML tag descriptor that loads the init module
 * as a `<script type="module" src="...">` in the document body.
 *
 * The src points to {@link INIT_SCRIPT_PATH}, which is served by
 * the `configureServer` middleware in the shell plugin.
 */
export function createInjectionTag(): HtmlTagDescriptor {
  return {
    tag: "script",
    attrs: { type: "module", src: INIT_SCRIPT_PATH },
    injectTo: "body",
  }
}
