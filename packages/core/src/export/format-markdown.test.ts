import { describe, it, expect } from "vitest"
import { formatToMarkdown } from "./format-markdown.js"
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

describe("formatToMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(formatToMarkdown([])).toBe("")
  })

  it("compact format uses numbered list", () => {
    const md = formatToMarkdown([makeAnnotation()], { detailLevel: "compact" })
    expect(md).toContain("1. **button**:")
    expect(md).toContain("Fix this button")
  })

  it("standard format includes source and component", () => {
    const md = formatToMarkdown([makeAnnotation()], { detailLevel: "standard" })
    expect(md).toContain("### 1. button")
    expect(md).toContain("**Source:** src/App.vue:10")
    expect(md).toContain("**Component:** App")
    expect(md).toContain("**Feedback:** Fix this button")
  })

  it("detailed format includes hierarchy and styles", () => {
    const a = makeAnnotation({
      source: {
        framework: "vue",
        componentName: "App",
        componentHierarchy: "App > Layout > Button",
        file: "src/App.vue",
        line: 10,
        resolver: "vue-tracer",
      },
      metadata: {
        cssClasses: "btn primary",
        boundingBox: { x: 100, y: 200, width: 80, height: 40 },
      },
    })
    const md = formatToMarkdown([a], { detailLevel: "detailed" })
    expect(md).toContain("**Component hierarchy:** App > Layout > Button")
    expect(md).toContain("**Classes:** btn primary")
    expect(md).toContain("**Position:**")
  })

  it("forensic format includes environment metadata", () => {
    const md = formatToMarkdown([makeAnnotation()], {
      detailLevel: "forensic",
      page: {
        url: "http://localhost/test",
        viewport: { width: 1920, height: 1080 },
        userAgent: "TestBrowser",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    })
    expect(md).toContain("**Environment:**")
    expect(md).toContain("1920×1080")
    expect(md).toContain("TestBrowser")
  })

  it("includes selected text when present", () => {
    const a = makeAnnotation({ elementText: "Click me" })
    const md = formatToMarkdown([a], { detailLevel: "compact" })
    expect(md).toContain("Click me")
  })

  it("uses page pathname in heading", () => {
    const md = formatToMarkdown([makeAnnotation()], {
      page: { pathname: "/about" },
    })
    expect(md).toContain("## Page Feedback: /about")
  })
})
