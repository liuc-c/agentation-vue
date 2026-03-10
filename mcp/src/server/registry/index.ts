import { DEFAULT_AGENT_REGISTRY_MANIFEST } from "./default-manifest.js"
import type {
  AgentRegistryManifest,
  RegistryAgentDefinition,
  RegistryEnvVar,
} from "./types.js"

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

export function readEmbeddedRegistryManifest(): AgentRegistryManifest {
  const parsed = normalizeManifest(DEFAULT_AGENT_REGISTRY_MANIFEST)
  if (!parsed) {
    throw new Error("Embedded ACP registry snapshot is empty or invalid")
  }

  return filterManifestByPlatform(parsed)
}
