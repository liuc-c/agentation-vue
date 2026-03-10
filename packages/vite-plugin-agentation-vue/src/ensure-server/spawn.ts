import { spawn, type ChildProcess } from "node:child_process"
import { createSharedServerSpawnSpec } from "../shared-server.ts"

export type SpawnedSharedServer = ChildProcess

export function spawnSharedServer(port: number): SpawnedSharedServer | null {
  const spawnSpec = createSharedServerSpawnSpec(port)
  if (!spawnSpec) {
    return null
  }

  try {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      detached: false,
      stdio: "ignore",
      env: process.env,
      windowsHide: true,
    })

    if (!child) {
      return null
    }

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
