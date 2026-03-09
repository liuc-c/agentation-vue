// @vitest-environment node

import { describe, expect, it } from "vitest"
import { injectCssImportIntoChunk } from "./inject-css-import.mjs"

describe("injectCssImportIntoChunk", () => {
  it("injects the built stylesheet before the sourcemap comment", () => {
    const source = [
      "const answer = 42",
      "export { answer }",
      "//# sourceMappingURL=index.js.map",
      "",
    ].join("\n")

    expect(injectCssImportIntoChunk(source)).toBe([
      "const answer = 42",
      "export { answer }",
      "import \"./index.css\"",
      "//# sourceMappingURL=index.js.map",
      "",
    ].join("\n"))
  })

  it("appends the stylesheet import when no sourcemap is present", () => {
    const source = [
      "const answer = 42",
      "export { answer }",
    ].join("\n")

    expect(injectCssImportIntoChunk(source)).toBe([
      "const answer = 42",
      "export { answer }",
      "import \"./index.css\"",
      "",
    ].join("\n"))
  })

  it("does not duplicate the stylesheet import", () => {
    const source = [
      "const answer = 42",
      "import \"./index.css\"",
      "//# sourceMappingURL=index.js.map",
    ].join("\n")

    expect(injectCssImportIntoChunk(source)).toBe(source)
  })
})
