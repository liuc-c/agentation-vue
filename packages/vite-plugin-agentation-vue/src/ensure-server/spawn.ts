import { spawn, type ChildProcess } from "node:child_process"
import { createSharedServerSpawnSpec } from "../shared-server.ts"

const MAX_CAPTURED_STDERR_LINES = 8
const MAX_CAPTURED_STDERR_CHARS = 600

export type SpawnedSharedServer = ChildProcess & {
  getRecentStderr?(): string | undefined
}

function trimCapturedStderr(lines: string[]): string | undefined {
  const joined = lines.join(" | ").trim()
  if (!joined) {
    return undefined
  }

  return joined.length > MAX_CAPTURED_STDERR_CHARS
    ? `${joined.slice(0, MAX_CAPTURED_STDERR_CHARS - 1)}…`
    : joined
}

export function spawnSharedServer(port: number): SpawnedSharedServer | null {
  const spawnSpec = createSharedServerSpawnSpec(port)
  if (!spawnSpec) {
    return null
  }

  try {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      detached: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
      windowsHide: true,
    }) as SpawnedSharedServer

    if (!child) {
      return null
    }

    const stderrLines: string[] = []

    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk: string) => {
      const normalized = chunk
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)

      if (normalized.length === 0) {
        return
      }

      stderrLines.push(...normalized)
      if (stderrLines.length > MAX_CAPTURED_STDERR_LINES) {
        stderrLines.splice(0, stderrLines.length - MAX_CAPTURED_STDERR_LINES)
      }
    })

    child.getRecentStderr = () => trimCapturedStderr(stderrLines)

    if (child && typeof child.on === "function") {
      child.on("error", (error) => {
        console.warn("[agentation] Failed to spawn shared companion:", error.message)
      })
    }

    return child
  } catch (error) {
    console.warn("[agentation] Failed to spawn shared companion:", (error as Error).message)
    return null
  }
}
