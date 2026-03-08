export type FrameworkKind = "vue" | "react" | "unknown"

export interface SourceLocation {
  framework: FrameworkKind
  componentName: string
  componentHierarchy?: string
  file: string
  line?: number
  column?: number
  resolver: string
}

export type OutputDetailLevel = "compact" | "standard" | "detailed" | "forensic"

export interface AnnotationV2 {
  id: string
  schemaVersion: 1
  timestamp: string
  url: string
  elementSelector: string
  elementText?: string
  comment: string
  source: SourceLocation
  metadata?: Record<string, unknown>
}
