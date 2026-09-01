/**
 * Payload builders for the settings write routes.
 *
 * This file exists because of one verified inconsistency
 * (system_settings_plan.md §3.1): **clearing a field works in opposite ways on
 * two endpoints.**
 *
 *   PATCH /admin/settings/general
 *     ""   -> stored as null  ✅
 *     null -> accepted        ✅   (except supportEmail, which rejects both)
 *
 *   PATCH /admin/settings/platform
 *     ""   -> 400 "Invalid Google Play Store URL"   ❌
 *     null -> stored as null                        ✅
 *
 * A shared "empty means clear" helper would therefore be correct on one
 * endpoint and silently broken on the other. The sentinel is declared per
 * endpoint here, once, and nowhere else.
 */

import type { AppPlatform } from '@/types/settings'

/**
 * `""` clears on `/general`.
 *
 * Verified: `{"supportPhone":""}` returned `supportPhone: null`. Sending `null`
 * also works for every field here **except** `supportEmail`, which answers
 * `body/supportEmail Expected string, received null` — so `""` is the sentinel
 * that is correct for the whole endpoint rather than most of it.
 */
const GENERAL_CLEAR = '' as const

/**
 * `null` clears on `/platform`.
 *
 * The store URLs are validated as URLs with no empty-string escape hatch, so
 * `""` is rejected outright. `null` is the only way to unset them.
 */
const PLATFORM_CLEAR = null

/** Blank (or whitespace-only) input becomes the endpoint's clear sentinel. */
function orClear<TSentinel extends '' | null>(
  value: string | undefined,
  sentinel: TSentinel,
): string | TSentinel {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : sentinel
}

/* ------------------------------------------------------------------ *
 * General
 * ------------------------------------------------------------------ */

export interface GeneralFormValues {
  readonly appName: string
  readonly supportEmail: string
  readonly supportPhone: string
  readonly tosUrl: string
  readonly privacyPolicyUrl: string
}

/**
 * `appName` and `supportEmail` are sent as typed, never as the clear sentinel:
 * both are non-nullable server-side, and blanking either is a validation error
 * the form must catch first rather than a clear the API would honour.
 */
export function buildGeneralPayload(values: GeneralFormValues) {
  return {
    appName: values.appName.trim(),
    supportEmail: values.supportEmail.trim(),
    supportPhone: orClear(values.supportPhone, GENERAL_CLEAR),
    tosUrl: orClear(values.tosUrl, GENERAL_CLEAR),
    privacyPolicyUrl: orClear(values.privacyPolicyUrl, GENERAL_CLEAR),
  }
}

/* ------------------------------------------------------------------ *
 * Maintenance — same endpoint as General, separate payload
 * ------------------------------------------------------------------ */

export interface MaintenanceFormValues {
  readonly maintenanceMode: boolean
  readonly maintenanceMessage: string
  /** `datetime-local` value, or blank. */
  readonly maintenanceStartsAt: string
  readonly maintenanceEndsAt: string
}

/**
 * The window is sent as a full ISO instant with an offset.
 * `{"maintenanceStartsAt":"2026-09-01"}` is rejected with `Invalid datetime` —
 * a date alone is not enough, which is exactly what an `<input type="date">`
 * would have produced.
 */
export function buildMaintenancePayload(values: MaintenanceFormValues) {
  return {
    maintenanceMode: values.maintenanceMode,
    maintenanceMessage: orClear(values.maintenanceMessage, GENERAL_CLEAR),
    maintenanceStartsAt: toIsoInstant(values.maintenanceStartsAt),
    maintenanceEndsAt: toIsoInstant(values.maintenanceEndsAt),
  }
}

function toIsoInstant(localValue: string): string {
  const trimmed = localValue.trim()
  if (trimmed.length === 0) return GENERAL_CLEAR

  const parsed = new Date(trimmed)
  // An unparseable value goes through untouched so the server's own message wins.
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
}

/* ------------------------------------------------------------------ *
 * Chat & media
 * ------------------------------------------------------------------ */

export interface ChatFormValues {
  readonly maxMediaFileSizeMB: number
  readonly allowedFileTypes: readonly string[]
}

/**
 * The server lowercases, trims and strips a leading dot — but does **not**
 * deduplicate: `["jpg","png","jpg","jpg"]` persisted verbatim. Normalising and
 * deduping here means the list the operator sees is the list that gets stored.
 */
export function normaliseFileType(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\.+/, '')
}

