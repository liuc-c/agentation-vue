import type { AnnotationV2 } from "../types/index.ts"

export const DEFAULT_STORAGE_PREFIX = "agentation-vue-"
export const DEFAULT_SESSION_PREFIX = "agentation-vue-session-"
export const DEFAULT_RETENTION_DAYS = 7

export interface StorageOptions {
  storage?: Storage
  prefix?: string
  legacyPrefix?: string
  sessionPrefix?: string
  legacySessionPrefix?: string
  retentionDays?: number
}

function resolveStorage(explicit?: Storage): Storage | undefined {
  if (explicit) return explicit
  if (typeof window === "undefined") return undefined
  return window.localStorage
}

function parseTimestampMs(timestamp?: string | number): number | undefined {
  if (typeof timestamp === "number") return Number.isFinite(timestamp) ? timestamp : undefined
  if (typeof timestamp === "string") {
    const ms = Date.parse(timestamp)
    return Number.isNaN(ms) ? undefined : ms
  }
  return undefined
}

function filterRecent<T extends { timestamp?: string | number }>(
  entries: T[],
  retentionDays: number,
): T[] {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  return entries.filter((entry) => {
    const ms = parseTimestampMs(entry.timestamp)
    return ms === undefined || ms > cutoff
  })
}

export function getStorageKey(
  pathname: string,
  options: StorageOptions = {},
): string {
  return `${options.prefix ?? DEFAULT_STORAGE_PREFIX}${pathname}`
}

function getLegacyStorageKey(
  pathname: string,
  options: StorageOptions,
): string | undefined {
  if (!options.legacyPrefix) return undefined
  return `${options.legacyPrefix}${pathname}`
}

function getLegacySessionStorageKey(
  pathname: string,
  options: StorageOptions,
): string | undefined {
  if (!options.legacySessionPrefix) return undefined
  return `${options.legacySessionPrefix}${pathname}`
}

function readStorageValue(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function removeStorageValue(storage: Storage, key: string | undefined): void {
  if (!key) return

  try {
    storage.removeItem(key)
  } catch {
    // silent
  }
}

function migrateStorageValue(
  storage: Storage,
  nextKey: string,
  legacyKey: string,
  value: string,
): void {
  try {
    storage.setItem(nextKey, value)
    storage.removeItem(legacyKey)
  } catch {
  }
}

function loadStorageValueWithFallback(
  storage: Storage,
  nextKey: string,
  legacyKey: string | undefined,
): string | null {
  const nextValue = readStorageValue(storage, nextKey)
  if (nextValue != null || !legacyKey || legacyKey === nextKey) {
    return nextValue
  }

  const legacyValue = readStorageValue(storage, legacyKey)
  if (legacyValue == null) return null

  migrateStorageValue(storage, nextKey, legacyKey, legacyValue)
  return legacyValue
}

export function loadAnnotations<T extends { timestamp?: string | number } = AnnotationV2>(
  pathname: string,
  options: StorageOptions = {},
): T[] {
  const storage = resolveStorage(options.storage)
  if (!storage) return []

  try {
    const raw = loadStorageValueWithFallback(
      storage,
      getStorageKey(pathname, options),
      getLegacyStorageKey(pathname, options),
    )
    if (!raw) return []
    const parsed = JSON.parse(raw) as T[]
    return filterRecent(parsed, options.retentionDays ?? DEFAULT_RETENTION_DAYS)
  } catch {
    return []
  }
}

export function saveAnnotations<T = AnnotationV2>(
  pathname: string,
  annotations: T[],
  options: StorageOptions = {},
): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return

  try {
    storage.setItem(getStorageKey(pathname, options), JSON.stringify(annotations))
    removeStorageValue(storage, getLegacyStorageKey(pathname, options))
  } catch {
    // silent — localStorage may be full or disabled
  }
}

