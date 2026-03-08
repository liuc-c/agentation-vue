import { h, type CSSProperties, type FunctionalComponent, type VNodeChild } from "vue"

// ---------------------------------------------------------------------------
// Icon props
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function svg(
  size: number,
  viewBox: string,
  children: VNodeChild[],
  style?: CSSProperties,
) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox,
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      focusable: "false",
      style,
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** List with sparkle — collapsed toolbar icon. */
export const IconListSparkle: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("path", { d: "M11.5 12L5.5 12", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M18.5 6.75L5.5 6.75", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M9.25 17.25L5.5 17.25", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", {
      d: "M16 12.75L16.5179 13.9677C16.8078 14.6494 17.3506 15.1922 18.0323 15.4821L19.25 16L18.0323 16.5179C17.3506 16.8078 16.8078 17.3506 16.5179 18.0323L16 19.25L15.4821 18.0323C15.1922 17.3506 14.6494 16.8078 13.9677 16.5179L12.75 16L13.9677 15.4821C14.6494 15.1922 15.1922 14.6494 15.4821 13.9677L16 12.75Z",
      stroke: "currentColor", "stroke-width": 1.5, "stroke-linejoin": "round",
    }),
  ], props.style)
}

/** Animated copy icon — cross-fades between copy and green checkmark circle. */
export const IconCopyAnimated: FunctionalComponent<CopyAnimatedProps> = (props) => {
  const s = props.size ?? 24
  const copied = props.copied ?? false
  const transition = "opacity 0.2s ease, transform 0.2s ease"

  return svg(s, "0 0 24 24", [
    // Copy state
    h("g", { style: { opacity: copied ? 0 : 1, transform: copied ? "scale(0.8)" : "scale(1)", transformOrigin: "center", transition } }, [
      h("path", { d: "M4.75 11.25C4.75 10.4216 5.42157 9.75 6.25 9.75H12.75C13.5784 9.75 14.25 10.4216 14.25 11.25V17.75C14.25 18.5784 13.5784 19.25 12.75 19.25H6.25C5.42157 19.25 4.75 18.5784 4.75 17.75V11.25Z", stroke: "currentColor", "stroke-width": 1.5 }),
      h("path", { d: "M17.25 14.25H17.75C18.5784 14.25 19.25 13.5784 19.25 12.75V6.25C19.25 5.42157 18.5784 4.75 17.75 4.75H11.25C10.4216 4.75 9.75 5.42157 9.75 6.25V6.75", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
    ]),
    // Checkmark state
    h("g", { style: { opacity: copied ? 1 : 0, transform: copied ? "scale(1)" : "scale(0.8)", transformOrigin: "center", transition } }, [
      h("path", { d: "M12 20C7.58172 20 4 16.4182 4 12C4 7.58172 7.58172 4 12 4C16.4182 4 20 7.58172 20 12C20 16.4182 16.4182 20 12 20Z", stroke: "#22c55e", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      h("path", { d: "M15 10L11 14.25L9.25 12.25", stroke: "#22c55e", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    ]),
  ], props.style)
}

/** Markdown/file-text icon — Lucide-style document outline. */
export const IconMarkdown: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 18
  return svg(s, "0 0 20 20", [
    h("path", {
      d: "M7 2.75H10.9393C11.3369 2.75 11.7182 2.90804 12 3.18934L14.8107 6C15.092 6.28181 15.25 6.66304 15.25 7.06066V16.25C15.25 17.0784 14.5784 17.75 13.75 17.75H7C6.17157 17.75 5.5 17.0784 5.5 16.25V4.25C5.5 3.42157 6.17157 2.75 7 2.75Z",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("path", {
      d: "M11 2.75V5.75C11 6.30228 11.4477 6.75 12 6.75H15",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("path", {
      d: "M7.75 10.25H13",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
    }),
    h("path", {
      d: "M7.75 13H13",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
    }),
    h("path", {
      d: "M7.75 15.75H11.25",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
    }),
  ], props.style)
}

/** Animated markdown icon — cross-fades between file-text and green checkmark. */
export const IconMarkdownAnimated: FunctionalComponent<CopyAnimatedProps> = (props) => {
  const s = props.size ?? 20
  const copied = props.copied ?? false
  const transition = "opacity 0.2s ease, transform 0.2s ease"

  return svg(s, "0 0 20 20", [
    h("g", { style: { opacity: copied ? 0 : 1, transform: copied ? "scale(0.82)" : "scale(1)", transformOrigin: "center", transition } }, [
      h("path", {
        d: "M7 2.75H10.9393C11.3369 2.75 11.7182 2.90804 12 3.18934L14.8107 6C15.092 6.28181 15.25 6.66304 15.25 7.06066V16.25C15.25 17.0784 14.5784 17.75 13.75 17.75H7C6.17157 17.75 5.5 17.0784 5.5 16.25V4.25C5.5 3.42157 6.17157 2.75 7 2.75Z",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
      h("path", {
        d: "M11 2.75V5.75C11 6.30228 11.4477 6.75 12 6.75H15",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
      h("path", {
        d: "M7.75 10.25H13",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
      h("path", {
        d: "M7.75 13H13",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
      h("path", {
        d: "M7.75 15.75H11.25",
        stroke: "currentColor",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
    ]),
    h("g", { style: { opacity: copied ? 1 : 0, transform: copied ? "scale(1)" : "scale(0.82)", transformOrigin: "center", transition } }, [
      h("path", {
        d: "M10 17A7 7 0 1 0 10 3a7 7 0 0 0 0 14Z",
        stroke: "#22c55e",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
      h("path", {
        d: "M13 8.5L9.5 12L7.75 10.25",
        stroke: "#22c55e",
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    ]),
  ], props.style)
}

/** Trash icon — filled style. */
export const IconTrashAlt: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 24 24", [
    h("path", {
      d: "M13.5 4C14.7426 4 15.75 5.00736 15.75 6.25V7H18.5C18.9142 7 19.25 7.33579 19.25 7.75C19.25 8.16421 18.9142 8.5 18.5 8.5H17.9678L17.6328 16.2217C17.61 16.7475 17.5912 17.1861 17.5469 17.543C17.5015 17.9087 17.4225 18.2506 17.2461 18.5723C16.9747 19.0671 16.5579 19.4671 16.0518 19.7168C15.7227 19.8791 15.3772 19.9422 15.0098 19.9717C14.6514 20.0004 14.2126 20 13.6865 20H10.3135C9.78735 20 9.34856 20.0004 8.99023 19.9717C8.62278 19.9422 8.27729 19.8791 7.94824 19.7168C7.44205 19.4671 7.02532 19.0671 6.75391 18.5723C6.57751 18.2506 6.49853 17.9087 6.45312 17.543C6.40883 17.1861 6.39005 16.7475 6.36719 16.2217L6.03223 8.5H5.5C5.08579 8.5 4.75 8.16421 4.75 7.75C4.75 7.33579 5.08579 7 5.5 7H8.25V6.25C8.25 5.00736 9.25736 4 10.5 4H13.5ZM7.86621 16.1562C7.89013 16.7063 7.90624 17.0751 7.94141 17.3584C7.97545 17.6326 8.02151 17.7644 8.06934 17.8516C8.19271 18.0763 8.38239 18.2577 8.6123 18.3711C8.70153 18.4151 8.83504 18.4545 9.11035 18.4766C9.39482 18.4994 9.76335 18.5 10.3135 18.5H13.6865C14.2367 18.5 14.6052 18.4994 14.8896 18.4766C15.165 18.4545 15.2985 18.4151 15.3877 18.3711C15.6176 18.2577 15.8073 18.0763 15.9307 17.8516C15.9785 17.7644 16.0245 17.6326 16.0586 17.3584C16.0938 17.0751 16.1099 16.7063 16.1338 16.1562L16.4668 8.5H7.5332L7.86621 16.1562ZM9.97656 10.75C10.3906 10.7371 10.7371 11.0626 10.75 11.4766L10.875 15.4766C10.8879 15.8906 10.5624 16.2371 10.1484 16.25C9.73443 16.2629 9.38794 15.9374 9.375 15.5234L9.25 11.5234C9.23706 11.1094 9.56255 10.7629 9.97656 10.75ZM14.0244 10.75C14.4384 10.7635 14.7635 11.1105 14.75 11.5244L14.6201 15.5244C14.6066 15.9384 14.2596 16.2634 13.8457 16.25C13.4317 16.2365 13.1067 15.8896 13.1201 15.4756L13.251 11.4756C13.2645 11.0617 13.6105 10.7366 14.0244 10.75ZM10.5 5.5C10.0858 5.5 9.75 5.83579 9.75 6.25V7H14.25V6.25C14.25 5.83579 13.9142 5.5 13.5 5.5H10.5Z",
      fill: "currentColor",
    }),
  ], props.style)
}

/** Eye icon — Lucide-style visible state. */
export const IconEye: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("path", {
      d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("circle", {
      cx: 12,
      cy: 12,
      r: 3,
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  ], props.style)
}

/** Eye-off icon — Lucide-style hidden state. */
export const IconEyeOff: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("path", {
      d: "M10.733 5.076A10.744 10.744 0 0 1 21.938 12 10.75 10.75 0 0 1 18.084 16.268",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("path", {
      d: "M14.084 14.158a3 3 0 0 1-4.242-4.242",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("path", {
      d: "M17.479 17.499A10.75 10.75 0 0 1 2.062 12 10.75 10.75 0 0 1 6.17 7.412",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
    h("path", {
      d: "m2 2 20 20",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  ], props.style)
}

/** Animated eye icon — cross-fades between open and closed (with slash). */
export const IconEyeAnimated: FunctionalComponent<{ isOpen?: boolean } & IconProps> = (props) => {
  const s = props.size ?? 24
  const isOpen = props.isOpen ?? true

  return svg(s, "0 0 24 24", [
    // Open state
    h("g", { style: { opacity: isOpen ? 1 : 0, transition: "opacity 0.2s ease" } }, [
      h("path", { d: "M3.91752 12.7539C3.65127 12.2996 3.65037 11.7515 3.9149 11.2962C4.9042 9.59346 7.72688 5.49994 12 5.49994C16.2731 5.49994 19.0958 9.59346 20.0851 11.2962C20.3496 11.7515 20.3487 12.2996 20.0825 12.7539C19.0908 14.4459 16.2694 18.4999 12 18.4999C7.73064 18.4999 4.90918 14.4459 3.91752 12.7539Z", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      h("path", { d: "M12 14.8261C13.5608 14.8261 14.8261 13.5608 14.8261 12C14.8261 10.4392 13.5608 9.17392 12 9.17392C10.4392 9.17392 9.17391 10.4392 9.17391 12C9.17391 13.5608 10.4392 14.8261 12 14.8261Z", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    ]),
    // Closed state (with slash)
    h("g", { style: { opacity: isOpen ? 0 : 1, transition: "opacity 0.2s ease" } }, [
      h("path", { d: "M18.6025 9.28503C18.9174 8.9701 19.4364 8.99481 19.7015 9.35271C20.1484 9.95606 20.4943 10.507 20.7342 10.9199C21.134 11.6086 21.1329 12.4454 20.7303 13.1328C20.2144 14.013 19.2151 15.5225 17.7723 16.8193C16.3293 18.1162 14.3852 19.2497 12.0008 19.25C11.4192 19.25 10.8638 19.1823 10.3355 19.0613C9.77966 18.934 9.63498 18.2525 10.0382 17.8493C10.2412 17.6463 10.5374 17.573 10.8188 17.6302C11.1993 17.7076 11.5935 17.75 12.0008 17.75C13.8848 17.7497 15.4867 16.8568 16.7693 15.7041C18.0522 14.5511 18.9606 13.1867 19.4363 12.375C19.5656 12.1543 19.5659 11.8943 19.4373 11.6729C19.2235 11.3049 18.921 10.8242 18.5364 10.3003C18.3085 9.98991 18.3302 9.5573 18.6025 9.28503ZM12.0008 4.75C12.5814 4.75006 13.1358 4.81803 13.6632 4.93953C14.2182 5.06741 14.362 5.74812 13.9593 6.15091C13.7558 6.35435 13.4589 6.42748 13.1771 6.36984C12.7983 6.29239 12.4061 6.25006 12.0008 6.25C10.1167 6.25 8.51415 7.15145 7.23028 8.31543C5.94678 9.47919 5.03918 10.8555 4.56426 11.6729C4.43551 11.8945 4.43582 12.1542 4.56524 12.375C4.77587 12.7343 5.07189 13.2012 5.44718 13.7105C5.67623 14.0213 5.65493 14.4552 5.38193 14.7282C5.0671 15.0431 4.54833 15.0189 4.28292 14.6614C3.84652 14.0736 3.50813 13.5369 3.27129 13.1328C2.86831 12.4451 2.86717 11.6088 3.26739 10.9199C3.78185 10.0345 4.77959 8.51239 6.22247 7.2041C7.66547 5.89584 9.61202 4.75 12.0008 4.75Z", fill: "currentColor" }),
      h("path", { d: "M5 19L19 5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
    ]),
  ], props.style)
}

/** Pause icon — Lucide-style paused state. */
export const IconPause: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("rect", {
      x: 6,
      y: 4,
      width: 4,
      height: 16,
      rx: 1,
      fill: "currentColor",
    }),
    h("rect", {
      x: 14,
      y: 4,
      width: 4,
      height: 16,
      rx: 1,
      fill: "currentColor",
    }),
  ], props.style)
}

/** Play icon — Lucide-style resume state. */
export const IconPlay: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("path", {
      d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
      fill: "currentColor",
    }),
  ], props.style)
}

/** Gear / settings icon. */
export const IconGear: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 24 24", [
    h("path", { d: "M10.6504 5.81117C10.9939 4.39628 13.0061 4.39628 13.3496 5.81117C13.5715 6.72517 14.6187 7.15891 15.4219 6.66952C16.6652 5.91193 18.0881 7.33479 17.3305 8.57815C16.8411 9.38134 17.2748 10.4285 18.1888 10.6504C19.6037 10.9939 19.6037 13.0061 18.1888 13.3496C17.2748 13.5715 16.8411 14.6187 17.3305 15.4219C18.0881 16.6652 16.6652 18.0881 15.4219 17.3305C14.6187 16.8411 13.5715 17.2748 13.3496 18.1888C13.0061 19.6037 10.9939 19.6037 10.6504 18.1888C10.4285 17.2748 9.38135 16.8411 8.57815 17.3305C7.33479 18.0881 5.91193 16.6652 6.66952 15.4219C7.15891 14.6187 6.72517 13.5715 5.81117 13.3496C4.39628 13.0061 4.39628 10.9939 5.81117 10.6504C6.72517 10.4285 7.15891 9.38134 6.66952 8.57815C5.91193 7.33479 7.33479 5.91192 8.57815 6.66952C9.38135 7.15891 10.4285 6.72517 10.6504 5.81117Z", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("circle", { cx: 12, cy: 12, r: 2.5, stroke: "currentColor", "stroke-width": 1.5 }),
  ], props.style)
}

/** Connected nodes icon — used for MCP & webhooks controls. */
export const IconConnectedNodes: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 18
  return svg(s, "0 0 24 24", [
    h("path", { d: "M9.25 7H14.75", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
    h("path", { d: "M8.89062 8.54688L11.25 14", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
    h("path", { d: "M15.1094 8.54688L12.75 14", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
    h("circle", { cx: 7, cy: 7, r: 2.25, stroke: "currentColor", "stroke-width": 1.5 }),
    h("circle", { cx: 17, cy: 7, r: 2.25, stroke: "currentColor", "stroke-width": 1.5 }),
    h("circle", { cx: 12, cy: 17, r: 2.25, stroke: "currentColor", "stroke-width": 1.5 }),
  ], props.style)
}

/** Large X mark — close/exit icon (filled). */
export const IconXmarkLarge: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 24
  return svg(s, "0 0 24 24", [
    h("path", { d: "M16.7198 6.21973C17.0127 5.92683 17.4874 5.92683 17.7803 6.21973C18.0732 6.51262 18.0732 6.9874 17.7803 7.28027L13.0606 12L17.7803 16.7197C18.0732 17.0126 18.0732 17.4874 17.7803 17.7803C17.4875 18.0731 17.0127 18.0731 16.7198 17.7803L12.0001 13.0605L7.28033 17.7803C6.98746 18.0731 6.51268 18.0731 6.21979 17.7803C5.92689 17.4874 5.92689 17.0126 6.21979 16.7197L10.9395 12L6.21979 7.28027C5.92689 6.98738 5.92689 6.51262 6.21979 6.21973C6.51268 5.92683 6.98744 5.92683 7.28033 6.21973L12.0001 10.9395L16.7198 6.21973Z", fill: "currentColor" }),
  ], props.style)
}

/** Sun icon — light mode indicator. */
export const IconSun: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 20 20", [
    h("path", { d: "M9.99999 12.7082C11.4958 12.7082 12.7083 11.4956 12.7083 9.99984C12.7083 8.50407 11.4958 7.2915 9.99999 7.2915C8.50422 7.2915 7.29166 8.50407 7.29166 9.99984C7.29166 11.4956 8.50422 12.7082 9.99999 12.7082Z", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M10 3.9585V5.05698", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M10 14.9429V16.0414", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M5.7269 5.72656L6.50682 6.50649", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M13.4932 13.4932L14.2731 14.2731", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M3.95834 10H5.05683", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M14.9432 10H16.0417", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M5.7269 14.2731L6.50682 13.4932", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M13.4932 6.50649L14.2731 5.72656", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ], props.style)
}

/** Moon icon — dark mode indicator. */
export const IconMoon: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 20 20", [
    h("path", { d: "M15.5 10.4955C15.4037 11.5379 15.0124 12.5314 14.3721 13.3596C13.7317 14.1878 12.8688 14.8165 11.8841 15.1722C10.8995 15.5278 9.83397 15.5957 8.81217 15.3679C7.79038 15.1401 6.8546 14.6259 6.11434 13.8857C5.37408 13.1454 4.85995 12.2096 4.63211 11.1878C4.40427 10.166 4.47215 9.10048 4.82781 8.11585C5.18346 7.13123 5.81218 6.26825 6.64039 5.62791C7.4686 4.98756 8.46206 4.59634 9.5045 4.5C8.89418 5.32569 8.60049 6.34302 8.67685 7.36695C8.75321 8.39087 9.19454 9.35339 9.92058 10.0794C10.6466 10.8055 11.6091 11.2468 12.6331 11.3231C13.657 11.3995 14.6743 11.1058 15.5 10.4955Z", stroke: "currentColor", "stroke-width": 1.13793, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ], props.style)
}

/** Animated pause/play — cross-fades between pause bars and play triangle. */
export const IconPausePlayAnimated: FunctionalComponent<{ isPaused?: boolean } & IconProps> = (props) => {
  const s = props.size ?? 24
  const isPaused = props.isPaused ?? false

  return svg(s, "0 0 24 24", [
    // Pause bars
    h("path", { d: "M8 6L8 18", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", style: { opacity: isPaused ? 0 : 1, transition: "opacity 0.15s ease" } }),
    h("path", { d: "M16 18L16 6", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", style: { opacity: isPaused ? 0 : 1, transition: "opacity 0.15s ease" } }),
    // Play triangle
    h("path", { d: "M17.75 10.701C18.75 11.2783 18.75 12.7217 17.75 13.299L8.75 18.4952C7.75 19.0725 6.5 18.3509 6.5 17.1962L6.5 6.80384C6.5 5.64914 7.75 4.92746 8.75 5.50481L17.75 10.701Z", stroke: "currentColor", "stroke-width": 1.5, style: { opacity: isPaused ? 1 : 0, transition: "opacity 0.15s ease" } }),
  ], props.style)
}

/** Small animated checkmark — draw + bounce effect. */
export const IconCheckSmallAnimated: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 14
  return svg(s, "0 0 14 14", [
    h("style", "@keyframes ag-check-draw{0%{stroke-dashoffset:12}to{stroke-dashoffset:0}}@keyframes ag-check-bounce{0%{transform:scale(.5);opacity:0}50%{transform:scale(1.12);opacity:1}75%{transform:scale(.95)}to{transform:scale(1)}}"),
    h("path", {
      d: "M3.9375 7L6.125 9.1875L10.5 4.8125",
      stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round",
      style: {
        strokeDasharray: 12,
        strokeDashoffset: 0,
        transformOrigin: "center",
        animation: "ag-check-draw 0.18s ease-out, ag-check-bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    }),
  ], props.style)
}

/** Small X for close actions. */
export const IconClose: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 16 16", [
    h("path", { d: "M4 4l8 8M12 4l-8 8", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round" }),
  ], props.style)
}

/** JSON bracket icon — for JSON export. */
export const IconJson: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 16 16", [
    h("path", { d: "M4.5 3C3.67 3 3 3.67 3 4.5v2c0 .55-.45 1-1 1v1c.55 0 1 .45 1 1v2c0 .83.67 1.5 1.5 1.5", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("path", { d: "M11.5 3c.83 0 1.5.67 1.5 1.5v2c0 .55.45 1 1 1v1c-.55 0-1 .45-1 1v2c0 .83-.67 1.5-1.5 1.5", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ], props.style)
}

/** Help icon — circle with question mark. */
export const IconHelp: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 20
  return svg(s, "0 0 20 20", [
    h("circle", { cx: 10, cy: 10.5, r: 5.25, stroke: "currentColor", "stroke-width": 1.25 }),
    h("path", { d: "M8.5 8.75C8.5 7.92 9.17 7.25 10 7.25C10.83 7.25 11.5 7.92 11.5 8.75C11.5 9.58 10.83 10.25 10 10.25V11", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    h("circle", { cx: 10, cy: 13, r: 0.75, fill: "currentColor" }),
  ], props.style)
}

/** Left chevron — back navigation. */
export const IconChevronLeft: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 16 16", [
    h("path", { d: "M8.5 3.5L4 8L8.5 12.5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ], props.style)
}

/** Right chevron — forward navigation. */
export const IconChevronRight: FunctionalComponent<IconProps> = (props) => {
  const s = props.size ?? 16
  return svg(s, "0 0 16 16", [
    h("path", { d: "M8.5 11.5L12 8L8.5 4.5", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ], props.style)
}

/** Animated JSON icon — cross-fades between JSON brackets and green checkmark. */
export const IconJsonAnimated: FunctionalComponent<JsonAnimatedProps> = (props) => {
  const s = props.size ?? 16
  const copied = props.copied ?? false
  const transition = "opacity 0.2s ease, transform 0.2s ease"

  return svg(s, "0 0 16 16", [
    // JSON brackets state
    h("g", { style: { opacity: copied ? 0 : 1, transform: copied ? "scale(0.8)" : "scale(1)", transformOrigin: "center", transition } }, [
      h("path", { d: "M4.5 3C3.67 3 3 3.67 3 4.5v2c0 .55-.45 1-1 1v1c.55 0 1 .45 1 1v2c0 .83.67 1.5 1.5 1.5", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      h("path", { d: "M11.5 3c.83 0 1.5.67 1.5 1.5v2c0 .55.45 1 1 1v1c-.55 0-1 .45-1 1v2c0 .83-.67 1.5-1.5 1.5", stroke: "currentColor", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    ]),
    // Green checkmark state
    h("g", { style: { opacity: copied ? 1 : 0, transform: copied ? "scale(1)" : "scale(0.8)", transformOrigin: "center", transition } }, [
      h("path", { d: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Z", stroke: "#22c55e", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      h("path", { d: "M10.5 6.5L7.5 10L5.75 8.25", stroke: "#22c55e", "stroke-width": 1.25, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    ]),
  ], props.style)
}
