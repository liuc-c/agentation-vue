import type { SourceLocation } from "@liuovo/agentation-vue-core"
import type { ElementTraceInfo } from "vite-plugin-vue-tracer/client/record"

/**
 * Maps a vue-tracer `ElementTraceInfo` to the internal `SourceLocation` type.
 *
 * Returns `null` when the trace info lacks the minimum required data (file path).
 */
export function mapTraceToSourceLocation(trace: ElementTraceInfo): SourceLocation | null {
  const [source, line, column] = trace.pos
  if (!source) return null

  const componentName = extractComponentName(trace)
  const hierarchy = buildComponentHierarchy(trace)

  return {
    framework: "vue",
    componentName,
    componentHierarchy: hierarchy || undefined,
    file: source,
    line,
    column,
    resolver: "vue-tracer",
  }
}

/**
 * Extracts the component display name from a trace entry.
 *
 * Walks the vnode tree to find the nearest component boundary.
 * Falls back to the file basename when no component name is available.
 */
function extractComponentName(trace: ElementTraceInfo): string {
  const vnode = trace.vnode
  if (vnode) {
    const type = vnode.type as Record<string, unknown> | undefined
    if (type) {
      if (typeof type === "object" && typeof type.name === "string" && type.name) {
        return type.name
      }
      if (typeof type === "object" && typeof type.__name === "string" && type.__name) {
        return type.__name
      }
    }
  }

  // Fallback: derive name from file path
  const [source] = trace.pos
  if (source) {
    const segments = source.split("/")
    const filename = segments[segments.length - 1] ?? source
    return filename.replace(/\.\w+$/, "")
  }

  return "Unknown"
}

/**
 * Builds a component hierarchy string by walking parent traces.
 *
 * Produces a string like `<App> <Layout> <Button>`.
 * Caps at 10 levels to avoid infinite loops in edge cases.
 */
function buildComponentHierarchy(trace: ElementTraceInfo): string | null {
  const names: string[] = []
  let current: ElementTraceInfo | undefined = trace
  const maxDepth = 10

  for (let depth = 0; current && depth < maxDepth; depth++) {
    const name = extractComponentNameFromTrace(current)
    if (name && (names.length === 0 || names[names.length - 1] !== name)) {
      names.push(name)
    }
    current = current.getParent()
  }

  if (names.length <= 1) return null
  return names.reverse().map((n) => `<${n}>`).join(" ")
}

function extractComponentNameFromTrace(trace: ElementTraceInfo): string | null {
  const vnode = trace.vnode
  if (!vnode) return null

  const type = vnode.type as Record<string, unknown> | undefined
  if (!type || typeof type !== "object") return null

  if (typeof type.name === "string" && type.name) return type.name
  if (typeof type.__name === "string" && type.__name) return type.__name

  return null
}
