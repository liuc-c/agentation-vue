import { describe, expect, it } from "vitest"
import {
  DEFAULT_AGENTATION_SYNC_OPTIONS,
  resolveMcpEndpoint,
  resolveOptions,
} from "./types.ts"

const inferredProjectId = "workspace-scope-z7k2m9p"

describe("resolveOptions", () => {
  it("enables sync by default in serve mode", () => {
    const resolved = resolveOptions({}, "serve")
    expect(resolved.enabled).toBe(true)
    expect(resolved.sync).toMatchObject(DEFAULT_AGENTATION_SYNC_OPTIONS)
    expect(resolved.agent).toEqual({
      enabled: false,
      autoSend: false,
    })
    expect(resolveMcpEndpoint(resolved.sync as Exclude<typeof resolved.sync, false>)).toBe("http://127.0.0.1:4748")
  })

  it("merges partial sync config with defaults", () => {
    const resolved = resolveOptions({
      sync: {
        endpoint: "http://localhost:5000",
      },
    }, "serve")

    expect(resolved.sync).toMatchObject({
      endpoint: "http://127.0.0.1:5000",
      autoSync: true,
      debounceMs: 400,
      ensureServer: true,
    })
    expect(resolveMcpEndpoint(resolved.sync as Exclude<typeof resolved.sync, false>)).toBe("http://127.0.0.1:5000")
  })

  it("infers projectId from the Vite root directory", () => {
    const resolved = resolveOptions({}, "serve", `/tmp/${inferredProjectId}`)

    expect(resolved.projectId).toBe(inferredProjectId)
    expect(resolved.projectRoot).toBe(`/tmp/${inferredProjectId}`)
    expect(resolved.sync).toMatchObject({
      projectId: inferredProjectId,
    })
  })

  it("prefers an explicit projectId over the inferred root name", () => {
    const resolved = resolveOptions({
      sync: {
        endpoint: "http://localhost:5000",
        projectId: "custom-project",
      },
    }, "serve", `/tmp/${inferredProjectId}`)

    expect(resolved.sync).toMatchObject({
      projectId: "custom-project",
    })
  })

  it("normalizes deprecated localhost MCP endpoints to the explicit loopback address", () => {
    const resolved = resolveOptions({
      sync: {
        endpoint: "http://localhost:5000",
        mcpEndpoint: "http://localhost:6000/",
      },
    }, "serve")

    expect(resolveMcpEndpoint(resolved.sync as Exclude<typeof resolved.sync, false>)).toBe("http://127.0.0.1:6000")
  })

  it("keeps the inferred projectId available even when sync is disabled", () => {
    const resolved = resolveOptions({
      sync: false,
    }, "serve", `/tmp/${inferredProjectId}`)

    expect(resolved.sync).toBe(false)
    expect(resolved.projectId).toBe(inferredProjectId)
  })

  it("allows explicit sync disable", () => {
    const resolved = resolveOptions({
      sync: false,
    }, "serve")

    expect(resolved.sync).toBe(false)
  })

  it("allows configuring the agent bridge defaults", () => {
    const resolved = resolveOptions({
      agent: {
        enabled: true,
        autoSend: true,
      },
    }, "serve")

    expect(resolved.agent).toEqual({
      enabled: true,
      autoSend: true,
    })
  })
})