export function clearAnnotations(
  pathname: string,
  options: StorageOptions = {},
): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return

  try {
    storage.removeItem(getStorageKey(pathname, options))
    removeStorageValue(storage, getLegacyStorageKey(pathname, options))
  } catch {
    // silent
  }
}

export function loadAllAnnotations<T extends { timestamp?: string | number } = AnnotationV2>(
  options: StorageOptions = {},
): Map<string, T[]> {
  const result = new Map<string, T[]>()
  const storage = resolveStorage(options.storage)
  if (!storage) return result

  const prefix = options.prefix ?? DEFAULT_STORAGE_PREFIX
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS

  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(prefix)) continue

      const pathname = key.slice(prefix.length)
      const raw = storage.getItem(key)
      if (!raw) continue

      const parsed = JSON.parse(raw) as T[]
      const filtered = filterRecent(parsed, retentionDays)
      if (filtered.length > 0) {
        result.set(pathname, filtered)
      }
    }
  } catch {
    // silent
  }

  return result
}

export function saveAnnotationsWithSyncMarker(
  pathname: string,
  annotations: AnnotationV2[],
  sessionId: string,
  options: StorageOptions = {},
): void {
  const marked = annotations.map((a) => ({ ...a, _syncedTo: sessionId }))
  saveAnnotations(pathname, marked, options)
}

/**
 * Mark specific annotations as synced to a session.
 * Unlike `saveAnnotationsWithSyncMarker`, this only touches the specified IDs.
 */
export function markAnnotationsSynced(
  pathname: string,
  annotationIds: string[],
  sessionId: string,
  options: StorageOptions = {},
): void {
  if (annotationIds.length === 0) return

  const ids = new Set(annotationIds)
  const annotations = loadAnnotations<AnnotationV2 & { _syncedTo?: string }>(pathname, options)
  const marked = annotations.map((a) =>
    ids.has(a.id) ? { ...a, _syncedTo: sessionId } : a,
  )
  saveAnnotations(pathname, marked, options)
}

export function getUnsyncedAnnotations(
  pathname: string,
  sessionId?: string,
  options: StorageOptions = {},
): AnnotationV2[] {
  const annotations = loadAnnotations<AnnotationV2 & { _syncedTo?: string }>(pathname, options)
  return annotations.filter((a) => {
    if (!a._syncedTo) return true
    if (sessionId && a._syncedTo !== sessionId) return true
    return false
  })
}

export function clearSyncMarkers(
  pathname: string,
  options: StorageOptions = {},
): void {
  const annotations = loadAnnotations<AnnotationV2 & { _syncedTo?: string }>(pathname, options)
  const cleaned = annotations.map(({ _syncedTo: _, ...rest }) => rest)
  saveAnnotations(pathname, cleaned, options)
}

export function getSessionStorageKey(
  pathname: string,
  options: StorageOptions = {},
): string {
  return `${options.sessionPrefix ?? DEFAULT_SESSION_PREFIX}${pathname}`
}

export function loadSessionId(
  pathname: string,
  options: StorageOptions = {},
): string | null {
  const storage = resolveStorage(options.storage)
  if (!storage) return null

  return loadStorageValueWithFallback(
    storage,
    getSessionStorageKey(pathname, options),
    getLegacySessionStorageKey(pathname, options),
  )
}

export function saveSessionId(
  pathname: string,
  sessionId: string,
  options: StorageOptions = {},
): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return

  try {
    storage.setItem(getSessionStorageKey(pathname, options), sessionId)
    removeStorageValue(storage, getLegacySessionStorageKey(pathname, options))
  } catch {
    // silent
  }
}

export function clearSessionId(
  pathname: string,
  options: StorageOptions = {},
): void {
  const storage = resolveStorage(options.storage)
  if (!storage) return

  try {
    storage.removeItem(getSessionStorageKey(pathname, options))
    removeStorageValue(storage, getLegacySessionStorageKey(pathname, options))
  } catch {
    // silent
  }
}
