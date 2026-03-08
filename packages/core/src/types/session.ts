import type { AnnotationV2 } from "./annotation.js"

export type SessionStatus = "active" | "approved" | "closed"

export interface Session {
  id: string
  url: string
  status: SessionStatus
  createdAt: string
  updatedAt?: string
  projectId?: string
  metadata?: Record<string, unknown>
}

export interface SessionWithAnnotations extends Session {
  annotations: AnnotationV2[]
}

export interface ThreadMessage {
  id: string
  role: "human" | "agent"
  content: string
  timestamp: string
}
