import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { isAppError } from '@/api/errors'
import { parseFieldErrors } from '@/types/common'

/**
 * Attribute a server validation failure to the fields it names.
 *
 * This API embeds its field detail in the message string rather than a
 * `details[]` array — `"body/email Valid email address is required,
 * body/password Password must be at least 8 characters long"` — which
 * `parseFieldErrors` recovers (plan.md §10.2).
 *
 * Only fields the caller declares are set, so a message naming something the
 * form does not render cannot produce an error nobody can see or clear.
 *
 * Returns whether anything matched. **Callers must render the raw message too**
 * when it did not: the parse is best-effort, and a message it cannot split
 * would otherwise be swallowed entirely.
 *
 * Promoted from `features/settings/schemas.ts` in A2, when staff provisioning
 * needed the same mapping and a feature may not import a sibling feature.
 */
export function applyServerFieldErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
  knownFields: readonly string[],
): boolean {
  if (!isAppError(error)) return false

  let matched = false
  for (const fieldError of parseFieldErrors(error.message)) {
    if (!knownFields.includes(fieldError.field)) continue
    setError(fieldError.field as Path<TValues>, {
      type: 'server',
      message: fieldError.message,
    })
    matched = true
  }

  return matched
}

/**
 * A rejection that no field can own.
 *
 * Some failures reach a form with nothing to attach to a control: a
 * cross-field check answering `BAD_REQUEST` with no `body/` prefix, the
 * root-level `body/ Expected object, received null`, and every conflict or
 * server error. All of them have to render at form level, or the operator sees
 * a failed submit with no explanation anywhere on screen
 * (system_settings_plan.md §3.2).
 *
 * Returns `null` when the message was field-mapped — those are shown against
 * their own controls, and repeating them here would say everything twice.
 *
 * Split out so the decision is directly testable: some of these shapes are
 * unreachable through the UI, and a rule that cannot be exercised by hand is
 * exactly the one that quietly stops working.
 *
 * Promoted from `features/settings/cardError.ts` in A2, alongside
 * {@link applyServerFieldErrors} — the two are halves of one decision, and
 * splitting them across layers is how they drift apart.
 */
export function formLevelMessage(
  error: unknown,
  fallback = 'The change could not be saved. Please try again.',
): string | null {
  if (!error) return null
  if (!isAppError(error)) return fallback

  if (parseFieldErrors(error.message).length > 0) return null

  return error.message
}
