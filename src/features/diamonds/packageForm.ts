import { z } from 'zod'

import type {
  CreatePackagePayload,
  DiamondPackage,
  UpdatePackagePayload,
} from '@/types/wallet'

/**
 * The package form's own contract (plan.md §5, phase W4).
 *
 * ⚠️ **Separate from `createPackageSchema` in `types/wallet.ts`, deliberately.**
 * That one models the *wire*: numbers are numbers, because that is what the
 * server receives. This one models a *form*, where every control hands back a
 * string and an empty optional field is `''` rather than absent. Validating
 * form state against a wire schema is how `priceUsd: ''` becomes
 * `Expected number, received string` in a toast instead of under the field
 * that caused it.
 *
 * The messages are the **server's own wordings**, copied from its 400s, so the
 * panel and the backend cannot disagree about what "invalid" means.
 */

/** A required number field, typed into a text input. */
function requiredNumber(message: string) {
  return z
    .string()
    .trim()
    .min(1, message)
    .refine((value) => Number.isFinite(Number(value)), message)
    .refine((value) => Number(value) > 0, message)
}

/** An optional number field: empty is absent, not zero. */
function optionalNumber(message: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === '' || Number.isFinite(Number(value)), message)
    .refine((value) => value === '' || Number(value) >= 0, message)
}

export const packageFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  diamonds: requiredNumber('Base diamonds must be positive'),
  bonusDiamonds: optionalNumber('Bonus diamonds cannot be negative'),
  priceBdt: requiredNumber('BDT price must be positive'),
  priceUsd: optionalNumber('USD price cannot be negative'),
  badgeText: z.string().trim(),
  /*
   * ⚠️ `sortOrder` may be zero, so it is NOT `requiredNumber`. It is also the
   * field a typo silently reorders the storefront with, which is why it is a
   * number input with a stated meaning rather than a free string.
   */
  sortOrder: z
    .string()
    .trim()
    .min(1, 'Sort order is required')
    .refine(
      (value) => Number.isInteger(Number(value)),
      'Sort order must be a whole number',
    ),
  isActive: z.boolean(),
})

export type PackageFormValues = z.infer<typeof packageFormSchema>

/** Field names `applyServerFieldErrors` is allowed to write to. */
export const PACKAGE_FORM_FIELDS = [
  'title',
  'diamonds',
  'bonusDiamonds',
  'priceBdt',
  'priceUsd',
  'badgeText',
  'sortOrder',
  'isActive',
] as const

export const PACKAGE_FORM_DEFAULTS: PackageFormValues = {
  title: '',
  diamonds: '',
  bonusDiamonds: '',
  priceBdt: '',
  priceUsd: '',
  badgeText: '',
  sortOrder: '',
  isActive: true,
}

function text(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : ''
}

export function toFormValues(record: DiamondPackage): PackageFormValues {
  return {
    title: record.title ?? '',
    diamonds: text(record.diamonds),
    bonusDiamonds: text(record.bonusDiamonds),
    priceBdt: text(record.priceBdt),
    priceUsd: text(record.priceUsd),
    badgeText: record.badgeText ?? '',
    sortOrder: text(record.sortOrder),
    /*
     * ⚠️ Defaults to **false**, not true. A record whose `isActive` came back
     * `null` is not a live package, and defaulting a tri-state to "on" in an
     * edit form is how a withdrawn tier gets republished by someone who only
     * meant to fix a typo in its title.
     */
    isActive: record.isActive === true,
  }
}

/**
 * Form values → the create body.
 *
 * ⚠️ **An empty optional is omitted, never sent as `0` or `null`.** The server
 * treats a missing `bonusDiamonds` as zero itself; sending `null` for
 * `priceUsd` is accepted, but sending `0` would publish a free package. Leaving
 * the key out is the only reading of "the operator did not fill this in" that
 * cannot be mistaken for a value.
 */
export function buildCreatePayload(values: PackageFormValues): CreatePackagePayload {
  return {
    title: values.title.trim(),
    diamonds: Number(values.diamonds),
    priceBdt: Number(values.priceBdt),
    ...(values.bonusDiamonds !== ''
      ? { bonusDiamonds: Number(values.bonusDiamonds) }
      : {}),
    ...(values.priceUsd !== '' ? { priceUsd: Number(values.priceUsd) } : {}),
    ...(values.badgeText !== '' ? { badgeText: values.badgeText.trim() } : {}),
    sortOrder: Number(values.sortOrder),
    isActive: values.isActive,
  }
}

/**
 * Form values → the patch body.
 *
 * ⚠️ **Every field is sent, including the ones that did not change.** `PATCH`
 * here is partial by contract, so a diff would be smaller — but the form is a
 * complete picture of the package, and sending a diff computed against a row
 * that may have changed since the dialog opened is how one operator's edit
 * silently reverts another's. There is no detail route to re-read from, so the
 * full form is the safest thing we can state.
 *
 * `badgeText` is the exception that proves it: cleared in the form, it must be
 * sent as `null` rather than omitted, or clearing a badge would do nothing.
 */
export function buildUpdatePayload(values: PackageFormValues): UpdatePackagePayload {
  return {
    title: values.title.trim(),
    diamonds: Number(values.diamonds),
    priceBdt: Number(values.priceBdt),
    bonusDiamonds: values.bonusDiamonds === '' ? 0 : Number(values.bonusDiamonds),
    priceUsd: values.priceUsd === '' ? null : Number(values.priceUsd),
    badgeText: values.badgeText === '' ? null : values.badgeText.trim(),
    sortOrder: Number(values.sortOrder),
    isActive: values.isActive,
  }
}
