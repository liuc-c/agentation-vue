// @vitest-environment node

import { describe, expect, it } from "vitest"
import { injectBuiltStyleHref, injectCssImportIntoChunk, protectCssPixels } from "./inject-css-import.mjs"

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

  it("injects the raw built css href into the published entry placeholder", () => {
    const source = [
      'export const AGENTATION_UI_STYLE_HREF = "";',
      "export { AGENTATION_UI_STYLE_HREF }",
    ].join("\n")

    expect(injectBuiltStyleHref(source)).toBe([
      'export const AGENTATION_UI_STYLE_HREF = new URL("./index.raw.css", import.meta.url).href;',
      "export { AGENTATION_UI_STYLE_HREF }",
    ].join("\n"))
  })

  it("injects the raw built css href into the bundled alias export", () => {
    const source = [
      'const helper = 1;',
      'Hs = "";',
      'export {',
      '  Hs as AGENTATION_UI_STYLE_HREF,',
      '}',
    ].join("\n")

    expect(injectBuiltStyleHref(source)).toContain(
      'Hs = new URL("./index.raw.css", import.meta.url).href;',
    )
  })

  it("uppercases px units in the protected css copy", () => {
    expect(protectCssPixels("font-size: 16px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);")).toBe(
      "font-size: 16PX; box-shadow: 0 12PX 32PX rgba(0, 0, 0, 0.2);",
    )
  })
})
