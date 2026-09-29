import { z } from 'zod'

import { envelopeSchema, idSchema, isoDateTime } from './common'

/**
 * Bootstrap Configuration contract (plan.md §2).
 *
 * VERIFIED against `https://api.callschat.com/api/v1` on 2026-09-28 with a
 * `SUPER_ADMIN` token: both admin routes and the public route, every field
 * written and restored, and every rejection below reproduced from the API's own
 * message. Where the written doc and the live service disagreed, the live
 * service won (plan.md §2.7).
 *
 * This is the record **every mobile client reads before it renders anything**.
 * Three of its fields can stop the product (plan.md §3.10), and a save is
 * visible on the unauthenticated public endpoint on the very next request —
 * there is no draft and no staging.
 */

/* -------------------------------------------------------------------------
 * Enums
 * ---------------------------------------------------------------------- */

/**
 * The two platform records.
 *
 * ⚠️ The API's enum is actually `ANDROID | IOS | android | ios` — all four are
 * accepted, on both read and write. The panel narrows to the upper-case pair
 * deliberately: two spellings of one value is how a store ends up holding both,
 * and nothing is gained by letting this client be the source of that.
 */
export const bootstrapPlatformSchema = z.enum(['ANDROID', 'IOS'])
export type BootstrapPlatform = z.infer<typeof bootstrapPlatformSchema>

export const BOOTSTRAP_PLATFORMS = bootstrapPlatformSchema.options

/** What the server tells a client to do about its version (plan.md §2.5). */
export const updateStatusSchema = z.enum(['none', 'optional', 'forced'])
export type UpdateStatus = z.infer<typeof updateStatusSchema>

/* -------------------------------------------------------------------------
 * The record
 * ---------------------------------------------------------------------- */

/**
 * `GET /admin/bootstrap?platform=…` — one platform's configuration.
 *
 * ⚠️ **The three URL fields are plain `z.string()`, not `z.url()`**, and that
 * is deliberate (plan.md §3.2). The backend validates none of them:
 * `{"storeUrl":"javascript:alert(1)"}` was accepted, stored, and served from
 * the unauthenticated public endpoint, verified 2026-09-28. Rejecting such a
 * value at the contract boundary would blank the whole screen — including the
 * maintenance switch an operator may be reaching for — over one poisoned
 * field. It is accepted, carried, and defused at render time, exactly as
 * `features/feedback/attachments.ts` handles an attachment URL.
 */
export const bootstrapConfigSchema = z.object({
  id: idSchema,
  platform: bootstrapPlatformSchema,

  /**
   * Auto-increments on **every** successful `PATCH`, including one that
   * changes nothing — verified: it moved 1 → 21 during contract verification.
   *
   * It is the only optimistic-concurrency signal the API offers, and the API
   * does not accept it back (plan.md §3.5), so the panel can detect a
   * concurrent write after the fact but cannot prevent one.
   */
  configVersion: z.number().int().nonnegative(),

  maintenanceMode: z.boolean(),
  /** Cleared by **both** `null` and `""` — the server stores `null` for each. */
  maintenanceMessage: z.string().nullable(),

  minSupportedVersion: z.string(),
  latestVersion: z.string(),
  minBuildNumber: z.number().int(),
  latestBuildNumber: z.number().int(),
  forceUpdate: z.boolean(),
  /** ⚠️ Unvalidated by the server. See the note above. */
  storeUrl: z.string(),

  /**
   * ⚠️ Accepts entries that are **not** valid SemVer — `["garbage","1.2"]` was
   * stored (plan.md §3.4). Such an entry matches no client, so an operator
   * believes a bad build is barred when it is not. Carried as written and
   * flagged at render.
   */
  blockedVersions: z.array(z.string()),

  forceLogout: z.boolean(),
  forceLogoutBeforeVersion: z.string().nullable(),

  /**
   * ⚠️ Present on the **iOS** record too, where it means nothing, and there is
   * no `minIosVersion` counterpart (plan.md §3.9).
   */
  minAndroidSdk: z.number().int(),

  /** ⚠️ Unvalidated by the server. */
  privacyPolicyUrl: z.string(),
  /** ⚠️ Unvalidated by the server. */
  termsUrl: z.string(),
  supportEmail: z.string(),

  /**
   * Open map — the server accepts any key with a boolean value, and rejects a
   * non-boolean (`{"chat":"yes"}` → 400). A brand-new key was accepted and
   * stored, so the panel renders what exists rather than a fixed catalogue.
   */
  features: z.record(z.string(), z.boolean()),

  createdAt: isoDateTime,
  updatedAt: isoDateTime,

  /**
   * ⚠️ A **bare id**, not an expanded actor, and `null` on a record nobody has
   * edited. The panel cannot turn it into a name without guessing which
   * directory it belongs to, so it renders the id (plan.md §3.6).
   */
  updatedBy: idSchema.nullable(),
})

