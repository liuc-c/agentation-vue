export interface RegistryEnvVar {
  name: string
  value: string
}

export interface RegistryAgentDefinition {
  id: string
  label: string
  kind: string
  command: string
  args?: string[]
  env?: RegistryEnvVar[]
  transport?: "stdio"
  icon?: string
  description?: string
  homepage?: string
  installHint?: string
  platforms?: string[]
}

export interface AgentRegistryManifest {
  version: 1
  generatedAt?: string
  source?: string
  agents: RegistryAgentDefinition[]
}
