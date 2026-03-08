import { inject, type InjectionKey } from "vue"

/**
 * Type-safe inject that throws if the value is missing.
 * Use in components that require a provided dependency.
 */
export function injectStrict<T>(key: InjectionKey<T>, name: string): T {
  const value = inject(key)
  if (value === undefined) {
    throw new Error(`[agentation] Missing required injection: ${name}`)
  }
  return value
}
