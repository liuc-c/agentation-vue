import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const rootDir = resolve(import.meta.dirname, "..")
const rootPackage = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"))
const expectedTag = `v${rootPackage.version}`
const gitTag = process.env.GITHUB_REF_NAME

if (gitTag && gitTag !== expectedTag) {
  console.error(`Tag/version mismatch: expected ${expectedTag}, got ${gitTag}`)
  process.exit(1)
}

const packages = [
  {
    name: "@liuovo/agentation-vue-core",
    dir: resolve(rootDir, "packages/core"),
  },
  {
    name: "@liuovo/agentation-vue-ui",
    dir: resolve(rootDir, "packages/ui-vue"),
  },
  {
    name: "vite-plugin-agentation-vue",
    dir: resolve(rootDir, "packages/vite-plugin-agentation-vue"),
  },
  {
    name: "agentation-vue-mcp",
    dir: resolve(rootDir, "mcp"),
  },
]

function run(command, args, cwd = rootDir, options = {}) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    ...options,
  })
}

function hasPublishedVersion(name, version) {
  try {
    const output = execFileSync(
      "npm",
      ["view", `${name}@${version}`, "version", "--registry", "https://registry.npmjs.org"],
      {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim()

    return output === version
  }
  catch {
    return false
  }
}

console.log(`Preparing npm publish for ${expectedTag}`)

for (const pkg of packages) {
  if (hasPublishedVersion(pkg.name, rootPackage.version)) {
    console.log(`Skipping ${pkg.name}@${rootPackage.version} (already published)`)
    continue
  }

  console.log(`Publishing ${pkg.name}@${rootPackage.version}`)
  run("pnpm", ["publish", "--access", "public", "--no-git-checks"], pkg.dir)
}
