// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { freeze, unfreeze } from "./freeze-animations"

describe("freeze-animations", () => {
  afterEach(() => {
    unfreeze()
    document.getElementById("feedback-freeze-styles")?.remove()
  })

  it("does not patch global timing APIs while frozen", () => {
    const setTimeoutBefore = window.setTimeout
    const setIntervalBefore = window.setInterval
    const requestAnimationFrameBefore = window.requestAnimationFrame

    freeze()

    expect(window.setTimeout).toBe(setTimeoutBefore)
    expect(window.setInterval).toBe(setIntervalBefore)
    expect(window.requestAnimationFrame).toBe(requestAnimationFrameBefore)
    expect(document.getElementById("feedback-freeze-styles")).not.toBeNull()
  })

  it("whitelists the runtime containers in the injected selector", () => {
    freeze()

    const styleText = document.getElementById("feedback-freeze-styles")?.textContent ?? ""

    expect(styleText).toContain(":not(#agentation-app)")
    expect(styleText).toContain(":not(#agentation-overlay)")
  })

  it("does not freeze animations inside agentation shadow hosts", () => {
    const host = document.createElement("div")
    host.id = "agentation-app"
    const shadowRoot = host.attachShadow({ mode: "open" })
    const child = document.createElement("div")
    shadowRoot.appendChild(child)
    document.body.appendChild(host)

    const pause = vi.fn()
    const play = vi.fn()
    const animation = {
      playState: "running",
      effect: { target: child },
      pause,
      play,
    } as unknown as Animation

    const originalGetAnimations = document.getAnimations
    const getAnimations = vi.fn().mockReturnValue([animation])
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: getAnimations,
    })

    freeze()

    expect(pause).not.toHaveBeenCalled()

    unfreeze()
    Object.defineProperty(document, "getAnimations", {
      configurable: true,
      value: originalGetAnimations,
    })
    host.remove()
  })
})