export type BootstrapConfig = z.infer<typeof bootstrapConfigSchema>

export const bootstrapConfigResponseSchema = envelopeSchema(bootstrapConfigSchema)

/**
 * `PATCH /admin/bootstrap` answers with the same record plus a message.
 *
 * Unlike the feedback module's mutation responses, this one was stable across
 * every probe — but it is still not rendered. `configVersion` is read back from
 * it to detect a concurrent write (plan.md §3.5); the screen is drawn from a
 * refetch.
 */
export const bootstrapUpdateResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: bootstrapConfigSchema,
})

/* -------------------------------------------------------------------------
 * The public payload — NOT consumed by this panel
 * ---------------------------------------------------------------------- */

/**
 * `GET /bootstrap` — what a mobile client actually receives, in snake_case.
 *
 * **The panel does not call this route** (plan.md §1.2, §3.8): CORS forbids the
 * `app-version`, `build-number` and `platform` headers from a browser, so the
 * server would evaluate against no client version at all and the answer would
 * be meaningless.
 *
 * The schema is kept because it is the contract `evaluate.ts` reproduces, and a
 * captured fixture parsed against it is what proves the local calculation still
 * matches the server's. If it ever stops matching, a test says so.
 */
export const publicBootstrapSchema = z.object({
  config_version: z.number().int().nonnegative(),
  server_time: isoDateTime,
  maintenance_mode: z.boolean(),
  maintenance_message: z.string().nullable(),
  update: z.object({
    status: updateStatusSchema,
    min_supported_version: z.string(),
    latest_version: z.string(),
    min_build_number: z.number().int(),
    latest_build_number: z.number().int(),
    store_url: z.string(),
  }),
  blocked_versions: z.array(z.string()),
  session: z.object({
    force_logout: z.boolean(),
    force_logout_before_version: z.string().nullable(),
  }),
  min_android_sdk: z.number().int(),
  legal: z.object({
    privacy_policy_url: z.string(),
    terms_url: z.string(),
    support_email: z.string(),
  }),
  features: z.record(z.string(), z.boolean()),
})

export type PublicBootstrap = z.infer<typeof publicBootstrapSchema>

/* -------------------------------------------------------------------------
 * Request shapes
 * ---------------------------------------------------------------------- */

/**
 * `PATCH /admin/bootstrap`.
 *
 * ⚠️ **`platform` is required here and optional on the wire**, and that
 * inversion is the point. `PATCH {}` returns 200 and writes to the **Android**
 * record (plan.md §3.3) — a form that forgets the field, or a retry that drops
 * it, edits the wrong platform in silence. Making it required in the type means
 * the compiler refuses the body the server would have accepted.
 *
 * ⚠️ **`features` and `blockedVersions` are complete values, never partials.**
 * The server *replaces* both rather than merging them: sending
 * `{"features":{"chat":false}}` **deleted `calls` and `signup`**, verified
 * 2026-09-28 (plan.md §2.4). Every other field merges. That inconsistency is
 * the most dangerous thing about this API for a form to get wrong, so the type
 * names it and `plan.md` §5.4 makes the card hold the whole map in state.
 */
export interface UpdateBootstrapPayload {
  readonly platform: BootstrapPlatform

  readonly maintenanceMode?: boolean
  readonly maintenanceMessage?: string | null

  readonly minSupportedVersion?: string
  readonly latestVersion?: string
  readonly minBuildNumber?: number
  readonly latestBuildNumber?: number
  readonly forceUpdate?: boolean
  readonly storeUrl?: string

  /** ⚠️ Replaces. Send every entry you intend to keep. */
  readonly blockedVersions?: readonly string[]

  readonly forceLogout?: boolean
  readonly forceLogoutBeforeVersion?: string | null

  /** Android only — the field exists on the iOS record but means nothing. */
  readonly minAndroidSdk?: number

  readonly privacyPolicyUrl?: string
  readonly termsUrl?: string
  readonly supportEmail?: string

  /** ⚠️ Replaces. Send every flag you intend to keep. */
  readonly features?: Readonly<Record<string, boolean>>
}

/* -------------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */

/**
 * The only scheme the panel will save, or turn into a link.
 *
 * The server validates none of the three URL fields, and they are served to
 * mobile clients from a public endpoint behind our own certificate
 * (plan.md §3.2).
 */
export const BOOTSTRAP_URL_PROTOCOL = 'https:'

/** `body/minBuildNumber Number must be greater than or equal to 1`. */
export const MIN_BUILD_NUMBER = 1

/** The three switches that can stop the product (plan.md §3.10). */
export const DANGEROUS_SWITCHES = [
  'maintenanceMode',
  'forceUpdate',
  'forceLogout',
] as const satisfies readonly (keyof BootstrapConfig)[]

export type DangerousSwitch = (typeof DANGEROUS_SWITCHES)[number]
