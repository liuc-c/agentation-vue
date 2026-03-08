import type { AnnotationV2, OutputDetailLevel } from "../types/index.js"

export interface ExportViewport {
  width: number
  height: number
}

export interface ExportPageContext {
  pathname?: string
  viewport?: ExportViewport
  url?: string
  userAgent?: string
  timestamp?: string
  devicePixelRatio?: number
}

export interface MarkdownFormatOptions {
  detailLevel?: OutputDetailLevel
  page?: ExportPageContext
}

/**
 * Well-known keys in `AnnotationV2.metadata` that the formatter can render.
 *
 * Phase 4 (UI) populates these when creating annotations via element-identification.
 * The formatter outputs them when present, gracefully skips when absent.
 */
interface AnnotationMetadata {
  elementPath?: string
  fullPath?: string
  cssClasses?: string
  boundingBox?: { x: number; y: number; width: number; height: number }
  nearbyText?: string
  nearbyElements?: string
  computedStyles?: string
  accessibility?: string
  isMultiSelect?: boolean
  isFixed?: boolean
}

function fmtViewport(viewport?: ExportViewport): string {
  if (!viewport) return "unknown"
  return `${viewport.width}\u00D7${viewport.height}`
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

function meta(a: AnnotationV2): AnnotationMetadata {
  return (a.metadata ?? {}) as AnnotationMetadata
}

/**
 * Generates a Markdown report from an array of AnnotationV2 entries.
 *
 * Pure function — does not read `window` or any global state.
 * Page context (viewport, URL, etc.) must be provided via `options.page`.
 */
export function formatToMarkdown(
  annotations: readonly AnnotationV2[],
  options: MarkdownFormatOptions = {},
): string {
  if (annotations.length === 0) return ""

  const detailLevel = options.detailLevel ?? "standard"
  const page = options.page ?? {}
  const pathname = page.pathname ?? "/"
  const viewport = fmtViewport(page.viewport)

  let output = `## Page Feedback: ${pathname}\n`

  if (detailLevel === "forensic") {
    output += `\n**Environment:**\n`
    output += `- Viewport: ${viewport}\n`
    if (page.url) output += `- URL: ${page.url}\n`
    if (page.userAgent) output += `- User Agent: ${page.userAgent}\n`
    if (page.timestamp) output += `- Timestamp: ${page.timestamp}\n`
    if (page.devicePixelRatio !== undefined) {
      output += `- Device Pixel Ratio: ${page.devicePixelRatio}\n`
    }
    output += `\n---\n`
  } else if (detailLevel !== "compact") {
    output += `**Viewport:** ${viewport}\n`
  }
  output += "\n"

  annotations.forEach((a, i) => {
    const num = i + 1
    const src = a.source
    const m = meta(a)

    // ── compact ──
    if (detailLevel === "compact") {
      output += `${num}. **${a.elementSelector}**: ${a.comment}`
      if (a.elementText) {
        output += ` (re: "${truncate(a.elementText, 30)}")`
      }
      output += "\n"
      return
    }

    // ── forensic ──
    if (detailLevel === "forensic") {
      output += `### ${num}. ${a.elementSelector}\n`
      if (m.isMultiSelect && m.fullPath) {
        output += `*Forensic data shown for first element of selection*\n`
      }
      if (src.file) {
        const loc = src.line != null
          ? (src.column != null ? `${src.file}:${src.line}:${src.column}` : `${src.file}:${src.line}`)
          : src.file
        output += `**Source:** ${loc}\n`
      }
      if (src.componentName) output += `**Component:** ${src.componentName}\n`
      if (src.componentHierarchy) output += `**Component hierarchy:** ${src.componentHierarchy}\n`
      output += `**Framework:** ${src.framework} (resolver: ${src.resolver})\n`
      if (m.elementPath) output += `**Element path:** ${m.elementPath}\n`
      if (m.fullPath) output += `**Full DOM path:** ${m.fullPath}\n`
      if (m.cssClasses) output += `**CSS Classes:** ${m.cssClasses}\n`
      if (m.boundingBox) {
        const bb = m.boundingBox
        output += `**Position:** x:${Math.round(bb.x)}, y:${Math.round(bb.y)} (${Math.round(bb.width)}\u00D7${Math.round(bb.height)}px)\n`
      }
      if (a.elementText) output += `**Selected text:** "${a.elementText}"\n`
      if (m.nearbyText && !a.elementText) {
        output += `**Context:** ${truncate(m.nearbyText, 100)}\n`
      }
      if (m.computedStyles) output += `**Computed Styles:** ${m.computedStyles}\n`
      if (m.accessibility) output += `**Accessibility:** ${m.accessibility}\n`
      if (m.nearbyElements) output += `**Nearby Elements:** ${m.nearbyElements}\n`
      output += `**Feedback:** ${a.comment}\n\n`
      return
    }

    // ── standard / detailed ──
    output += `### ${num}. ${a.elementSelector}\n`

    if (src.file) {
      const loc = src.line != null ? `${src.file}:${src.line}` : src.file
      output += `**Source:** ${loc}\n`
    }
    if (src.componentName) output += `**Component:** ${src.componentName}\n`
    if (m.elementPath) output += `**Location:** ${m.elementPath}\n`

    if (detailLevel === "detailed") {
      if (src.componentHierarchy) {
        output += `**Component hierarchy:** ${src.componentHierarchy}\n`
      }
      output += `**Framework:** ${src.framework} (resolver: ${src.resolver})\n`
      if (m.cssClasses) output += `**Classes:** ${m.cssClasses}\n`
      if (m.boundingBox) {
        const bb = m.boundingBox
        output += `**Position:** ${Math.round(bb.x)}px, ${Math.round(bb.y)}px (${Math.round(bb.width)}\u00D7${Math.round(bb.height)}px)\n`
      }
    }

    if (a.elementText) {
      output += `**Selected text:** "${a.elementText}"\n`
    }

    if (detailLevel === "detailed" && m.nearbyText && !a.elementText) {
      output += `**Context:** ${truncate(m.nearbyText, 100)}\n`
    }

    output += `**Feedback:** ${a.comment}\n\n`
  })

  return output.trim()
}
