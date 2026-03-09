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
    expect(state.copyPrefix).toBe("")
    expect(state.copyExcludeFields).toEqual([])
    expect(state.autoClearAfterCopy).toBe(false)
    expect(state.blockInteractions).toBe(true)
    expect(state.locale).toBe("en")
  })

  it("accepts custom defaults", () => {
    const state = createSettingsState({
      outputDetail: "forensic",
      darkMode: false,
      copyFormat: "json",
      copyPrefix: "例如：你好，请帮我修改以下内容：",
      copyExcludeFields: ["projectArea", "framework"],
      blockInteractions: false,
      locale: "zh-CN",
    })
    expect(state.outputDetail).toBe("forensic")
    expect(state.darkMode).toBe(false)
    expect(state.copyFormat).toBe("json")
    expect(state.copyPrefix).toBe("例如：你好，请帮我修改以下内容：")
    expect(state.copyExcludeFields).toEqual(["projectArea", "framework"])
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
      JSON.stringify({
        darkMode: false,
        outputDetail: "detailed",
        copyFormat: "json",
        copyPrefix: "Hi",
        copyExcludeFields: ["projectArea"],
        locale: "zh-CN",
      }),
    )
    const state = createSettingsState()
    expect(state.darkMode).toBe(false)
    expect(state.outputDetail).toBe("detailed")
    expect(state.copyFormat).toBe("json")
    expect(state.copyPrefix).toBe("Hi")
    expect(state.copyExcludeFields).toEqual(["projectArea"])
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

  it("drops invalid copy exclude fields from storage", () => {
    localStorage.setItem(
      "agentation-vue-settings",
      JSON.stringify({ copyExcludeFields: ["projectArea", "unknown"] }),
    )

    const state = createSettingsState()
    expect(state.copyExcludeFields).toEqual(["projectArea"])
  })
})
