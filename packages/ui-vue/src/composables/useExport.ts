import { ref } from "vue"
import { originalSetTimeout } from "./useFreezeState.js"
import type { AnnotationsStore } from "./useAnnotationsStore.js"
import type { SettingsState } from "./useSettings.js"

// ---------------------------------------------------------------------------
// Export composable — clipboard write + download fallback
// ---------------------------------------------------------------------------

export type ExportFormat = "json" | "markdown"

export interface ExportActions {
  /** Currently active copy feedback, or null. */
  readonly copyFeedback: ExportFormat | null
  /** Export annotations as JSON to clipboard. */
  exportJSON(): Promise<void>
  /** Export annotations as Markdown to clipboard. */
  exportMarkdown(): Promise<void>
}

/**
 * Creates export actions bound to a store and settings state.
 * Handles clipboard write with "Copied!" feedback and download fallback.
 */
export function createExportActions(
  store: AnnotationsStore,
  _settings: SettingsState,
): ExportActions {
  const copyFeedback = ref<ExportFormat | null>(null)

  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      downloadFallback(text, "agentation-export.txt")
      return false
    }
  }

  function flash(kind: ExportFormat): void {
    copyFeedback.value = kind
    originalSetTimeout(() => {
      if (copyFeedback.value === kind) copyFeedback.value = null
    }, 1400)
  }

  function downloadFallback(content: string, filename: string): void {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportJSON(): Promise<void> {
    const payload = JSON.stringify(store.exportJSON(), null, 2)
    if (await writeClipboard(payload)) flash("json")
  }

  async function exportMarkdown(): Promise<void> {
    const payload = store.exportMarkdown()
    if (await writeClipboard(payload)) flash("markdown")
  }

  return {
    get copyFeedback() { return copyFeedback.value },
    exportJSON,
    exportMarkdown,
  }
}
