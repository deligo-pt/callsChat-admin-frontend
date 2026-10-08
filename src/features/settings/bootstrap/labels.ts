import type {
  BootstrapAppType,
  BootstrapPlatform,
  BootstrapRecordKey,
} from '@/types/bootstrap'

/**
 * How a bootstrap record is named on screen (plan.md §4.2, phase D5).
 *
 * ⚠️ **One helper, because the alternative was three copies of a ternary that
 * had already gone stale.** Before D5 the confirmation dialogs behind the three
 * product-stopping switches each built their own label from `platform` alone,
 * and read "Every Android client is blocked behind an update wall". That was
 * true when there were two records. With four it is ambiguous in the worst
 * place available: an operator blacking out **Business** saw the identical
 * sentence they would have seen for **Personal** — the one record of the four
 * that is live for real users (plan.md §2.1).
 *
 * The switch itself was never wrong: `DangerousSwitch` has sent both keys since
 * D1, so the write always landed on the right record. Only the sentence asking
 * the operator to confirm it was under-specified — which is the half a person
 * actually reads before stopping the product.
 */

export const PLATFORM_LABEL: Readonly<Record<BootstrapPlatform, string>> = {
  ANDROID: 'Android',
  IOS: 'iOS',
}

export const APP_TYPE_LABEL: Readonly<Record<BootstrapAppType, string>> = {
  PERSONAL: 'Personal',
  BUSINESS: 'Business',
}

/**
 * `"Business Android"` — the app first, because that is the half that decides
 * whether real users are affected.
 *
 * Takes the whole key rather than two arguments, for the same reason the
 * payload builders do: two adjacent parameters of similar type can be
 * transposed or half-supplied, and a `BootstrapConfig` satisfies this
 * structurally so callers pass the record they already hold.
 */
export function recordLabel(key: BootstrapRecordKey): string {
  return `${APP_TYPE_LABEL[key.appType]} ${PLATFORM_LABEL[key.platform]}`
}
