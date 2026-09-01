import { isAppError } from '@/api/errors'
import { parseFieldErrors } from '@/types/common'

/**
 * A save rejection that no field can own.
 *
 * Two shapes reach a settings form with nothing to attach to a control: the
 * cross-field language check, which answers `BAD_REQUEST` with no `body/`
 * prefix and no field name, and the root-level
 * `body/ Expected object, received null`. Both have to render at card level or
 * the operator sees a failed save with no explanation anywhere on screen
 * (system_settings_plan.md §3.2).
 *
 * Returns `null` when the message was field-mapped — those are shown against
 * their own controls, and repeating them here would say everything twice.
 *
 * Split out of `SettingsCard` so this decision is directly testable: the
 * cross-field error is now unreachable through the UI, and a rule that cannot
 * be exercised by hand is exactly the one that quietly stops working.
 */
export function formLevelMessage(error: unknown): string | null {
  if (!error) return null
  if (!isAppError(error)) {
    return 'The change could not be saved. Please try again.'
  }

  if (parseFieldErrors(error.message).length > 0) return null

  return error.message
}
