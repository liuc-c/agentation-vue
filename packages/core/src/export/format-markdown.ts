import type { AnnotationV2, OutputDetailLevel } from "../types/index.ts"
import type { ExportExcludeField } from "./exclude-fields.ts"

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
  excludeFields?: readonly ExportExcludeField[]
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
  project_area?: string
  context_hints?: string[]
}

function isExcluded(excluded: ReadonlySet<ExportExcludeField>, field: ExportExcludeField): boolean {
  return excluded.has(field)
}

function fmtViewport(viewport?: ExportViewport): string {
  if (!viewport) return "unknown"
  return `${viewport.width}\u00D7${viewport.height}`
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

function fmtSourceLocation(source: AnnotationV2["source"], includeColumn = true): string {
  if (source.line == null) return source.file
  if (includeColumn && source.column != null) return `${source.file}:${source.line}:${source.column}`
  return `${source.file}:${source.line}`
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
  const excluded = new Set(options.excludeFields ?? [])
  const pathname = page.pathname ?? "/"
  const viewport = fmtViewport(page.viewport)

  let output = `## Page Feedback: ${pathname}\n`

  if (detailLevel === "forensic") {
    const environmentLines: string[] = []
    if (!isExcluded(excluded, "viewport")) environmentLines.push(`- Viewport: ${viewport}`)
    if (page.url && !isExcluded(excluded, "url")) environmentLines.push(`- URL: ${page.url}`)
    if (page.userAgent && !isExcluded(excluded, "userAgent")) environmentLines.push(`- User Agent: ${page.userAgent}`)
    if (page.timestamp && !isExcluded(excluded, "timestamp")) environmentLines.push(`- Timestamp: ${page.timestamp}`)
    if (page.devicePixelRatio !== undefined && !isExcluded(excluded, "devicePixelRatio")) {
      environmentLines.push(`- Device Pixel Ratio: ${page.devicePixelRatio}`)
    }
    if (environmentLines.length > 0) {
      output += `\n**Environment:**\n`
      output += `${environmentLines.join("\n")}\n`
      output += `\n---\n`
    }
  } else if (detailLevel !== "compact" && !isExcluded(excluded, "viewport")) {
    output += `**Viewport:** ${viewport}\n`
  }
  output += "\n"

  annotations.forEach((a, i) => {
    const num = i + 1
    const src = a.source
    const m = meta(a)
    const showSelectedText = !!a.elementText && !isExcluded(excluded, "selectedText")
    const selectedText = showSelectedText ? a.elementText : undefined

    // ── compact ──
    if (detailLevel === "compact") {
      output += `${num}. **${a.elementSelector}**`
      if (src.file && !isExcluded(excluded, "sourceLocation")) {
        output += ` (${fmtSourceLocation(src)})`
      }
      output += `: ${a.comment}`
      if (selectedText) {
        output += ` (re: "${truncate(selectedText, 30)}")`
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
      if (m.project_area && !isExcluded(excluded, "projectArea")) output += `**Project area:** ${m.project_area}\n`
      if (m.context_hints?.length && !isExcluded(excluded, "contextHints")) output += `**Context hints:** ${m.context_hints.join(" | ")}\n`
      if (src.file && !isExcluded(excluded, "sourceLocation")) {
        output += `**Source:** ${fmtSourceLocation(src)}\n`
      }
      if (src.componentName && !isExcluded(excluded, "component")) output += `**Component:** ${src.componentName}\n`
      if (src.componentHierarchy && !isExcluded(excluded, "componentHierarchy")) output += `**Component hierarchy:** ${src.componentHierarchy}\n`
      if (!isExcluded(excluded, "framework")) output += `**Framework:** ${src.framework} (resolver: ${src.resolver})\n`
      if (m.elementPath && !isExcluded(excluded, "elementPath")) output += `**Element path:** ${m.elementPath}\n`
      if (m.fullPath && !isExcluded(excluded, "fullDomPath")) output += `**Full DOM path:** ${m.fullPath}\n`
      if (m.cssClasses && !isExcluded(excluded, "cssClasses")) output += `**CSS Classes:** ${m.cssClasses}\n`
      if (m.boundingBox && !isExcluded(excluded, "position")) {
        const bb = m.boundingBox
        output += `**Position:** x:${Math.round(bb.x)}, y:${Math.round(bb.y)} (${Math.round(bb.width)}\u00D7${Math.round(bb.height)}px)\n`
      }
      if (selectedText) output += `**Selected text:** "${selectedText}"\n`
      if (m.nearbyText && !selectedText && !isExcluded(excluded, "context")) {
        output += `**Context:** ${truncate(m.nearbyText, 100)}\n`
      }
      if (m.computedStyles && !isExcluded(excluded, "computedStyles")) output += `**Computed Styles:** ${m.computedStyles}\n`
      if (m.accessibility && !isExcluded(excluded, "accessibility")) output += `**Accessibility:** ${m.accessibility}\n`
      if (m.nearbyElements && !isExcluded(excluded, "nearbyElements")) output += `**Nearby Elements:** ${m.nearbyElements}\n`
      output += `**Feedback:** ${a.comment}\n\n`
      return
    }

    // ── standard / detailed ──
    output += `### ${num}. ${a.elementSelector}\n`

    if (m.project_area && !isExcluded(excluded, "projectArea")) output += `**Project area:** ${m.project_area}\n`
    if (src.file && !isExcluded(excluded, "sourceLocation")) {
      output += `**Source:** ${fmtSourceLocation(src, false)}\n`
    }
    if (src.componentName && !isExcluded(excluded, "component")) output += `**Component:** ${src.componentName}\n`
    if (m.elementPath && !isExcluded(excluded, "elementPath")) output += `**Location:** ${m.elementPath}\n`

    if (detailLevel === "detailed") {
      if (src.componentHierarchy && !isExcluded(excluded, "componentHierarchy")) {
        output += `**Component hierarchy:** ${src.componentHierarchy}\n`
      }
      if (!isExcluded(excluded, "framework")) output += `**Framework:** ${src.framework} (resolver: ${src.resolver})\n`
      if (m.cssClasses && !isExcluded(excluded, "cssClasses")) output += `**Classes:** ${m.cssClasses}\n`
      if (m.boundingBox && !isExcluded(excluded, "position")) {
        const bb = m.boundingBox
        output += `**Position:** ${Math.round(bb.x)}px, ${Math.round(bb.y)}px (${Math.round(bb.width)}\u00D7${Math.round(bb.height)}px)\n`
      }
      if (m.context_hints?.length && !isExcluded(excluded, "contextHints")) {
        output += `**Context hints:** ${m.context_hints.join(" | ")}\n`
      }
    }

    if (selectedText) {
      output += `**Selected text:** "${selectedText}"\n`
    }

    if (detailLevel === "detailed" && m.nearbyText && !selectedText && !isExcluded(excluded, "context")) {
      output += `**Context:** ${truncate(m.nearbyText, 100)}\n`
    }

    output += `**Feedback:** ${a.comment}\n\n`
  })

  return output.trim()
}
