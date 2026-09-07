/**
 * Display names for common language codes.
 *
 * A convenience, not a whitelist: the server enforces only a 2-character
 * minimum — there is no ISO check, and `"english"` was accepted during
 * contract testing. An unknown code renders as itself rather than being
 * refused, so this list can lag reality without blocking anyone.
 *
 * Separate from `LanguageEditor` because a module exporting both a component
 * and a plain function breaks Fast Refresh.
 */
const NAMES: Readonly<Record<string, string>> = {
  ar: 'Arabic',
  bn: 'Bengali',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ms: 'Malay',
  nl: 'Dutch',
  pt: 'Portuguese',
  ru: 'Russian',
  th: 'Thai',
  tr: 'Turkish',
  ur: 'Urdu',
  vi: 'Vietnamese',
  zh: 'Chinese',
}

export function languageName(code: string): string | null {
  return NAMES[code.toLowerCase()] ?? null
}
