import type { ExportExcludeField } from "@liuovo/agentation-vue-core"

export const COPY_EXCLUDE_FIELDS = [
  "projectArea",
  "contextHints",
  "sourceLocation",
  "component",
  "componentHierarchy",
  "framework",
  "elementPath",
  "fullDomPath",
  "cssClasses",
  "position",
  "selectedText",
  "context",
  "computedStyles",
  "accessibility",
  "nearbyElements",
  "url",
  "timestamp",
  "viewport",
  "userAgent",
  "devicePixelRatio",
] as const satisfies readonly ExportExcludeField[]
