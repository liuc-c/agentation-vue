import type { AgentRegistryManifest } from "./types.js"

export const DEFAULT_AGENT_REGISTRY_MANIFEST: AgentRegistryManifest = {
  version: 1,
  source: "embedded",
  agents: [
    {
      id: "claude",
      label: "Claude Code",
      kind: "claude",
      icon: "vscode-icons:file-type-claude",
      command: "claude",
      description: "Anthropic's coding agent with ACP support.",
      homepage: "https://claude.ai/code",
      installHint: "Install Claude Code locally and ensure the `claude` command is on PATH.",
    },
    {
      id: "codex",
      label: "Codex",
      kind: "codex",
      icon: "vscode-icons:file-type-ai",
      command: "codex",
      description: "OpenAI's coding agent CLI.",
      homepage: "https://openai.com",
      installHint: "Install the Codex CLI locally and ensure the `codex` command is on PATH.",
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      kind: "gemini",
      icon: "vscode-icons:file-type-gemini",
      command: "gemini",
      description: "Google's Gemini coding agent CLI.",
      homepage: "https://deepmind.google/technologies/gemini/",
      installHint: "Install Gemini CLI locally and ensure the `gemini` command is on PATH.",
    },
  ],
}
