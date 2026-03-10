/**
 * Store module - provides persistence for sessions and annotations.
 *
 * By default uses SQLite (~/.agentation/store.db).
 * Falls back to in-memory storage if SQLite fails to initialize.
 *
 * Usage:
 *   import { store } from './store.js';
 *   const session = store.createSession('http://localhost:3000');
 */

import type {
  AFSStore,
  AFSEvent,
  Session,
  SessionStatus,
  SessionWithAnnotations,
  SessionWithAnnotationsV2,
  Annotation,
  AnnotationClaim,
  AnnotationClaimOwner,
  AnnotationV2,
  AnnotationStatus,
  ThreadMessage,
} from "../types.js";
import { eventBus } from "./events.js";

// -----------------------------------------------------------------------------
// Store Singleton
// -----------------------------------------------------------------------------

let _store: AFSStore | null = null;

/**
 * Get the store instance. Lazily initializes on first access.
 */
export function getStore(): AFSStore {
  if (!_store) {
    _store = initializeStore();
  }
  return _store;
}

/**
 * Initialize the store. Tries SQLite first, falls back to in-memory.
 */
function initializeStore(): AFSStore {
  // Check if we should use in-memory only
  if (process.env.AGENTATION_STORE === "memory") {
    process.stderr.write("[Store] Using in-memory store (AGENTATION_STORE=memory)\n");
    return createMemoryStore();
  }

  try {
    // Dynamic import to avoid issues if better-sqlite3 isn't available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSQLiteStore } = require("./sqlite.js");
    const store = createSQLiteStore();
    process.stderr.write("[Store] Using SQLite store (~/.agentation/store.db)\n");
    return store;
  } catch (err) {
    console.warn("[Store] SQLite unavailable, falling back to in-memory:", (err as Error).message);
    return createMemoryStore();
  }
}

// -----------------------------------------------------------------------------
// In-Memory Store (fallback)
// -----------------------------------------------------------------------------

function clearProcessingState(annotation: {
  processingByAgentId?: string
  processingByRunId?: string
  processingStartedAt?: string
  processingExpiresAt?: string
}): void {
  delete annotation.processingByAgentId
  delete annotation.processingByRunId
  delete annotation.processingStartedAt
  delete annotation.processingExpiresAt
}

function applyResolvedState(
  annotation: { resolvedAt?: string; resolvedBy?: "human" | "agent" },
  status: AnnotationStatus,
  resolvedBy?: "human" | "agent",
): void {
  if (status === "resolved" || status === "dismissed") {
    annotation.resolvedAt = new Date().toISOString()
    annotation.resolvedBy = resolvedBy || "agent"
    return
  }

  delete annotation.resolvedAt
  delete annotation.resolvedBy
}

function isAnnotationProcessingExpired(annotation: AnnotationV2, nowIso: string): boolean {
  return (annotation.status ?? "pending") === "processing"
    && typeof annotation.processingExpiresAt === "string"
    && annotation.processingExpiresAt <= nowIso
}

function matchesClaimOwner(annotation: AnnotationV2, owner?: AnnotationClaimOwner): boolean {
  if (!owner || (!owner.agentId && !owner.runId)) {
    return true
  }

  if (owner.agentId && annotation.processingByAgentId !== owner.agentId) {
    return false
  }

  if (owner.runId && annotation.processingByRunId !== owner.runId) {
    return false
  }

  return true
}

