export const EXPORT_EXCLUDE_FIELDS = [
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
] as const

export type ExportExcludeField = typeof EXPORT_EXCLUDE_FIELDS[number]
