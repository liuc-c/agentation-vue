import { cp, mkdir, readdir } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcDir = join(rootDir, "src")
const distDir = join(rootDir, "dist")

async function collectVueDtsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory())
      return collectVueDtsFiles(fullPath)

    return fullPath.endsWith(".vue.d.ts") ? [fullPath] : []
  }))

  return files.flat()
}

export async function copyVueDtsFiles() {
  for (const file of await collectVueDtsFiles(srcDir)) {
    const relativePath = relative(srcDir, file)
    const outputPath = join(distDir, relativePath)

    await mkdir(dirname(outputPath), { recursive: true })
    await cp(file, outputPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await copyVueDtsFiles()
}
