import type { AnnotationV2, OutputDetailLevel } from "../types/index.ts"
import type { ExportExcludeField } from "./exclude-fields.ts"
import type { ExportPageContext } from "./format-markdown.ts"

export interface JsonFormatOptions {
  detailLevel?: OutputDetailLevel
  page?: ExportPageContext
  schemaVersion?: number
  excludeFields?: readonly ExportExcludeField[]
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

type JsonAnnotationMetadata = Record<string, unknown> & {
  project_area?: unknown
  context_hints?: unknown
  elementPath?: unknown
  fullPath?: unknown
  cssClasses?: unknown
  boundingBox?: unknown
  nearbyText?: unknown
  nearbyElements?: unknown
  computedStyles?: unknown
  accessibility?: unknown
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T
}

function formatAnnotation(
  a: AnnotationV2,
  detailLevel: OutputDetailLevel,
  excluded: ReadonlySet<ExportExcludeField>,
): Record<string, unknown> {
  if (detailLevel === "compact") {
    return pruneUndefined({
      elementSelector: a.elementSelector,
      comment: a.comment,
      elementText: excluded.has("selectedText") ? undefined : a.elementText,
    })
  }

  const result: Record<string, unknown> = pruneUndefined({
    id: a.id,
    schemaVersion: a.schemaVersion,
    timestamp: excluded.has("timestamp") ? undefined : a.timestamp,
    url: excluded.has("url") ? undefined : a.url,
    elementSelector: a.elementSelector,
    elementText: excluded.has("selectedText") ? undefined : a.elementText,
    comment: a.comment,
  })

  const source = pruneUndefined({
    framework: excluded.has("framework") ? undefined : a.source.framework,
    componentName: excluded.has("component") ? undefined : a.source.componentName,
    componentHierarchy: excluded.has("componentHierarchy") ? undefined : a.source.componentHierarchy,
    file: excluded.has("sourceLocation") ? undefined : a.source.file,
    line: excluded.has("sourceLocation") ? undefined : a.source.line,
    column: excluded.has("sourceLocation") ? undefined : a.source.column,
    resolver: excluded.has("framework") ? undefined : a.source.resolver,
  })

  if (Object.keys(source).length > 0) {
    result.source = source
  }

  if (detailLevel === "detailed" || detailLevel === "forensic") {
    if (a.metadata) {
      const rawMetadata = a.metadata as JsonAnnotationMetadata
      const metadata = pruneUndefined({
        ...rawMetadata,
        project_area: excluded.has("projectArea") ? undefined : rawMetadata.project_area,
        context_hints: excluded.has("contextHints") ? undefined : rawMetadata.context_hints,
        elementPath: excluded.has("elementPath") ? undefined : rawMetadata.elementPath,
        fullPath: excluded.has("fullDomPath") ? undefined : rawMetadata.fullPath,
        cssClasses: excluded.has("cssClasses") ? undefined : rawMetadata.cssClasses,
        boundingBox: excluded.has("position") ? undefined : rawMetadata.boundingBox,
        nearbyText: excluded.has("context") ? undefined : rawMetadata.nearbyText,
        nearbyElements: excluded.has("nearbyElements") ? undefined : rawMetadata.nearbyElements,
        computedStyles: excluded.has("computedStyles") ? undefined : rawMetadata.computedStyles,
        accessibility: excluded.has("accessibility") ? undefined : rawMetadata.accessibility,
      })

      if (Object.keys(metadata).length > 0) {
        result.metadata = metadata
      }
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
  const excluded = new Set(options.excludeFields ?? [])

  return {
    format: "agentation-vue",
    schemaVersion: options.schemaVersion ?? 1,
    detailLevel,
    annotationCount: annotations.length,
    page: pruneUndefined({
      pathname: page.pathname ?? "/",
      viewport: excluded.has("viewport") ? undefined : page.viewport,
      url: excluded.has("url") ? undefined : page.url,
      userAgent: excluded.has("userAgent") ? undefined : page.userAgent,
      timestamp: excluded.has("timestamp") ? undefined : page.timestamp,
      devicePixelRatio: excluded.has("devicePixelRatio") ? undefined : page.devicePixelRatio,
    }),
    annotations: annotations.map((a) => formatAnnotation(a, detailLevel, excluded)),
  }
}
