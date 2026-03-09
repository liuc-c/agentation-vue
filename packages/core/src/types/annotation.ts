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

export type AnnotationIntent = "fix" | "change" | "question" | "approve"

export type AnnotationSeverity = "blocking" | "important" | "suggestion"

export type AnnotationStatus = "pending" | "acknowledged" | "resolved" | "dismissed"

export interface AnnotationThreadMessage {
  id: string
  role: "human" | "agent"
  content: string
  timestamp: string | number
}

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
  intent?: AnnotationIntent
  severity?: AnnotationSeverity
  status?: AnnotationStatus
  thread?: AnnotationThreadMessage[]
  sessionId?: string
  createdAt?: string
  updatedAt?: string
  resolvedAt?: string
  resolvedBy?: "human" | "agent"
  authorId?: string
}
