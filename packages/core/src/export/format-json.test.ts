import { describe, it, expect } from "vitest"
import { formatToJSON } from "./format-json.js"
import type { AnnotationV2 } from "../types/index.js"

function makeAnnotation(overrides: Partial<AnnotationV2> = {}): AnnotationV2 {
  return {
    id: "test-1",
    schemaVersion: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    url: "http://localhost/test",
    elementSelector: "button",
    comment: "Fix this button",
    source: {
      framework: "vue",
      componentName: "App",
      file: "src/App.vue",
      line: 10,
      resolver: "vue-tracer",
    },
    ...overrides,
  }
}

describe("formatToJSON", () => {
  it("returns empty annotations array for empty input", () => {
    const result = formatToJSON([])
    expect(result.annotationCount).toBe(0)
    expect(result.annotations).toEqual([])
    expect(result.format).toBe("agentation-vue")
  })

  it("uses compact detail level", () => {
    const result = formatToJSON([makeAnnotation()], { detailLevel: "compact" })
    const ann = result.annotations[0]
    expect(ann.elementSelector).toBe("button")
    expect(ann.comment).toBe("Fix this button")
    expect(ann.id).toBeUndefined()
    expect(ann.source).toBeUndefined()
  })

  it("uses standard detail level", () => {
    const result = formatToJSON([makeAnnotation()], { detailLevel: "standard" })
    const ann = result.annotations[0]
    expect(ann.id).toBe("test-1")
    expect(ann.source).toBeDefined()
    expect(ann.metadata).toBeUndefined()
  })

  it("uses detailed level with metadata", () => {
    const a = makeAnnotation({ metadata: { elementPath: "div > button" } })
    const result = formatToJSON([a], { detailLevel: "detailed" })
    expect(result.annotations[0].metadata).toBeDefined()
  })

  it("uses forensic level with metadata", () => {
    const a = makeAnnotation({ metadata: { computedStyles: "color: red" } })
    const result = formatToJSON([a], { detailLevel: "forensic" })
    expect(result.annotations[0].metadata).toBeDefined()
  })

  it("includes page context", () => {
    const result = formatToJSON([], {
      page: { pathname: "/about", viewport: { width: 1920, height: 1080 } },
    })
    expect(result.page.pathname).toBe("/about")
    expect(result.page.viewport).toEqual({ width: 1920, height: 1080 })
  })

  it("defaults to standard detail level", () => {
    const result = formatToJSON([])
    expect(result.detailLevel).toBe("standard")
  })
})
