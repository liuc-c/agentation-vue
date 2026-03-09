import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const STYLE_HREF_PLACEHOLDER = 'export const AGENTATION_UI_STYLE_HREF = "";'

export function injectCssImportIntoChunk(source, cssPath = "./index.css") {
  const importStatement = `import "${cssPath}"`
  if (source.includes(importStatement)) {
    return source
  }

  const sourceMapIndex = source.lastIndexOf("\n//# sourceMappingURL=")
  if (sourceMapIndex >= 0) {
    const trailing = source.slice(sourceMapIndex)
    if (/^\n\/\/# sourceMappingURL=.*\s*$/.test(trailing)) {
      return `${source.slice(0, sourceMapIndex)}\n${importStatement}${trailing}`
    }
  }

  return `${source}\n${importStatement}\n`
}

function injectBuiltStringExport(source, exportName, replacement) {
  const placeholder = exportName === "AGENTATION_UI_STYLE_HREF"
    ? STYLE_HREF_PLACEHOLDER
    : `export const ${exportName} = "";`

  if (source.includes(placeholder)) {
    return source.replace(
      placeholder,
      `export const ${exportName} = ${replacement};`,
    )
  }

  const bundledMatch = source.match(
    new RegExp(`([A-Za-z_$][\\w$]*)\\s*=\\s*\"\";(?=[\\s\\S]*?\\b\\1 as ${exportName}\\b)`),
  )
  if (!bundledMatch) {
    return source
  }

  const variableName = bundledMatch[1]
  return source.replace(
    new RegExp(`\\b${variableName}\\s*=\\s*\"\";`),
    `${variableName} = ${replacement};`,
  )
}

export function injectBuiltStyleHref(source, cssPath = "./index.raw.css") {
  return injectBuiltStringExport(
    source,
    "AGENTATION_UI_STYLE_HREF",
    `new URL(${JSON.stringify(cssPath)}, import.meta.url).href`,
  )
}

export function protectCssPixels(cssText) {
  return cssText.replace(/(-?\d*\.?\d+)px\b/g, "$1PX")
}

export function patchBuiltEntry(
  entryFile = resolve(import.meta.dirname, "../dist/index.js"),
  cssFile = resolve(import.meta.dirname, "../dist/index.css"),
  rawCssFile = resolve(import.meta.dirname, "../dist/index.raw.css"),
) {
  if (!existsSync(entryFile)) {
    throw new Error(`Built entry not found: ${entryFile}`)
  }
  if (!existsSync(cssFile)) {
    throw new Error(`Built stylesheet not found: ${cssFile}`)
  }

  const source = readFileSync(entryFile, "utf8")
  const cssText = readFileSync(cssFile, "utf8")
  const patched = injectBuiltStyleHref(injectCssImportIntoChunk(source))
  writeFileSync(rawCssFile, protectCssPixels(cssText))

  if (patched !== source) {
    writeFileSync(entryFile, patched)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  patchBuiltEntry()
}
