import { en } from "./en.js"
import { zhCN } from "./zh-CN.js"
import type { Locale, Messages } from "./types.js"

export type { Locale, Messages, ColorKey } from "./types.js"

export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const satisfies readonly Locale[]
export const DEFAULT_LOCALE: Locale = "en"

/** Self-identifying labels so the user can always find their language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "en": "EN",
  "zh-CN": "中文",
}

const MESSAGE_CATALOGS: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
}

const localeSet: ReadonlySet<string> = new Set(SUPPORTED_LOCALES)

/** Type guard: returns `true` when `value` is a supported locale string. */
export function isValidLocale(value: unknown): value is Locale {
  return typeof value === "string" && localeSet.has(value)
}

/** Resolve message catalog for a locale; falls back to English silently. */
export function resolveMessages(locale?: string): Messages {
  return MESSAGE_CATALOGS[isValidLocale(locale) ? locale : DEFAULT_LOCALE]
}
