import { describe, it, expect, beforeEach } from "vitest"
import { createSettingsState } from "./useSettings.js"

describe("createSettingsState", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("creates with default values", () => {
    const state = createSettingsState()
    expect(state.outputDetail).toBe("standard")
    expect(state.darkMode).toBe(true)
    expect(state.enabled).toBe(true)
    expect(state.componentSourceEnabled).toBe(true)
    expect(state.annotationColor).toBe("#3c82f7")
    expect(state.showMarkers).toBe(true)
    expect(state.copyFormat).toBe("markdown")
    expect(state.autoClearAfterCopy).toBe(false)
    expect(state.blockInteractions).toBe(true)
    expect(state.locale).toBe("en")
  })

  it("accepts custom defaults", () => {
    const state = createSettingsState({
      outputDetail: "forensic",
      darkMode: false,
      copyFormat: "json",
      blockInteractions: false,
      locale: "zh-CN",
    })
    expect(state.outputDetail).toBe("forensic")
    expect(state.darkMode).toBe(false)
    expect(state.copyFormat).toBe("json")
    expect(state.blockInteractions).toBe(false)
    expect(state.locale).toBe("zh-CN")
  })

  it("toggles dark mode", () => {
    const state = createSettingsState()
    expect(state.darkMode).toBe(true)
    state.toggleDarkMode()
    expect(state.darkMode).toBe(false)
    state.toggleDarkMode()
    expect(state.darkMode).toBe(true)
  })

  it("allows setting outputDetail", () => {
    const state = createSettingsState()
    state.outputDetail = "compact"
    expect(state.outputDetail).toBe("compact")
  })

  it("loads from localStorage when available", () => {
    localStorage.setItem(
      "agentation-vue-settings",
      JSON.stringify({ darkMode: false, outputDetail: "detailed", copyFormat: "json", locale: "zh-CN" }),
    )
    const state = createSettingsState()
    expect(state.darkMode).toBe(false)
    expect(state.outputDetail).toBe("detailed")
    expect(state.copyFormat).toBe("json")
    expect(state.locale).toBe("zh-CN")
  })

  it("localStorage overrides defaults", () => {
    localStorage.setItem(
      "agentation-vue-settings",
      JSON.stringify({ darkMode: false }),
    )
    const state = createSettingsState({ darkMode: true })
    expect(state.darkMode).toBe(false)
  })

  it("falls back to English when stored locale is invalid", () => {
    localStorage.setItem(
      "agentation-vue-settings",
      JSON.stringify({ locale: "fr-FR" }),
    )
    const state = createSettingsState()
    expect(state.locale).toBe("en")
  })
})
