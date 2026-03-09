import type { SourceLocation } from "@liuovo/agentation-vue-core"
import type { ElementTraceInfo } from "vite-plugin-vue-tracer/client/record"
import { mapTraceToSourceLocation } from "./tracer-adapter.ts"
import { resolveFromVueInternals } from "./vue-internal.ts"

type FindTraceFn = (el?: Element | null) => ElementTraceInfo | undefined

/**
 * Holder for the lazily-bound vue-tracer lookup function.
 *
 * At dev runtime, the Vite plugin ensures `vite-plugin-vue-tracer/client/record`
 * is loaded before any user interaction. The runtime bootstrap calls
 * `bindTracer()` to wire up the reference once tracer is ready.
 */
let _findTrace: FindTraceFn | null = null

/**
 * Bind the vue-tracer `findTraceFromElement` function.
 *
 * Called once by the runtime bootstrap after importing the tracer client module.
 */
export function bindTracer(fn: FindTraceFn): void {
  _findTrace = fn
}

/**
 * Unified entry point for resolving an HTML element to its Vue source location.
 *
 * Resolution order:
 * 1. vue-tracer headless API (`findTraceFromElement`) — provides file, line, column
 * 2. Vue internals fallback (`__vnode` / `__vueParentComponent`) — provides file only
 *
 * Returns `null` when neither strategy can identify the source.
 */
export function resolveElementSource(el: HTMLElement): SourceLocation | null {
  // Strategy 1: vue-tracer (preferred — includes precise line/column)
  if (_findTrace) {
    try {
      const trace = _findTrace(el)
      if (trace) {
        const result = mapTraceToSourceLocation(trace)
        if (result) return result
      }
    } catch {
      // tracer threw — fall through to next strategy
    }
  }

  // Strategy 2: Vue internals fallback (file-level only, no line/column)
  return resolveFromVueInternals(el)
}
