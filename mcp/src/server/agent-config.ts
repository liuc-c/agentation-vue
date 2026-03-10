import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path"
import { homedir } from "node:os"
import {
  readEmbeddedRegistryManifest,
} from "./registry/index.js"

export type AgentKind = string
export type AgentStatus = "available" | "missing" | "connecting" | "ready" | "busy" | "error"

export interface AgentEnvVar {
  name: string
  value: string
}

export interface LocalAgentConfig {
  id: string
  label: string
  kind: AgentKind
  enabled: boolean
  transport: "stdio"
  command: string
  args: string[]
  env: AgentEnvVar[]
  cwdStrategy: "projectRoot"
  mcpMode: "inherit-agentation-server"
  icon?: string
  description?: string
  homepage?: string
  installHint?: string
}

export interface LocalAgentOverride {
  id: string
  label?: string
  kind?: AgentKind
  enabled?: boolean
  transport?: "stdio"
  command?: string
  args?: string[]
  env?: AgentEnvVar[]
  cwdStrategy?: "projectRoot"
  mcpMode?: "inherit-agentation-server"
  icon?: string
  description?: string
  homepage?: string
  installHint?: string
}

export interface AgentConfigFile {
  defaultAgentId?: string
  agents: LocalAgentOverride[]
}

export interface ResolvedAgentConfig extends LocalAgentConfig {
  available: boolean
  status: AgentStatus
  resolvedCommand: string
  lastError?: string
}

export interface AgentCatalog {
  configPath: string
  defaultAgentId?: string
  agents: ResolvedAgentConfig[]
  source: "snapshot"
  snapshotGeneratedAt?: string
  snapshotSource?: string
}

const CONFIG_DIR = resolve(homedir(), ".agentation")
const DEFAULT_CONFIG_PATH = resolve(CONFIG_DIR, "agents.json")

export function getAgentConfigPath(): string {
  return process.env.AGENTATION_AGENT_CONFIG?.trim() || DEFAULT_CONFIG_PATH
}

function normalizeEnv(input: unknown): AgentEnvVar[] {
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

function normalizeArgs(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((value): value is string => typeof value === "string")
}

function normalizeAgentOverride(input: unknown): LocalAgentOverride | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Record<string, unknown>

  const id = typeof raw.id === "string" ? raw.id.trim() : ""
  if (!id) {
    return null
  }

  return {
    id,
    label: typeof raw.label === "string" ? raw.label.trim() || undefined : undefined,
    kind: typeof raw.kind === "string" ? raw.kind.trim() || undefined : undefined,
    enabled: raw.enabled === false ? false : undefined,
    transport: raw.transport === "stdio" ? "stdio" : undefined,
    command: typeof raw.command === "string" ? raw.command.trim() || undefined : undefined,
    args: normalizeArgs(raw.args),
    env: normalizeEnv(raw.env),
    cwdStrategy: raw.cwdStrategy === "projectRoot" ? "projectRoot" : undefined,
    mcpMode: raw.mcpMode === "inherit-agentation-server" ? "inherit-agentation-server" : undefined,
    icon: typeof raw.icon === "string" ? raw.icon.trim() || undefined : undefined,
    description: typeof raw.description === "string" ? raw.description.trim() || undefined : undefined,
    homepage: typeof raw.homepage === "string" ? raw.homepage.trim() || undefined : undefined,
    installHint: typeof raw.installHint === "string" ? raw.installHint.trim() || undefined : undefined,
  }
}

function loadConfigFile(configPath: string): AgentConfigFile | null {
  if (!existsSync(configPath)) return null

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
    defaultAgentId?: unknown
    agents?: unknown
  }

  const agents = Array.isArray(parsed.agents)
    ? parsed.agents.map(normalizeAgentOverride).filter((agent): agent is LocalAgentOverride => Boolean(agent))
    : []

  return {
    defaultAgentId: typeof parsed.defaultAgentId === "string" ? parsed.defaultAgentId.trim() || undefined : undefined,
    agents,
  }
}

function envPathSegments(): string[] {
  const pathValue = process.env.PATH || ""
  return pathValue.split(delimiter).filter(Boolean)
}

function candidateExecutablePaths(command: string): string[] {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .filter(Boolean)
    : [""]

  if (isAbsolute(command)) {
    return extensions.map((ext) => command.endsWith(ext) ? command : `${command}${ext}`)
  }

  return envPathSegments().flatMap((segment) =>
    extensions.map((ext) => join(segment, command.endsWith(ext) ? command : `${command}${ext}`)))
}

