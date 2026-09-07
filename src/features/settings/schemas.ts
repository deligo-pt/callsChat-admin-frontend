import { z } from 'zod'

/**
 * Client-side form schemas.
 *
 * These mirror the server's rules where the server has them, and **add rules
 * the server is missing** where a bad value is destructive
 * (system_settings_plan.md §8 O4). Where they add, the comment says so — a
 * client-side rule is UX, not enforcement (plan.md §3.4), and anything with an
 * API client can still write the value.
 */

/** Optional text field: blank is allowed and means "clear this". */
const optionalText = z.string().trim()

/**
 * A URL, or blank.
 *
 * `z.url()` rejects `""`, so the empty case is spelled out — otherwise an
 * operator could never clear a link once set, which is a bug we already have
 * on the server side for `logoUrl` and do not want to reproduce in the form.
 */
const optionalUrl = optionalText.refine(
  (value) => value === '' || /^https?:\/\/\S+\.\S+/.test(value),
  { message: 'Enter a full URL, starting with https://' },
)

export const generalSettingsSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, 'Enter the name shown in the app.')
    /*
     * ADDED — the server accepts a single character (`"x"` was stored during
     * contract testing). This is the brand name every CallsChat client
     * displays, so a typo that leaves one letter behind should not be savable
     * by accident.
     */
    .min(2, 'Use at least 2 characters.')
    .max(60, 'Keep the app name under 60 characters.'),

  supportEmail: z
    .string()
    .trim()
    .min(1, 'A support email address is required.')
    .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: 'Enter a valid email address.',
    }),

  /*
   * ADDED — the server performs NO phone validation at all; `"12345"` was
   * accepted and stored. Users are told to contact this number, so E.164 is
   * enforced here even though the API would take anything.
   */
  supportPhone: optionalText.refine(
    (value) => value === '' || /^\+[1-9]\d{7,14}$/.test(value),
    { message: 'Use international format, e.g. +12025550199.' },
  ),

  tosUrl: optionalUrl,
  privacyPolicyUrl: optionalUrl,
})

export type GeneralSettingsValues = z.infer<typeof generalSettingsSchema>