function createMemoryStore(): AFSStore {
  const sessions = new Map<string, Session>();
  const annotations = new Map<string, Annotation>();
  const annotationsV2 = new Map<string, AnnotationV2>();
  const events: AFSEvent[] = [];

  function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  return {
    createSession(url: string, projectId?: string, metadata?: Record<string, unknown>): Session {
      const session: Session = {
        id: generateId(),
        url,
        status: "active",
        createdAt: new Date().toISOString(),
        projectId,
        metadata,
      };
      sessions.set(session.id, session);

      const event = eventBus.emit("session.created", session.id, session);
      events.push(event);

      return session;
    },

    getSession(id: string): Session | undefined {
      return sessions.get(id);
    },

    getSessionWithAnnotations(id: string): SessionWithAnnotations | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;

      const sessionAnnotations = Array.from(annotations.values()).filter(
        (a) => a.sessionId === id
      );

      return {
        ...session,
        annotations: sessionAnnotations,
      };
    },

    getSessionWithAnnotationsV2(id: string): SessionWithAnnotationsV2 | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;

      return {
        ...session,
        annotations: Array.from(annotationsV2.values()).filter(
          (a) => a.sessionId === id
        ),
      };
    },

    updateSessionProjectId(id: string, projectId?: string, metadata?: Record<string, unknown>): Session | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;

      session.projectId = projectId ?? session.projectId;
      session.metadata = metadata
        ? {
            ...(session.metadata ?? {}),
            ...metadata,
          }
        : session.metadata;
      session.updatedAt = new Date().toISOString();

      const event = eventBus.emit("session.updated", id, session);
      events.push(event);

      return session;
    },

    updateSessionStatus(id: string, status: SessionStatus): Session | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;

      session.status = status;
      session.updatedAt = new Date().toISOString();

      const eventType = status === "closed" ? "session.closed" : "session.updated";
      const event = eventBus.emit(eventType, id, session);
      events.push(event);

      return session;
    },

    listSessions(): Session[] {
      return Array.from(sessions.values());
    },

    addAnnotation(
      sessionId: string,
      data: Omit<Annotation, "id" | "sessionId" | "status" | "createdAt">
    ): Annotation | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;

      const annotation: Annotation = {
        ...data,
        id: generateId(),
        sessionId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      annotations.set(annotation.id, annotation);

      const event = eventBus.emit("annotation.created", sessionId, annotation);
      events.push(event);

      return annotation;
    },

    getAnnotation(id: string): Annotation | undefined {
      return annotations.get(id);
    },

    updateAnnotation(
      id: string,
      data: Partial<Omit<Annotation, "id" | "sessionId" | "createdAt">>
    ): Annotation | undefined {
      const annotation = annotations.get(id);
      if (!annotation) return undefined;

      Object.assign(annotation, data, { updatedAt: new Date().toISOString() });

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    updateAnnotationStatus(
      id: string,
      status: AnnotationStatus,
      resolvedBy?: "human" | "agent"
    ): Annotation | undefined {
      const annotation = annotations.get(id);
      if (!annotation) return undefined;

      annotation.status = status;
      annotation.updatedAt = new Date().toISOString();

      if (status === "resolved" || status === "dismissed") {
        annotation.resolvedAt = new Date().toISOString();
        annotation.resolvedBy = resolvedBy || "agent";
      }

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    addThreadMessage(
      annotationId: string,
      role: "human" | "agent",
      content: string
    ): Annotation | undefined {
      const annotation = annotations.get(annotationId);
      if (!annotation) return undefined;

      const message: ThreadMessage = {
        id: generateId(),
        role,
        content,
        timestamp: Date.now(),
      };

      if (!annotation.thread) {
        annotation.thread = [];
      }
      annotation.thread.push(message);
      annotation.updatedAt = new Date().toISOString();

      if (annotation.sessionId) {
        const event = eventBus.emit("thread.message", annotation.sessionId, message);
        events.push(event);
      }

      return annotation;
    },

    getPendingAnnotations(sessionId: string): Annotation[] {
      return Array.from(annotations.values()).filter(
        (a) => a.sessionId === sessionId && a.status === "pending"
      );
    },

    getSessionAnnotations(sessionId: string): Annotation[] {
      return Array.from(annotations.values()).filter(
        (a) => a.sessionId === sessionId
      );
    },

    deleteAnnotation(id: string): Annotation | undefined {
      const annotation = annotations.get(id);
      if (!annotation) return undefined;

      annotations.delete(id);

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.deleted", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    // -- Annotations V2 (Vue schema) ------------------------------------------

    addAnnotationV2(sessionId: string, data: AnnotationV2): AnnotationV2 | undefined {
      const session = sessions.get(sessionId);
      if (!session) return undefined;

      // Idempotent: return existing if same ID
      const existing = annotationsV2.get(data.id);
      if (existing) return existing;

      const annotation: AnnotationV2 = {
        ...data,
        sessionId,
        status: data.status ?? "pending",
        createdAt: new Date().toISOString(),
      };

      annotationsV2.set(annotation.id, annotation);
      const event = eventBus.emit("annotation.created", sessionId, annotation);
      events.push(event);
      return annotation;
    },

    getAnnotationV2(id: string): AnnotationV2 | undefined {
      return annotationsV2.get(id);
    },

    updateAnnotationV2(
      id: string,
      data: Partial<Omit<AnnotationV2, "id" | "sessionId" | "createdAt">>
    ): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(id);
      if (!annotation) return undefined;

      Object.assign(annotation, data, { updatedAt: new Date().toISOString() });
      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }
      return annotation;
    },

    updateAnnotationV2Status(
      id: string,
      status: AnnotationStatus,
      resolvedBy?: "human" | "agent",
    ): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(id);
      if (!annotation) return undefined;

      annotation.status = status;
      annotation.updatedAt = new Date().toISOString();

      if (status !== "processing") {
        clearProcessingState(annotation);
      }
      applyResolvedState(annotation, status, resolvedBy);

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    claimAnnotationV2(id: string, claim: AnnotationClaim): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(id);
      if (!annotation) return undefined;

      if (
        (annotation.status ?? "pending") === "processing"
        && annotation.processingByAgentId === claim.agentId
        && annotation.processingByRunId === claim.runId
      ) {
        return annotation
      }

      if ((annotation.status ?? "pending") !== "pending") {
        return undefined
      }

      annotation.status = "processing";
      annotation.processingByAgentId = claim.agentId;
      annotation.processingByRunId = claim.runId;
      annotation.processingStartedAt = claim.processingStartedAt;
      annotation.processingExpiresAt = claim.processingExpiresAt;
      annotation.updatedAt = new Date().toISOString();
      delete annotation.resolvedAt;
      delete annotation.resolvedBy;

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    releaseAnnotationV2(id: string, owner?: AnnotationClaimOwner): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(id);
      if (!annotation) return undefined;
      if ((annotation.status ?? "pending") !== "processing") return undefined;
      if (!matchesClaimOwner(annotation, owner)) return undefined;

      annotation.status = "pending";
      annotation.updatedAt = new Date().toISOString();
      clearProcessingState(annotation);
      delete annotation.resolvedAt;
      delete annotation.resolvedBy;

      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(event);
      }

      return annotation;
    },

    requeueExpiredProcessingAnnotationsV2(nowIso = new Date().toISOString()): number {
      const expiredIds = Array.from(annotationsV2.values())
        .filter((annotation) => isAnnotationProcessingExpired(annotation, nowIso))
        .map((annotation) => annotation.id)

      for (const annotationId of expiredIds) {
        this.releaseAnnotationV2(annotationId)
      }

      return expiredIds.length
    },

    addThreadMessageV2(
      annotationId: string,
      role: "human" | "agent",
      content: string,
    ): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(annotationId);
      if (!annotation) return undefined;

      const message: ThreadMessage = {
        id: generateId(),
        role,
        content,
        timestamp: new Date().toISOString(),
      };

      annotation.thread = [...(annotation.thread || []), message];
      annotation.updatedAt = new Date().toISOString();

      if (annotation.sessionId) {
        const updatedEvent = eventBus.emit("annotation.updated", annotation.sessionId, annotation);
        events.push(updatedEvent);
        const threadEvent = eventBus.emit("thread.message", annotation.sessionId, message);
        events.push(threadEvent);
      }

      return annotation;
    },

    getPendingAnnotationsV2(sessionId: string): AnnotationV2[] {
      return Array.from(annotationsV2.values()).filter(
        (a) => a.sessionId === sessionId && (a.status ?? "pending") === "pending",
      );
    },

    getSessionAnnotationsV2(sessionId: string): AnnotationV2[] {
      return Array.from(annotationsV2.values()).filter(
        (a) => a.sessionId === sessionId
      );
    },

    deleteAnnotationV2(id: string): AnnotationV2 | undefined {
      const annotation = annotationsV2.get(id);
      if (!annotation) return undefined;
      annotationsV2.delete(id);
      if (annotation.sessionId) {
        const event = eventBus.emit("annotation.deleted", annotation.sessionId, annotation);
        events.push(event);
      }
      return annotation;
    },

    getEventsSince(sessionId: string, sequence: number): AFSEvent[] {
      return events.filter(
        (e) => e.sessionId === sessionId && e.sequence > sequence
      );
    },

    close(): void {
      sessions.clear();
      annotations.clear();
      annotationsV2.clear();
      events.length = 0;
    },
  };
}