export function resolveCommandPath(command: string): string | null {
  if (!command) return null

  if (isAbsolute(command) && existsSync(command)) {
    return command
  }

  for (const candidate of candidateExecutablePaths(command)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function mergeAgentConfig(
  base: LocalAgentConfig,
  override?: LocalAgentOverride,
): LocalAgentConfig {
  return {
    ...base,
    ...(override?.label ? { label: override.label } : {}),
    ...(override?.kind ? { kind: override.kind } : {}),
    enabled: override?.enabled ?? base.enabled,
    transport: override?.transport ?? base.transport,
    command: override?.command ?? base.command,
    args: override?.args?.length ? override.args : base.args,
    env: override?.env?.length ? override.env : base.env,
    cwdStrategy: override?.cwdStrategy ?? base.cwdStrategy,
    mcpMode: override?.mcpMode ?? base.mcpMode,
    icon: override?.icon ?? base.icon,
    description: override?.description ?? base.description,
    homepage: override?.homepage ?? base.homepage,
    installHint: override?.installHint ?? base.installHint,
  }
}

function resolveConfigAgent(agent: LocalAgentConfig): ResolvedAgentConfig {
  const matchedCommand = resolveCommandPath(agent.command)
  const resolvedCommand = matchedCommand ?? agent.command
  const available = agent.enabled && Boolean(matchedCommand || (isAbsolute(agent.command) && existsSync(agent.command)))

  return {
    ...agent,
    available,
    status: available ? "available" : "missing",
    resolvedCommand,
  }
}

function resolveFromSnapshot(configPath: string, config: AgentConfigFile | null): AgentCatalog {
  const registry = readEmbeddedRegistryManifest()
  const overrideById = new Map((config?.agents ?? []).map((agent) => [agent.id, agent]))
  const registryAgents = registry.agents.map((agent) =>
    resolveConfigAgent(mergeAgentConfig({
      id: agent.id,
      label: agent.label,
      kind: agent.kind,
      enabled: true,
      transport: "stdio",
      command: agent.command,
      args: agent.args ?? [],
      env: agent.env ?? [],
      cwdStrategy: "projectRoot",
      mcpMode: "inherit-agentation-server",
      icon: agent.icon,
      description: agent.description,
      homepage: agent.homepage,
      installHint: agent.installHint,
    }, overrideById.get(agent.id))))

  const extraAgents = (config?.agents ?? [])
    .filter((agent) => !registryAgents.some((item) => item.id === agent.id))
    .flatMap((agent) => {
      if (!agent.label || !agent.kind || !agent.command) {
        return []
      }

      return [resolveConfigAgent({
        id: agent.id,
        label: agent.label,
        kind: agent.kind,
        enabled: agent.enabled ?? true,
        transport: "stdio",
        command: agent.command,
        args: agent.args ?? [],
        env: agent.env ?? [],
        cwdStrategy: "projectRoot",
        mcpMode: "inherit-agentation-server",
        icon: agent.icon,
        description: agent.description,
        homepage: agent.homepage,
        installHint: agent.installHint,
      })]
    })

  const agents = [...registryAgents, ...extraAgents]
  const defaultAgentId = config?.defaultAgentId && agents.some((agent) => agent.id === config.defaultAgentId)
    ? config.defaultAgentId
    : agents.find((agent) => agent.available)?.id

  return {
    configPath,
    defaultAgentId,
    agents,
    source: "snapshot",
    snapshotGeneratedAt: registry.generatedAt,
    snapshotSource: registry.source,
  }
}

export function loadAgentCatalog(configPath = getAgentConfigPath()): AgentCatalog {
  try {
    const config = loadConfigFile(configPath)
    return resolveFromSnapshot(configPath, config)
  } catch (error) {
    process.stderr.write(`[Agents] Failed to parse ${configPath}: ${(error as Error).message}\n`)
    return resolveFromSnapshot(configPath, null)
  }
}

export function ensureAgentConfigDir(configPath = getAgentConfigPath()): void {
  mkdirSync(dirname(configPath), { recursive: true })
}

export function writeAgentCatalogConfig(
  catalog: AgentCatalog,
  configPath = catalog.configPath,
): void {
  ensureAgentConfigDir(configPath)

  writeFileSync(configPath, `${JSON.stringify({
    defaultAgentId: catalog.defaultAgentId,
    agents: catalog.agents.map((agent) => ({
      id: agent.id,
      enabled: agent.enabled,
      command: agent.command,
      args: agent.args,
      env: agent.env,
      label: agent.label,
      kind: agent.kind,
      icon: agent.icon,
      description: agent.description,
      homepage: agent.homepage,
      installHint: agent.installHint,
    })),
  }, null, 2)}\n`, "utf8")
}
