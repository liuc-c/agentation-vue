import { afterEach, describe, expect, it, vi } from "vitest"
import { writeTextToClipboard } from "./clipboard.js"

describe("writeTextToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
  })

  it("returns false when the async clipboard API is unavailable", async () => {
    await expect(writeTextToClipboard("copy me")).resolves.toBe(false)
  })

  it("writes text when the async clipboard API succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await expect(writeTextToClipboard("copy me")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("copy me")
  })

  it("returns false when async clipboard access is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"))
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await expect(writeTextToClipboard("copy me")).resolves.toBe(false)
    expect(writeText).toHaveBeenCalledWith("copy me")
  })
})