// -----------------------------------------------------------------------------
// Convenience Exports (delegate to singleton)
// -----------------------------------------------------------------------------

export const store = {
  get instance() {
    return getStore();
  },
};

// Direct function exports for backwards compatibility
export function createSession(url: string, projectId?: string, metadata?: Record<string, unknown>): Session {
  return getStore().createSession(url, projectId, metadata);
}

export function getSession(id: string): Session | undefined {
  return getStore().getSession(id);
}

export function getSessionWithAnnotations(id: string): SessionWithAnnotations | undefined {
  return getStore().getSessionWithAnnotations(id);
}

export function updateSessionProjectId(
  id: string,
  projectId?: string,
  metadata?: Record<string, unknown>,
): Session | undefined {
  return getStore().updateSessionProjectId(id, projectId, metadata);
}

export function updateSessionStatus(id: string, status: SessionStatus): Session | undefined {
  return getStore().updateSessionStatus(id, status);
}

export function listSessions(): Session[] {
  return getStore().listSessions();
}

export function addAnnotation(
  sessionId: string,
  data: Omit<Annotation, "id" | "sessionId" | "status" | "createdAt">
): Annotation | undefined {
  return getStore().addAnnotation(sessionId, data);
}

export function getAnnotation(id: string): Annotation | undefined {
  return getStore().getAnnotation(id);
}

