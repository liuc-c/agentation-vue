// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
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
})
