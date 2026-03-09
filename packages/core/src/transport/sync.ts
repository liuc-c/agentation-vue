import type { AnnotationV2, Session, SessionWithAnnotations } from "../types/index.ts"

/**
 * Resolves the V2 API base URL from a user-provided endpoint.
 * Ensures all Vue plugin sync traffic goes through `/v2/` routes.
 */
function resolveV2Base(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "")
  return base.endsWith("/v2") ? base : `${base}/v2`
}

export function resolveV2Endpoint(endpoint: string): string {
  return resolveV2Base(endpoint)
}

export async function listSessions(endpoint: string): Promise<Session[]> {
  const response = await fetch(`${resolveV2Base(endpoint)}/sessions`)
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.status}`)
  }
  return response.json()
}

export async function createSession(
  endpoint: string,
  url: string,
  projectId?: string,
): Promise<Session> {
  const response = await fetch(`${resolveV2Base(endpoint)}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, projectId }),
  })
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`)
  }
  return response.json()
}

export async function getSession(
  endpoint: string,
  sessionId: string,
): Promise<SessionWithAnnotations> {
  const response = await fetch(`${resolveV2Base(endpoint)}/sessions/${sessionId}`)
  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.status}`)
  }
  return response.json()
}

export async function syncAnnotation(
  endpoint: string,
  sessionId: string,
  annotation: AnnotationV2,
): Promise<AnnotationV2> {
  const response = await fetch(`${resolveV2Base(endpoint)}/sessions/${sessionId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
  })
  if (!response.ok) {
    throw new Error(`Failed to sync annotation: ${response.status}`)
  }
  return response.json()
}

export async function updateAnnotation(
  endpoint: string,
  annotationId: string,
  data: Partial<AnnotationV2>,
): Promise<AnnotationV2> {
  const response = await fetch(`${resolveV2Base(endpoint)}/annotations/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error(`Failed to update annotation: ${response.status}`)
  }
  return response.json()
}

export async function deleteAnnotation(
  endpoint: string,
  annotationId: string,
): Promise<void> {
  const response = await fetch(`${resolveV2Base(endpoint)}/annotations/${annotationId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(`Failed to delete annotation: ${response.status}`)
  }
}
