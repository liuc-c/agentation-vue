import { accessSync, constants } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export interface SharedServerSpawnSpec {
  command: string
  args: string[]
}

const require = createRequire(import.meta.url)
const WORKSPACE_MCP_CLI_PATH = fileURLToPath(new URL("../../../mcp/dist/cli.js", import.meta.url))

function canReadFile(path: string): boolean {
  try {
    accessSync(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

export function resolveInstalledMcpCliPath(
  fileExists: (path: string) => boolean = canReadFile,
): string | null {
  try {
    const entryPath = require.resolve("agentation-vue-mcp")
    const cliPath = join(dirname(entryPath), "cli.js")
    return fileExists(cliPath) ? cliPath : null
  } catch {
    return null
  }
}

export function resolveWorkspaceMcpCliPath(
  fileExists: (path: string) => boolean = canReadFile,
): string | null {
  return fileExists(WORKSPACE_MCP_CLI_PATH) ? WORKSPACE_MCP_CLI_PATH : null
}

export function resolveMcpCliPath(
  fileExists: (path: string) => boolean = canReadFile,
): string | null {
  return resolveInstalledMcpCliPath(fileExists) ?? resolveWorkspaceMcpCliPath(fileExists)
}

export function createSharedServerSpawnSpec(
  port: number,
  resolveCliPath: () => string | null = resolveMcpCliPath,
): SharedServerSpawnSpec | null {
  const cliPath = resolveCliPath()
  if (!cliPath) {
    return null
  }

  return {
    command: process.execPath,
    args: [
      cliPath,
      "server",
      "--port",
      String(port),
      "--no-stdio",
    ],
  }
}
