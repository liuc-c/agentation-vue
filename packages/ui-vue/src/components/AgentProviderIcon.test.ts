import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import { Icon } from "@iconify/vue"
import AgentProviderIcon from "./AgentProviderIcon.vue"

type AgentProviderIconProps = {
  icon?: string
  label: string
  light?: boolean
  size?: number
}

function mountIcon(props: AgentProviderIconProps) {
  return mount(AgentProviderIcon, {
    props,
  })
}

describe("AgentProviderIcon", () => {
  it("renders the requested icon when it exists", () => {
    const wrapper = mountIcon({
      icon: "vscode-icons:file-type-claude",
      label: "Claude",
    })

    expect(wrapper.getComponent(Icon).props("icon")).toBe("vscode-icons:file-type-claude")
  })

  it("falls back to the dark default icon when icon matching fails", () => {
    const wrapper = mountIcon({
      icon: "vscode-icons:not-real",
      label: "Unknown agent",
    })

    expect(wrapper.getComponent(Icon).props("icon")).toBe("vscode-icons:file-type-agents")
  })

  it("falls back to the light default icon in light mode when icon matching fails", () => {
    const wrapper = mountIcon({
      icon: "vscode-icons:not-real",
      label: "Unknown agent",
      light: true,
    })

    expect(wrapper.getComponent(Icon).props("icon")).toBe("vscode-icons:file-type-light-agents")
  })
})
