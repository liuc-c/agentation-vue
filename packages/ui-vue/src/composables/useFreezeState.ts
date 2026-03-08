import { readonly, ref } from "vue"
import {
  freeze,
  unfreeze,
  originalSetTimeout,
} from "@liuovo/agentation-vue-core/dom/freeze-animations"

// ---------------------------------------------------------------------------
// Freeze state composable — controls page animation freezing
// ---------------------------------------------------------------------------

/**
 * Reactive wrapper around the core freeze-animations module.
 *
 * Exposes a `isFrozen` ref, a `toggleFreeze()` action, and a `cleanup()`
 * function that should be called on unmount to ensure animations are restored.
 *
 * The `originalSetTimeout` re-export lets components schedule work that
 * must fire even while the page is frozen (toolbar entrance, toast timers, etc.).
 */
export interface FreezeState {
  /** Whether page animations are currently frozen. */
  readonly isFrozen: Readonly<ReturnType<typeof ref<boolean>>>
  /** Toggle between frozen and unfrozen. */
  toggleFreeze(): void
  /** Force unfreeze — call on unmount to prevent leaked frozen state. */
  cleanup(): void
}

export { originalSetTimeout }

export function createFreezeState(): FreezeState {
  const isFrozen = ref(false)

  function toggleFreeze(): void {
    if (isFrozen.value) {
      unfreeze()
      isFrozen.value = false
    } else {
      freeze()
      isFrozen.value = true
    }
  }

  function cleanup(): void {
    if (isFrozen.value) {
      unfreeze()
      isFrozen.value = false
    }
  }

  return {
    isFrozen: readonly(isFrozen),
    toggleFreeze,
    cleanup,
  }
}
