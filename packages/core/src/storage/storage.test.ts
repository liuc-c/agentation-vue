import { describe, it, expect, beforeEach } from "vitest"
import {
  loadAnnotations,
  saveAnnotations,
  clearAnnotations,
  getUnsyncedAnnotations,
  markAnnotationsSynced,
  getSessionStorageKey,
  loadSessionId,
  saveSessionId,
  clearSessionId,
  loadAllAnnotations,
  getStorageKey,
} from "./storage.ts"

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear() { data.clear() },
    getItem(key) { return data.get(key) ?? null },
    key(index) { return [...data.keys()][index] ?? null },
    removeItem(key) { data.delete(key) },
    setItem(key, value) { data.set(key, value) },
  }
}

function makeAnnotation(id: string, comment = "test") {
  return {
    id,
    schemaVersion: 1 as const,
    timestamp: new Date().toISOString(),
    url: "http://localhost/",
    elementSelector: "button",
    comment,
    source: {
      framework: "vue" as const,
      componentName: "App",
      file: "src/App.vue",
      line: 10,
      resolver: "test",
    },
  }
}

describe("storage", () => {
  let storage: Storage

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  describe("loadAnnotations / saveAnnotations", () => {
    it("returns empty array when nothing stored", () => {
      const result = loadAnnotations("/", { storage })
      expect(result).toEqual([])
    })

    it("round-trips annotations", () => {
      const annotations = [makeAnnotation("a1"), makeAnnotation("a2")]
      saveAnnotations("/page", annotations, { storage })
      const loaded = loadAnnotations("/page", { storage })
      expect(loaded).toHaveLength(2)
      expect(loaded[0].id).toBe("a1")
      expect(loaded[1].id).toBe("a2")
    })

    it("hides resolved and dismissed annotations from active loads", () => {
      saveAnnotations("/page", [
        makeAnnotation("pending"),
        { ...makeAnnotation("resolved"), status: "resolved" as const },
        { ...makeAnnotation("dismissed"), status: "dismissed" as const },
      ], { storage })

      const loaded = loadAnnotations("/page", { storage })
      expect(loaded.map((annotation) => annotation.id)).toEqual(["pending"])
    })

    it("scopes by pathname", () => {
      saveAnnotations("/a", [makeAnnotation("a1")], { storage })
      saveAnnotations("/b", [makeAnnotation("b1")], { storage })
      expect(loadAnnotations("/a", { storage })).toHaveLength(1)
      expect(loadAnnotations("/b", { storage })).toHaveLength(1)
      expect(loadAnnotations("/c", { storage })).toHaveLength(0)
    })

    it("uses custom prefix", () => {
      const opts = { storage, prefix: "custom-" }
      saveAnnotations("/test", [makeAnnotation("x")], opts)
      expect(storage.getItem("custom-/test")).toBeTruthy()
    })

    it("falls back to legacy annotation keys and migrates them", () => {
      storage.setItem("agentation-vue-/demo", JSON.stringify([makeAnnotation("legacy")]))

      const loaded = loadAnnotations("/demo", {
        storage,
        prefix: "agentation-vue-demo-app:",
        legacyPrefix: "agentation-vue-",
      })

      expect(loaded).toHaveLength(1)
      expect(loaded[0].id).toBe("legacy")
      expect(storage.getItem("agentation-vue-demo-app:/demo")).toContain("legacy")
      expect(storage.getItem("agentation-vue-/demo")).toBeNull()
    })
  })

  describe("clearAnnotations", () => {
    it("removes stored annotations", () => {
      saveAnnotations("/", [makeAnnotation("a1")], { storage })
      clearAnnotations("/", { storage })
      expect(loadAnnotations("/", { storage })).toEqual([])
    })
  })

  describe("retention", () => {
    it("filters out old annotations", () => {
      const old = makeAnnotation("old")
      old.timestamp = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const recent = makeAnnotation("recent")

      saveAnnotations("/", [old, recent], { storage })
      const loaded = loadAnnotations("/", { storage, retentionDays: 7 })
      expect(loaded).toHaveLength(1)
      expect(loaded[0].id).toBe("recent")
    })
  })

  describe("sync markers", () => {
    it("identifies unsynced annotations", () => {
      const a1 = { ...makeAnnotation("a1"), _syncedTo: "session-1" }
      const a2 = makeAnnotation("a2")
      saveAnnotations("/", [a1, a2], { storage })

      const unsynced = getUnsyncedAnnotations("/", "session-1", { storage })
      expect(unsynced).toHaveLength(1)
      expect(unsynced[0].id).toBe("a2")
    })

    it("requeues annotations when syncing to a replacement session", () => {
      const synced = { ...makeAnnotation("a1"), _syncedTo: "session-1" }
      saveAnnotations("/", [synced], { storage })

      const unsynced = getUnsyncedAnnotations("/", "session-2", { storage })
      expect(unsynced).toHaveLength(1)
      expect(unsynced[0].id).toBe("a1")
    })

    it("treats active annotations as pending when no current session exists", () => {
      const synced = { ...makeAnnotation("a1"), _syncedTo: "session-1" }
      const pending = makeAnnotation("a2")
      saveAnnotations("/", [synced, pending], { storage })

      const unsynced = getUnsyncedAnnotations("/", undefined, { storage })
      expect(unsynced.map((annotation) => annotation.id)).toEqual(["a1", "a2"])
    })

    it("marks annotations as synced", () => {
      saveAnnotations("/", [makeAnnotation("a1"), makeAnnotation("a2")], { storage })
      markAnnotationsSynced("/", ["a1"], "session-1", { storage })

      const unsynced = getUnsyncedAnnotations("/", "session-1", { storage })
      expect(unsynced).toHaveLength(1)
      expect(unsynced[0].id).toBe("a2")
    })
  })

  describe("session ID", () => {
    it("stores and loads session ID", () => {
      expect(loadSessionId("/", { storage })).toBeNull()
      saveSessionId("/", "sess-123", { storage })
      expect(loadSessionId("/", { storage })).toBe("sess-123")
    })

    it("clears session ID", () => {
      saveSessionId("/", "sess-123", { storage })
      clearSessionId("/", { storage })
      expect(loadSessionId("/", { storage })).toBeNull()
    })

    it("falls back to legacy session keys and migrates them", () => {
      storage.setItem("agentation-vue-session-/", "sess-legacy")

      const loaded = loadSessionId("/", {
        storage,
        sessionPrefix: "agentation-vue-session-demo-app:",
        legacySessionPrefix: "agentation-vue-session-",
      })

      expect(loaded).toBe("sess-legacy")
      expect(storage.getItem("agentation-vue-session-demo-app:/")).toBe("sess-legacy")
      expect(storage.getItem("agentation-vue-session-/")).toBeNull()
    })

    it("removes legacy session keys after writing the new key", () => {
      storage.setItem("agentation-vue-session-/", "sess-legacy")

      saveSessionId("/", "sess-next", {
        storage,
        sessionPrefix: "agentation-vue-session-demo-app:",
        legacySessionPrefix: "agentation-vue-session-",
      })

      expect(storage.getItem("agentation-vue-session-demo-app:/")).toBe("sess-next")
      expect(storage.getItem("agentation-vue-session-/")).toBeNull()
    })
  })

  describe("loadAllAnnotations", () => {
    it("loads from all pathnames", () => {
      saveAnnotations("/a", [makeAnnotation("a1")], { storage })
      saveAnnotations("/b", [makeAnnotation("b1"), makeAnnotation("b2")], { storage })

      const all = loadAllAnnotations({ storage })
      expect(all.size).toBe(2)
      expect(all.get("/a")).toHaveLength(1)
      expect(all.get("/b")).toHaveLength(2)
    })

    it("keeps pathname parsing working with a namespaced prefix", () => {
      saveAnnotations("/a", [makeAnnotation("a1")], {
        storage,
        prefix: "agentation-vue-demo-app:",
      })

      const all = loadAllAnnotations({
        storage,
        prefix: "agentation-vue-demo-app:",
      })

      expect(all.size).toBe(1)
      expect(all.get("/a")).toHaveLength(1)
    })
  })

  describe("getStorageKey", () => {
    it("uses default prefix", () => {
      expect(getStorageKey("/page")).toBe("agentation-vue-/page")
    })

    it("uses custom prefix", () => {
      expect(getStorageKey("/page", { prefix: "my-" })).toBe("my-/page")
    })

    it("uses custom session prefix", () => {
      expect(getSessionStorageKey("/page", { sessionPrefix: "session-demo:" })).toBe("session-demo:/page")
    })
  })
})
