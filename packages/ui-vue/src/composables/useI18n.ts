import { computed, toValue, type MaybeRefOrGetter } from "vue"
import { DEFAULT_LOCALE, isValidLocale, resolveMessages } from "../i18n/index.js"
import type { Locale, Messages } from "../i18n/types.js"

export interface I18nState {
  /** Current resolved locale. */
  readonly locale: Locale
  /** Message catalog for the current locale. */
  readonly messages: Messages
}

/**
 * Creates a reactive i18n state derived from a locale source.
 * Falls back to English when the source value is invalid.
 */
export function createI18nState(
  locale: MaybeRefOrGetter<Locale | string | undefined>,
): I18nState {
  const resolvedLocale = computed<Locale>(() => {
    const value = toValue(locale)
    return isValidLocale(value) ? value : DEFAULT_LOCALE
  })

  const messages = computed(() => resolveMessages(resolvedLocale.value))

  return {
    get locale() { return resolvedLocale.value },
    get messages() { return messages.value },
  }
}