export function updateAnnotation(
  id: string,
  data: Partial<Omit<Annotation, "id" | "sessionId" | "createdAt">>
): Annotation | undefined {
  return getStore().updateAnnotation(id, data);
}

export function updateAnnotationStatus(
  id: string,
  status: AnnotationStatus,
  resolvedBy?: "human" | "agent"
): Annotation | undefined {
  return getStore().updateAnnotationStatus(id, status, resolvedBy);
}

export function addThreadMessage(
  annotationId: string,
  role: "human" | "agent",
  content: string
): Annotation | undefined {
  return getStore().addThreadMessage(annotationId, role, content);
}

export function getPendingAnnotations(sessionId: string): Annotation[] {
  return getStore().getPendingAnnotations(sessionId);
}

export function getSessionAnnotations(sessionId: string): Annotation[] {
  return getStore().getSessionAnnotations(sessionId);
}

export function deleteAnnotation(id: string): Annotation | undefined {
  return getStore().deleteAnnotation(id);
}

// -- V2 convenience exports --------------------------------------------------

export function getSessionWithAnnotationsV2(id: string): SessionWithAnnotationsV2 | undefined {
  return getStore().getSessionWithAnnotationsV2(id);
}

export function addAnnotationV2(sessionId: string, data: AnnotationV2): AnnotationV2 | undefined {
  return getStore().addAnnotationV2(sessionId, data);
}

export function getAnnotationV2(id: string): AnnotationV2 | undefined {
  return getStore().getAnnotationV2(id);
}

export function updateAnnotationV2(
  id: string,
  data: Partial<Omit<AnnotationV2, "id" | "sessionId" | "createdAt">>
): AnnotationV2 | undefined {
  return getStore().updateAnnotationV2(id, data);
}

export function updateAnnotationV2Status(
  id: string,
  status: AnnotationStatus,
  resolvedBy?: "human" | "agent",
): AnnotationV2 | undefined {
  return getStore().updateAnnotationV2Status(id, status, resolvedBy);
}

export function claimAnnotationV2(id: string, claim: AnnotationClaim): AnnotationV2 | undefined {
  return getStore().claimAnnotationV2(id, claim);
}

export function releaseAnnotationV2(id: string, owner?: AnnotationClaimOwner): AnnotationV2 | undefined {
  return getStore().releaseAnnotationV2(id, owner);
}

export function requeueExpiredProcessingAnnotationsV2(nowIso?: string): number {
  return getStore().requeueExpiredProcessingAnnotationsV2(nowIso);
}

export function addThreadMessageV2(
  annotationId: string,
  role: "human" | "agent",
  content: string,
): AnnotationV2 | undefined {
  return getStore().addThreadMessageV2(annotationId, role, content);
}

export function getPendingAnnotationsV2(sessionId: string): AnnotationV2[] {
  return getStore().getPendingAnnotationsV2(sessionId);
}

export function getSessionAnnotationsV2(sessionId: string): AnnotationV2[] {
  return getStore().getSessionAnnotationsV2(sessionId);
}

export function deleteAnnotationV2(id: string): AnnotationV2 | undefined {
  return getStore().deleteAnnotationV2(id);
}

export function getEventsSince(sessionId: string, sequence: number): AFSEvent[] {
  return getStore().getEventsSince(sessionId, sequence);
}

/**
 * Clear all data and reset the store.
 */
export function clearAll(): void {
  getStore().close();
  _store = null;
}
