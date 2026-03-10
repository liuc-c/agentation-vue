import type { AgentationVueSyncOptions } from "../types.ts"

export function normalizeUrl(input: string): string {
  return input.replace(/\/+$/, "")
}

export function parsePort(input: string): number | null {
  try {
    const url = new URL(input)
    const fallback = url.protocol === "https:" ? 443 : 80
    const port = parseInt(url.port || String(fallback), 10)
    return Number.isFinite(port) ? port : null
  } catch {
    return null
  }
}

export async function isServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeUrl(baseUrl)}/health`, {
      signal: AbortSignal.timeout(800),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function hasSessionEventsCapability(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${normalizeUrl(baseUrl)}/v2/sessions/__agentation_probe__/events`,
      { signal: AbortSignal.timeout(800) },
    )

    if (response.ok) {
      return true
    }

    if (response.status !== 404) {
      return false
    }

    const body = await response.text()
    return body.includes("Session not found")
  } catch {
    return false
  }
}

export async function waitForSharedServer(
  endpoint: string,
  timeoutMs = 8000,
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerHealthy(endpoint)) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
  }

  return false
}

export function getEnsureServerKey(sync: AgentationVueSyncOptions): string {
  return normalizeUrl(sync.endpoint)
}
