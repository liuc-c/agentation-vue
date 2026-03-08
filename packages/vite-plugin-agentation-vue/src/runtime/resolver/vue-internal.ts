import type { SourceLocation } from "@liuovo/agentation-vue-core"
import type { ComponentInternalInstance, VNode } from "vue"

/**
 * Fallback resolver using Vue 3 internal properties on DOM elements.
 *
 * Used when vue-tracer data is not available (e.g. tracer plugin not loaded,
 * or element was rendered before tracer initialized).
 *
 * Walks up from the element looking for `__vueParentComponent` or `__vnode`
 * to extract component file information.
 */
export function resolveFromVueInternals(el: HTMLElement): SourceLocation | null {
  const instance = findComponentInstance(el)
  if (!instance) return null

  // Walk up the component tree to find the first instance with file metadata
  const resolved = findInstanceWithFile(instance)
  if (!resolved) return null

  const { instance: fileInstance, file } = resolved
  const type = fileInstance.type as Record<string, unknown>
  const componentName = extractName(type) ?? deriveNameFromFile(file)

  return {
    framework: "vue",
    componentName,
    componentHierarchy: buildHierarchyFromInstance(fileInstance) || undefined,
    file,
    line: undefined,
    column: undefined,
    resolver: "vue-internal",
  }
}

interface VueElement extends HTMLElement {
  __vueParentComponent?: ComponentInternalInstance
  __vnode?: VNode
}

function findComponentInstance(el: HTMLElement): ComponentInternalInstance | null {
  let current: HTMLElement | null = el

  while (current) {
    const vueEl = current as VueElement

    if (vueEl.__vueParentComponent) {
      return vueEl.__vueParentComponent
    }

    if (vueEl.__vnode) {
      const vnode = vueEl.__vnode
      const type = vnode.type as Record<string, unknown> | undefined
      if (type && typeof type === "object" && extractFile(type)) {
        return { type, parent: null } as unknown as ComponentInternalInstance
      }
    }

    current = current.parentElement
  }

  return null
}

function findInstanceWithFile(
  instance: ComponentInternalInstance,
): { instance: ComponentInternalInstance; file: string } | null {
  let current: ComponentInternalInstance | null = instance
  const maxDepth = 20

  for (let depth = 0; current && depth < maxDepth; depth++) {
    const type = current.type as Record<string, unknown>
    const file = extractFile(type)
    if (file) return { instance: current, file }
    current = current.parent
  }

  return null
}

function extractFile(type: Record<string, unknown>): string | null {
  if (typeof type.__file === "string" && type.__file) return type.__file
  if (typeof type.__filePath === "string" && type.__filePath) return type.__filePath
  return null
}

function extractName(type: Record<string, unknown>): string | null {
  if (typeof type.name === "string" && type.name) return type.name
  if (typeof type.__name === "string" && type.__name) return type.__name
  return null
}

function deriveNameFromFile(file: string): string {
  const segments = file.split("/")
  const filename = segments[segments.length - 1] ?? file
  return filename.replace(/\.\w+$/, "")
}

function buildHierarchyFromInstance(instance: ComponentInternalInstance): string | null {
  const names: string[] = []
  let current: ComponentInternalInstance | null = instance
  const maxDepth = 10

  for (let depth = 0; current && depth < maxDepth; depth++) {
    const type = current.type as Record<string, unknown>
    const name = extractName(type)
    if (name) names.push(name)
    current = current.parent
  }

  if (names.length <= 1) return null
  return names.reverse().map((n) => `<${n}>`).join(" ")
}
