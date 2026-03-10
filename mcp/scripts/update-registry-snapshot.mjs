import { existsSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const DEFAULT_SOURCE = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"
const DEFAULT_OUTPUT = fileURLToPath(new URL("../src/server/registry/registry-snapshot.json", import.meta.url))

const ICON_OVERRIDES = {
  "claude-acp": "vscode-icons:file-type-claude",
  gemini: "vscode-icons:file-type-gemini",
}

function normalizeString(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : []
}

function normalizeEnvObject(value) {
  if (!value || typeof value !== "object") return []

  return Object.entries(value)
    .filter((entry) => typeof entry[1] === "string")
    .map(([name, envValue]) => ({
      name,
      value: envValue,
    }))
}

function normalizeKind(id) {
  return id.endsWith("-acp")
    ? id.slice(0, -4)
    : id
}

function formatCommand(command, args) {
  return [command, ...args]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ")
}

function normalizeDistribution(agent) {
  const npx = agent?.distribution?.npx
  if (npx?.package) {
    const args = ["-y", npx.package, ...normalizeStringArray(npx.args)]
    return {
      command: "npx",
      args,
      env: normalizeEnvObject(npx.env),
      installHint: `Runs via ${formatCommand("npx", args)}.`,
    }
  }

  const uvx = agent?.distribution?.uvx
  if (uvx?.package) {
    const args = [uvx.package, ...normalizeStringArray(uvx.args)]
    return {
      command: "uvx",
      args,
      env: normalizeEnvObject(uvx.env),
      installHint: `Runs via ${formatCommand("uvx", args)}.`,
    }
  }

  return null
}

function normalizeAgent(agent) {
  const id = normalizeString(agent?.id)
  const label = normalizeString(agent?.name)
  const distribution = normalizeDistribution(agent)

  if (!id || !label || !distribution) {
    return null
  }

  return {
    id,
    label,
    kind: normalizeKind(id),
    command: distribution.command,
    args: distribution.args,
    env: distribution.env,
    transport: "stdio",
    ...(ICON_OVERRIDES[id] ? { icon: ICON_OVERRIDES[id] } : {}),
    ...(normalizeString(agent?.description) ? { description: normalizeString(agent.description) } : {}),
    ...(normalizeString(agent?.repository) ? { homepage: normalizeString(agent.repository) } : {}),
    installHint: distribution.installHint,
  }
}

export function createSnapshot(registry, options = {}) {
  const agents = Array.isArray(registry?.agents)
    ? registry.agents.map(normalizeAgent).filter(Boolean)
    : []

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    source: options.source ?? DEFAULT_SOURCE,
    agents,
  }
}

async function loadRegistryFromDirectory(sourceDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const agents = []

  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const agentPath = join(sourceDir, entry.name, "agent.json")
    if (!existsSync(agentPath)) continue
    agents.push(JSON.parse(await readFile(agentPath, "utf8")))
  }

  return { version: "workspace", agents }
}

export async function loadUpstreamRegistry(source = DEFAULT_SOURCE) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, {
      headers: {
        Accept: "application/json",
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: HTTP ${response.status}`)
    }
    return response.json()
  }

  const resolvedSource = resolve(source)
  const stat = await import("node:fs/promises").then(({ stat }) => stat(resolvedSource))
  if (stat.isDirectory()) {
    return loadRegistryFromDirectory(resolvedSource)
  }

  return JSON.parse(await readFile(resolvedSource, "utf8"))
}

export async function writeSnapshotFile(snapshot, outputPath = DEFAULT_OUTPUT) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")
}

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    sourceLabel: undefined,
  }

  for (let index = 0; index < argv.length; index++) {
    const current = argv[index]
    if (current === "--source" && argv[index + 1]) {
      args.source = argv[index + 1]
      index += 1
    } else if (current === "--source-label" && argv[index + 1]) {
      args.sourceLabel = argv[index + 1]
      index += 1
    } else if (current === "--output" && argv[index + 1]) {
      args.output = resolve(argv[index + 1])
      index += 1
    }
  }

  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const registry = await loadUpstreamRegistry(args.source)
  const snapshot = createSnapshot(registry, {
    source: args.sourceLabel ?? args.source,
  })

  await writeSnapshotFile(snapshot, args.output)

  console.log(JSON.stringify({
    source: snapshot.source,
    output: args.output,
    generatedAt: snapshot.generatedAt,
    agentCount: snapshot.agents.length,
  }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error && error.message) || error)
    process.exitCode = 1
  })
}
