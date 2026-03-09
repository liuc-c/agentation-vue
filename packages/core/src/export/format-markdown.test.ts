import { describe, it, expect } from "vitest"
import { formatToMarkdown } from "./format-markdown.ts"
import type { AnnotationV2 } from "../types/index.ts"

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
        project_area: "/checkout :: CheckoutPage > PaymentForm :: main",
        context_hints: ["heading: Billing", "ariaLabel: Confirm payment"],
      },
    })
    const md = formatToMarkdown([a], { detailLevel: "detailed" })
    expect(md).toContain("**Project area:** /checkout :: CheckoutPage > PaymentForm :: main")
    expect(md).toContain("**Component hierarchy:** App > Layout > Button")
    expect(md).toContain("**Classes:** btn primary")
    expect(md).toContain("**Context hints:** heading: Billing | ariaLabel: Confirm payment")
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

  it("excludes configured fields from markdown output", () => {
    const md = formatToMarkdown([makeAnnotation({
      elementText: "Click me",
      source: {
        framework: "vue",
        componentName: "App",
        componentHierarchy: "App > Hero > CTA",
        file: "src/App.vue",
        line: 10,
        column: 2,
        resolver: "vue-tracer",
      },
      metadata: {
        project_area: "/home :: Hero",
        context_hints: ["heading: Hero"],
        elementPath: "main > button",
        fullPath: "html > body > main > button",
        cssClasses: "btn primary",
        boundingBox: { x: 10, y: 20, width: 30, height: 40 },
        nearbyText: "Primary CTA",
        computedStyles: "color: red",
        accessibility: "button",
        nearbyElements: "a.link",
      },
    })], {
      detailLevel: "forensic",
      page: {
        pathname: "/home",
        viewport: { width: 1440, height: 900 },
        url: "http://localhost/home",
        userAgent: "Vitest",
        timestamp: "2026-01-01T00:00:00.000Z",
        devicePixelRatio: 2,
      },
      excludeFields: ["projectArea", "contextHints", "sourceLocation", "framework", "selectedText", "context", "url", "timestamp", "viewport"],
    })

    expect(md).not.toContain("Project area")
    expect(md).not.toContain("Context hints")
    expect(md).not.toContain("**Source:**")
    expect(md).not.toContain("**Framework:**")
    expect(md).not.toContain("Selected text")
    expect(md).not.toContain("**Context:**")
    expect(md).not.toContain("- URL:")
    expect(md).not.toContain("- Timestamp:")
    expect(md).not.toContain("- Viewport:")
    expect(md).toContain("Component hierarchy")
    expect(md).toContain("Computed Styles")
  })
})
