import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

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

export function patchBuiltEntry(entryFile = resolve(import.meta.dirname, "../dist/index.js")) {
  if (!existsSync(entryFile)) {
    throw new Error(`Built entry not found: ${entryFile}`)
  }

  const source = readFileSync(entryFile, "utf8")
  const patched = injectCssImportIntoChunk(source)

  if (patched !== source) {
    writeFileSync(entryFile, patched)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  patchBuiltEntry()
}
