function writeTextWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false
  }

  const container = document.body ?? document.documentElement
  if (!container) {
    return false
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.setAttribute("aria-hidden", "true")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "-9999px"
  textarea.style.opacity = "0"

  const selection = document.getSelection()
  const previousRange = selection && selection.rangeCount > 0
    ? selection.getRangeAt(0)
    : null
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  container.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
    if (selection) {
      selection.removeAllRanges()
      if (previousRange) {
        selection.addRange(previousRange)
      }
    }
    activeElement?.focus()
  }
}

export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy sync copy path.
    }
  }

  return writeTextWithExecCommand(text)
}
