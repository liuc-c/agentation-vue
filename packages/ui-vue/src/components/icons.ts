import { h, type CSSProperties, type FunctionalComponent, type VNode } from "vue"
import { Icon, addCollection } from "@iconify/vue"
import lucideIcons from "@iconify-json/lucide/icons.json"

addCollection(lucideIcons)

interface IconProps {
  size?: number
  style?: CSSProperties
}

interface CopyAnimatedProps extends IconProps {
  copied?: boolean
}

interface JsonAnimatedProps extends IconProps {
  copied?: boolean
}

type LucideIconName =
  | "lucide:arrow-left"
  | "lucide:arrow-right"
  | "lucide:braces"
  | "lucide:check"
  | "lucide:circle-check-big"
  | "lucide:copy"
  | "lucide:external-link"
  | "lucide:eye"
  | "lucide:eye-off"
  | "lucide:file-text"
  | "lucide:history"
  | "lucide:layout-dashboard"
  | "lucide:moon"
  | "lucide:pause"
  | "lucide:play"
  | "lucide:circle-question-mark"
  | "lucide:refresh-cw"
  | "lucide:send"
  | "lucide:settings-2"
  | "lucide:sun"
  | "lucide:trash-2"
  | "lucide:workflow"
  | "lucide:x"

function iconBoxStyle(size?: number, style?: CSSProperties): CSSProperties {
  const resolvedSize = size ?? 18
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${resolvedSize}px`,
    height: `${resolvedSize}px`,
    flexShrink: 0,
    ...(style ?? {}),
  }
}

function renderIconSvg(
  icon: LucideIconName,
  size: number,
  style?: CSSProperties,
): VNode {
  return h(Icon, {
    icon,
    width: size,
    height: size,
    style: {
      display: "block",
      ...(style ?? {}),
    },
  })
}

function renderIcon(icon: LucideIconName, props: IconProps = {}): VNode {
  const size = props.size ?? 18

  return h("span", {
    "aria-hidden": "true",
    style: iconBoxStyle(size, props.style),
  }, [
    renderIconSvg(icon, size),
  ])
}

function renderLayer(
  icon: LucideIconName,
  size: number,
  active: boolean,
  style?: CSSProperties,
): VNode {
  return h("span", {
    "aria-hidden": "true",
    style: {
      position: "absolute",
      inset: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: active ? 1 : 0,
      transform: active ? "scale(1)" : "scale(0.82)",
      transformOrigin: "center",
      transition: "opacity 0.18s ease, transform 0.18s ease",
      ...(style ?? {}),
    },
  }, [
    renderIconSvg(icon, size),
  ])
}

function renderAnimatedPair(
  inactiveIcon: LucideIconName,
  activeIcon: LucideIconName,
  active: boolean,
  props: IconProps = {},
  activeStyle?: CSSProperties,
): VNode {
  const size = props.size ?? 18

  return h("span", {
    "aria-hidden": "true",
    style: {
      ...iconBoxStyle(size, props.style),
      position: "relative",
    },
  }, [
    renderLayer(inactiveIcon, size, !active),
    renderLayer(activeIcon, size, active, activeStyle),
  ])
}

export const IconListSparkle: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:layout-dashboard", props)

export const IconCopyAnimated: FunctionalComponent<CopyAnimatedProps> = (props) =>
  renderAnimatedPair("lucide:copy", "lucide:circle-check-big", props.copied ?? false, props, { color: "#22c55e" })

export const IconMarkdown: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:file-text", props)

export const IconMarkdownAnimated: FunctionalComponent<CopyAnimatedProps> = (props) =>
  renderAnimatedPair("lucide:file-text", "lucide:circle-check-big", props.copied ?? false, props, { color: "#22c55e" })

export const IconTrashAlt: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:trash-2", props)

export const IconEye: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:eye", props)

export const IconEyeOff: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:eye-off", props)

export const IconEyeAnimated: FunctionalComponent<{ isOpen?: boolean } & IconProps> = (props) =>
  renderAnimatedPair("lucide:eye-off", "lucide:eye", props.isOpen ?? true, props)

export const IconPause: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:pause", props)

export const IconPlay: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:play", props)

export const IconGear: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:settings-2", props)

export const IconConnectedNodes: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:workflow", props)

export const IconPaperPlane: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:send", props)

export const IconClockList: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:history", props)

export const IconCheckCircle: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:circle-check-big", props)

export const IconXmarkLarge: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:x", props)

export const IconSun: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:sun", props)

export const IconMoon: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:moon", props)

export const IconPausePlayAnimated: FunctionalComponent<{ isPaused?: boolean } & IconProps> = (props) =>
  renderAnimatedPair("lucide:pause", "lucide:play", props.isPaused ?? false, props)

export const IconCheckSmallAnimated: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:check", props)

export const IconClose: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:x", props)

export const IconJson: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:braces", props)

export const IconHelp: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:circle-question-mark", props)

export const IconChevronLeft: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:arrow-left", props)

export const IconChevronRight: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:arrow-right", props)

export const IconJsonAnimated: FunctionalComponent<JsonAnimatedProps> = (props) =>
  renderAnimatedPair("lucide:braces", "lucide:circle-check-big", props.copied ?? false, props, { color: "#22c55e" })

export const IconExternalLink: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:external-link", props)

export const IconRefresh: FunctionalComponent<IconProps> = (props) =>
  renderIcon("lucide:refresh-cw", props)
