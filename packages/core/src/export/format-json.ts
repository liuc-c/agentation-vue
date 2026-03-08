import type { AnnotationV2, OutputDetailLevel } from "../types/index.js"
import type { ExportPageContext } from "./format-markdown.js"

export interface JsonFormatOptions {
  detailLevel?: OutputDetailLevel
  page?: ExportPageContext
  schemaVersion?: number
}

export interface AnnotationExportDocument {
  format: "agentation-vue"
  schemaVersion: number
  detailLevel: OutputDetailLevel
  annotationCount: number
  page: {
    pathname: string
    viewport?: ExportPageContext["viewport"]
    url?: string
    userAgent?: string
    timestamp?: string
    devicePixelRatio?: number
  }
  annotations: Array<Record<string, unknown>>
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T
}

function formatAnnotation(
  a: AnnotationV2,
  detailLevel: OutputDetailLevel,
): Record<string, unknown> {
  if (detailLevel === "compact") {
    return pruneUndefined({
      elementSelector: a.elementSelector,
      comment: a.comment,
      elementText: a.elementText,
    })
  }

  const result: Record<string, unknown> = pruneUndefined({
    id: a.id,
    schemaVersion: a.schemaVersion,
    timestamp: a.timestamp,
    url: a.url,
    elementSelector: a.elementSelector,
    elementText: a.elementText,
    comment: a.comment,
    source: pruneUndefined({ ...a.source }),
  })

  if (detailLevel === "detailed" || detailLevel === "forensic") {
    if (a.metadata) {
      result.metadata = a.metadata
    }
  }

  return result
}

/**
 * Generates a structured JSON export document from AnnotationV2 entries.
 *
 * Pure function — does not read `window` or any global state.
 * Page context must be provided via `options.page`.
 */
export function formatToJSON(
  annotations: readonly AnnotationV2[],
  options: JsonFormatOptions = {},
): AnnotationExportDocument {
  const detailLevel = options.detailLevel ?? "standard"
  const page = options.page ?? {}

  return {
    format: "agentation-vue",
    schemaVersion: options.schemaVersion ?? 1,
    detailLevel,
    annotationCount: annotations.length,
    page: pruneUndefined({
      pathname: page.pathname ?? "/",
      viewport: page.viewport,
      url: page.url,
      userAgent: page.userAgent,
      timestamp: page.timestamp,
      devicePixelRatio: page.devicePixelRatio,
    }),
    annotations: annotations.map((a) => formatAnnotation(a, detailLevel)),
  }
}