export function buildChatPayload(values: ChatFormValues) {
  const seen = new Set<string>()
  const allowedFileTypes: string[] = []

  for (const entry of values.allowedFileTypes) {
    const normalised = normaliseFileType(entry)
    if (normalised.length === 0 || seen.has(normalised)) continue
    seen.add(normalised)
    allowedFileTypes.push(normalised)
  }

  return { maxMediaFileSizeMB: values.maxMediaFileSizeMB, allowedFileTypes }
}

/* ------------------------------------------------------------------ *
 * Platform & localization
 * ------------------------------------------------------------------ */

export interface PlatformFormValues {
  readonly defaultLanguage: string
  readonly supportedLanguages: readonly string[]
  readonly playStoreUrl: string
  readonly appStoreUrl: string
  readonly paymentEnabled: boolean
  readonly paymentProvider: string
  readonly subscriptionPlansEnabled: boolean
}

export function buildPlatformPayload(values: PlatformFormValues) {
  return {
    defaultLanguage: values.defaultLanguage.trim().toLowerCase(),
    supportedLanguages: [
      ...new Set(values.supportedLanguages.map((code) => code.trim().toLowerCase())),
    ].filter((code) => code.length > 0),
    playStoreUrl: orClear(values.playStoreUrl, PLATFORM_CLEAR),
    appStoreUrl: orClear(values.appStoreUrl, PLATFORM_CLEAR),
    paymentEnabled: values.paymentEnabled,
    paymentProvider: values.paymentProvider.trim(),
    subscriptionPlansEnabled: values.subscriptionPlansEnabled,
  }
}

/* ------------------------------------------------------------------ *
 * App version policy
 * ------------------------------------------------------------------ */

export interface VersionPolicyFormValues {
  readonly platform: AppPlatform
  readonly latestVersion: string
  readonly buildNumber: string
  readonly minRequiredVersion: string
  readonly forceUpdate: boolean
  readonly releaseNotes: string
}

/**
 * Always sends all six keys.
 *
 * This route is a **replace, not a merge**, despite the PATCH verb: sending
 * only the three required fields wiped `buildNumber` (`"1"` -> `null`) and
 * `releaseNotes` (`"Initial release"` -> `null`) on the live iOS policy. So
 * every optional field goes out explicitly, including as `""`, and omitting
 * one is never how this form expresses "leave it alone".
 *
 * `buildNumber` is a string on the wire — `45` is rejected with
 * `body/buildNumber Expected string, received number`.
 */
export function buildVersionPolicyPayload(values: VersionPolicyFormValues) {
  return {
    platform: values.platform,
    latestVersion: values.latestVersion.trim(),
    minRequiredVersion: values.minRequiredVersion.trim(),
    buildNumber: values.buildNumber.trim(),
    forceUpdate: values.forceUpdate,
    releaseNotes: values.releaseNotes.trim(),
  }
}

/* ------------------------------------------------------------------ *
 * SMS gateway
 * ------------------------------------------------------------------ */

export interface SmsFormValues {
  readonly provider: 'BULKGATE' | 'TWILIO' | 'DISABLED'
  readonly isEnabled: boolean
  readonly bulkgateAppId: string
  /** Blank means "keep the stored secret" — never the masked string. */
  readonly bulkgateAppToken: string
  readonly bulkgateSenderId: string
  readonly twilioAccountSid: string
  readonly twilioAuthToken: string
  readonly twilioFromNumber: string
}

/** Masked secrets are rendered as text beside the input, never inside it. */
export function isMaskedSecret(value: string): boolean {
  return value.trimStart().startsWith('•')
}

/**
 * Omits any secret the operator did not retype.
 *
 * The doc says a value starting with `••••` is treated as "keep existing". We
 * do not rely on that: an untouched secret field is simply absent from the
 * payload, so a masked string can never be written back over a real credential
 * even if that server-side check changes or was never implemented.
 *
 * Only the fields relevant to the selected provider are sent, so switching
 * from Twilio back to BulkGate cannot post half-filled Twilio credentials.
 */
export function buildSmsPayload(values: SmsFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    provider: values.provider,
    isEnabled: values.isEnabled,
  }

  const addSecret = (key: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length === 0 || isMaskedSecret(trimmed)) return
    payload[key] = trimmed
  }

  if (values.provider === 'BULKGATE') {
    payload['bulkgateAppId'] = values.bulkgateAppId.trim()
    payload['bulkgateSenderId'] = values.bulkgateSenderId.trim()
    addSecret('bulkgateAppToken', values.bulkgateAppToken)
  }

  if (values.provider === 'TWILIO') {
    payload['twilioAccountSid'] = values.twilioAccountSid.trim()
    payload['twilioFromNumber'] = values.twilioFromNumber.trim()
    addSecret('twilioAuthToken', values.twilioAuthToken)
  }

  return payload
}
