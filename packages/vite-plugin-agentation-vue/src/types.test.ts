import { describe, expect, it } from "vitest"
import {
  DEFAULT_AGENTATION_SYNC_OPTIONS,
  resolveMcpEndpoint,
  resolveOptions,
} from "./types.js"

describe("resolveOptions", () => {
  it("enables sync by default in serve mode", () => {
    const resolved = resolveOptions({}, "serve")
    expect(resolved.enabled).toBe(true)
    expect(resolved.sync).toMatchObject(DEFAULT_AGENTATION_SYNC_OPTIONS)
    expect(resolveMcpEndpoint(resolved.sync as Exclude<typeof resolved.sync, false>)).toBe("http://localhost:4748")
  })

  it("merges partial sync config with defaults", () => {
    const resolved = resolveOptions({
      sync: {
        endpoint: "http://localhost:5000",
      },
    }, "serve")

    expect(resolved.sync).toMatchObject({
      endpoint: "http://localhost:5000",
      autoSync: true,
      debounceMs: 400,
      ensureServer: true,
    })
    expect(resolveMcpEndpoint(resolved.sync as Exclude<typeof resolved.sync, false>)).toBe("http://localhost:5001")
  })

  it("allows explicit sync disable", () => {
    const resolved = resolveOptions({
      sync: false,
    }, "serve")

    expect(resolved.sync).toBe(false)
  })
})
