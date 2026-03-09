// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@liuovo/agentation-vue-ui", () => ({
  resolveMessages: () => ({
    notifications: {
      sourceUnavailableArea: "area unavailable",
      sourceUnavailableElement: "element unavailable",
    },
  }),
}))

let setupInfrastructure: typeof import("./bootstrap.ts").setupInfrastructure

beforeEach(async () => {
  ;({ setupInfrastructure } = await import("./bootstrap.ts"))
})

describe("setupInfrastructure", () => {
  afterEach(() => {
    document.getElementById("agentation-app")?.remove()
    document.getElementById("agentation-overlay")?.remove()
    document.head.querySelectorAll("[data-vite-dev-id]").forEach((node) => {
      node.remove()
    })
  })

  it("mounts the runtime containers inside shadow roots and mirrors ui styles", async () => {
    const sourceStyle = document.createElement("style")
    sourceStyle.dataset.viteDevId = "/@fs/home/liu/code/agentation-vue/packages/ui-vue/src/components/OverlayRoot.vue?vue&type=style&index=0&lang.css"
    sourceStyle.textContent = ".agentation-root { color: rgb(255, 0, 0); }"
    document.head.appendChild(sourceStyle)

    const infra = setupInfrastructure("agentation-test-")
    const appHost = document.getElementById("agentation-app") as HTMLDivElement | null
    const overlayHost = document.getElementById("agentation-overlay") as HTMLDivElement | null

    expect(appHost?.shadowRoot).not.toBeNull()
    expect(overlayHost?.shadowRoot).not.toBeNull()
    expect(appHost?.shadowRoot?.getElementById("agentation-app-root")).toBe(infra.appRoot)
    expect(overlayHost?.shadowRoot?.getElementById("agentation-overlay-root")).toBe(infra.overlayRoot)
    expect(appHost?.style.pointerEvents).toBe("none")
    expect(overlayHost?.style.pointerEvents).toBe("none")
    expect(infra.appRoot.style.fontSize).toBe("16px")
    expect(infra.appRoot.style.lineHeight).toBe("1.5")
    expect(infra.overlayRoot.style.fontSize).toBe("16px")
    expect(infra.overlayRoot.style.lineHeight).toBe("1.5")

    const appShadowStyle = appHost?.shadowRoot?.querySelector("style[data-agentation-shadow-style]")
    const overlayShadowStyle = overlayHost?.shadowRoot?.querySelector("style[data-agentation-shadow-style]")

    expect(appShadowStyle?.textContent).toContain("rgb(255, 0, 0)")
    expect(overlayShadowStyle?.textContent).toContain("rgb(255, 0, 0)")

    sourceStyle.textContent = ".agentation-root { color: rgb(0, 0, 255); }"
    await Promise.resolve()
    await Promise.resolve()

    expect(appHost?.shadowRoot?.querySelector("style[data-agentation-shadow-style]")?.textContent).toContain("rgb(0, 0, 255)")
    expect(overlayHost?.shadowRoot?.querySelector("style[data-agentation-shadow-style]")?.textContent).toContain("rgb(0, 0, 255)")

    infra.cleanup()

    expect(appHost?.shadowRoot?.childNodes).toHaveLength(0)
    expect(overlayHost?.shadowRoot?.childNodes).toHaveLength(0)
  })
})
