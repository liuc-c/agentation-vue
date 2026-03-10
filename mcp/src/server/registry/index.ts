import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { homedir } from "node:os"
import { DEFAULT_AGENT_REGISTRY_MANIFEST } from "./default-manifest.js"
import type {
  AgentRegistryManifest,
  RegistryAgentDefinition,
  RegistryEnvVar,
} from "./types.js"

const CONFIG_DIR = resolve(homedir(), ".agentation")
const DEFAULT_CACHE_PATH = resolve(CONFIG_DIR, "acp-registry-cache.json")
const DEFAULT_FETCH_TIMEOUT_MS = 3500

export interface AgentRegistryConfigShape {
  registryUrl?: string
}

function normalizeArgs(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((value): value is string => typeof value === "string")
}

function normalizeEnv(input: unknown): RegistryEnvVar[] {
  if (!Array.isArray(input)) return []

  return input.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []

    const name = typeof (entry as { name?: unknown }).name === "string"
      ? (entry as { name: string }).name.trim()
      : ""
    const value = typeof (entry as { value?: unknown }).value === "string"
      ? (entry as { value: string }).value
      : ""

    return name ? [{ name, value }] : []
  })
}

function normalizeAgent(input: unknown): RegistryAgentDefinition | null {
  if (!input || typeof input !== "object") return null

  const raw = input as Record<string, unknown>
  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  const label = typeof raw.label === "string" ? raw.label.trim() : ""
  const kind = typeof raw.kind === "string" ? raw.kind.trim() : ""
  const command = typeof raw.command === "string" ? raw.command.trim() : ""

  if (!id || !label || !kind || !command) {
    return null
  }

  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : undefined

  return {
    id,
    label,
    kind,
    command,
    args: normalizeArgs(raw.args),
    env: normalizeEnv(raw.env),
    transport: "stdio",
    icon: typeof raw.icon === "string" ? raw.icon.trim() || undefined : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() || undefined : undefined,
    homepage: typeof raw.homepage === "string" ? raw.homepage.trim() || undefined : undefined,
    installHint: typeof raw.installHint === "string" ? raw.installHint.trim() || undefined : undefined,
    platforms: platforms?.length ? platforms : undefined,
  }
}

function normalizeManifest(input: unknown): AgentRegistryManifest | null {
  if (!input || typeof input !== "object") return null

  const raw = input as Record<string, unknown>
  const agents = Array.isArray(raw.agents)
    ? raw.agents.map(normalizeAgent).filter((agent): agent is RegistryAgentDefinition => Boolean(agent))
    : []

  if (agents.length === 0) {
    return null
  }

  return {
    version: 1,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : undefined,
    source: typeof raw.source === "string" ? raw.source : undefined,
    agents,
  }
}

function filterManifestByPlatform(manifest: AgentRegistryManifest): AgentRegistryManifest {
  const platform = process.platform
  const agents = manifest.agents.filter((agent) =>
    !agent.platforms || agent.platforms.length === 0 || agent.platforms.includes(platform))

  return {
    ...manifest,
    agents,
  }
}

export function getAgentRegistryCachePath(): string {
  return process.env.AGENTATION_ACP_REGISTRY_CACHE?.trim() || DEFAULT_CACHE_PATH
}

export function getConfiguredRegistryUrl(config?: AgentRegistryConfigShape | null): string | undefined {
  const envRegistryUrl = process.env.AGENTATION_ACP_REGISTRY_URL?.trim()
  if (envRegistryUrl) {
    return envRegistryUrl
  }

  const fileRegistryUrl = config?.registryUrl?.trim()
  return fileRegistryUrl || undefined
}

export function ensureAgentRegistryCacheDir(cachePath = getAgentRegistryCachePath()): void {
  mkdirSync(dirname(cachePath), { recursive: true })
}

export function readRegistryCache(cachePath = getAgentRegistryCachePath()): AgentRegistryManifest {
  try {
    if (existsSync(cachePath)) {
      const parsed = normalizeManifest(JSON.parse(readFileSync(cachePath, "utf8")))
      if (parsed) {
        return filterManifestByPlatform(parsed)
      }
    }
  } catch (error) {
    process.stderr.write(`[Agents] Failed to read registry cache ${cachePath}: ${(error as Error).message}\n`)
  }

  return filterManifestByPlatform(DEFAULT_AGENT_REGISTRY_MANIFEST)
}

export function writeRegistryCache(
  manifest: AgentRegistryManifest,
  cachePath = getAgentRegistryCachePath(),
): void {
  ensureAgentRegistryCacheDir(cachePath)
  writeFileSync(cachePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
}

export async function refreshRegistryCache(input?: {
  registryUrl?: string
  config?: AgentRegistryConfigShape | null
  cachePath?: string
  timeoutMs?: number
}): Promise<{
  manifest: AgentRegistryManifest
  registryUrl?: string
  source: "remote" | "cache" | "embedded"
}> {
  const cachePath = input?.cachePath ?? getAgentRegistryCachePath()
  const registryUrl = input?.registryUrl?.trim() || getConfiguredRegistryUrl(input?.config ?? null)

  if (!registryUrl) {
    const embedded = filterManifestByPlatform(DEFAULT_AGENT_REGISTRY_MANIFEST)
    writeRegistryCache(embedded, cachePath)
    return {
      manifest: embedded,
      source: "embedded",
    }
  }

  try {
    const response = await fetch(registryUrl, {
      signal: AbortSignal.timeout(input?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const parsed = normalizeManifest(await response.json())
    if (!parsed) {
      throw new Error("Registry manifest is empty or invalid")
    }

    const manifest = filterManifestByPlatform({
      ...parsed,
      source: parsed.source ?? registryUrl,
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
    })
    writeRegistryCache(manifest, cachePath)

    return {
      manifest,
      registryUrl,
      source: "remote",
    }
  } catch (error) {
    const cached = readRegistryCache(cachePath)
    process.stderr.write(
      `[Agents] Failed to refresh registry${registryUrl ? ` ${registryUrl}` : ""}: ${(error as Error).message}\n`,
    )
    return {
      manifest: cached,
      registryUrl,
      source: cached.source === "embedded" ? "embedded" : "cache",
    }
  }
}
