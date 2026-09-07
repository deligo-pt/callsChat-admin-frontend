import { PERMISSIONS, type Permission } from '@/auth/permissions'
import { MODULE_PERMISSION_VALUES, type ModulePermission } from '@/types/staff'

/**
 * The backend's eight module keys, as data — and the bridge to the panel's own
 * permission vocabulary (staff_management_plan.md §4.4).
 *
 * Two vocabularies exist here on purpose, and they will never merge:
 *
 * - **The backend's** — eight coarse `SCREAMING_SNAKE` module keys, one per
 *   API surface, no scoping and no inheritance.
 * - **The panel's** — ~35 fine-grained `dot.notation` action keys in
 *   `auth/permissions.ts`, which drive nav filtering and action guards.
 *
 * They do not line up, in both directions. One `USER_MODERATE` covers four of
 * ours (`usersSuspend`, `usersBan`, `usersRestrict`, `sessionsRevoke`). We
 * carry whole domains the backend has no key for — diamonds, payments,
 * withdrawals, clubs, hosts, notifications, audit logs — consistent with those
 * endpoints still answering 404. And the backend has `BUSINESS_VERIFY`, for a
 * module the panel has not built.
 *
 * Keeping them separate with one explicit, tested bridge is the only honest
 * arrangement. Collapsing them would mean either inventing backend keys that
 * do not exist or silently discarding panel permissions that do.
 */

/* -------------------------------------------------------------------------
 * The eight keys as data
 * ---------------------------------------------------------------------- */

/** Grouping for the permission grid. Presentation order, not a backend concept. */
export type ModulePermissionGroup =
  'Analytics' | 'Users' | 'Support' | 'Business' | 'Platform' | 'Restricted'

/**
 * A key the API enforces but does not let anyone hold.
 *
 * `FEEDBACK_MANAGEMENT` guards `/admin/feedbacks/*`, but it is absent from the
 * enum `POST /admin/staff` and `PATCH /:id/permissions` validate against
 * (feedback_management_plan.md §3.1). It can be required and it cannot be
 * granted.
 *
 * It is deliberately **not** added to `modulePermissionSchema`: that schema is
 * what the panel sends, and widening it would let the grid post a key the API
 * rejects with a validation error the operator cannot act on. So this is a
 * display-only string, typed apart from `ModulePermission` so the compiler
 * keeps the two from mixing.
 */
export type UngrantableModulePermission = 'FEEDBACK_MANAGEMENT'

/** Every key the grid renders — the eight real ones plus the ungrantable one. */
export type DisplayModulePermission = ModulePermission | UngrantableModulePermission

export interface ModulePermissionDescriptor {
  readonly key: DisplayModulePermission
  /** Human label for the grid. Never the raw key. */
  readonly label: string
  readonly group: ModulePermissionGroup
  /**
   * What granting this key actually lets someone do.
   *
   * Mandatory, and rendered on screen rather than in a tooltip
   * (staff_management_plan.md §5.5). `USER_MODERATE` nowhere states that it
   * carries session revocation, and this grid is where a Super Admin decides
   * what a colleague may do to a real person's account.
   */
  readonly description: string
  /**
   * The routes this key names are `verifySuperAdmin`-guarded, so granting it
   * to an ADMIN or MODERATOR buys them nothing.
   *
   * The API still *accepts* the key on a non-Super-Admin, which is why these
   * are shown in the grid — inert and labelled — rather than hidden. Hiding
   * them would leave an operator comparing the doc's eight keys against a grid
   * of six, with no way to tell whether the panel or the doc was out of date.
   */
  readonly superAdminOnly: boolean
  /**
   * The API enforces this key but rejects it on every write, so it can never
   * be granted to anyone (see {@link UngrantableModulePermission}).
   *
   * Rendered like a `superAdminOnly` row — locked, with the reason on screen —
   * but for a different cause, and the row says which. A Super Admin
   * provisioning a support moderator should be able to see that the capability
   * exists and that it cannot yet be delegated, rather than discovering later
   * that their new hire has an invisible inbox.
   */
  readonly ungrantable?: boolean
}

export const MODULE_PERMISSIONS: readonly ModulePermissionDescriptor[] = [
  {
    key: 'DASHBOARD_VIEW',
    label: 'Dashboard & trends',
    group: 'Analytics',
    description: 'View KPIs, user growth trends and call volume metrics.',
    superAdminOnly: false,
  },
  {
    key: 'USER_VIEW',
    label: 'User directory',
    group: 'Users',
    description: 'Search, inspect and export platform users.',
    superAdminOnly: false,
  },
  {
    key: 'USER_MODERATE',
    label: 'User actions',
    group: 'Users',
    description:
      'Suspend, ban and restore users, apply capability restrictions, and revoke their sessions.',
    superAdminOnly: false,
  },
  {
    /*
     * The ninth row, and the only ungrantable one
     * (feedback_management_plan.md §3.1 / §4.4). Shown rather than hidden for
     * the same reason the two Super-Admin-only keys are shown: a grid that
     * silently omits a capability the API enforces leaves an operator unable
     * to tell whether the panel or the documentation is out of date.
     */
    key: 'FEEDBACK_MANAGEMENT',
    label: 'Feedback & support',
    group: 'Support',
    description:
      'Read, triage, assign and answer the support tickets users submit from the app.',
    superAdminOnly: false,
    ungrantable: true,
  },
  {
    key: 'BUSINESS_VERIFY',
    label: 'Business verification',
    group: 'Business',
    description: 'Review, approve and reject business verification requests.',
    superAdminOnly: false,
  },
  {
    key: 'SYSTEM_SETTINGS_EDIT',
    /*
     * "Read and change", not "Edit". The key is named `_EDIT` but it gates the
     * `GET` as well — verified 2026-09-03, when `GET /admin/settings` began
     * answering `403 Missing required module permission 'SYSTEM_SETTINGS_EDIT'`.
     * There is no separate view permission, so a staff member either sees
     * System Settings or does not. Labelling this "Edit" would let an operator
     * believe they were granting read-only access.
     */
    label: 'System settings',
    group: 'Platform',
    description:
      'Read and change app name, branding, support contacts, chat limits and localization.',
    superAdminOnly: false,
  },
  {
    key: 'DEPLOYMENT_EDIT',
    label: 'App releases',
    group: 'Platform',
    description: 'Configure Android and iOS version policies, including force updates.',
    superAdminOnly: false,
  },
  {
    key: 'DATABASE_BACKUP',
    label: 'Database operations',
    group: 'Restricted',
    description: 'Trigger manual database backups and download the archives.',
    superAdminOnly: true,
  },
  {
    key: 'SMS_GATEWAY_EDIT',
    label: 'SMS gateway',
    group: 'Restricted',
    description: 'Configure and test the OTP provider that delivers sign-in codes.',
    superAdminOnly: true,
  },
]

/** Grid render order. `Restricted` sits last because its two keys are inert. */
export const MODULE_PERMISSION_GROUPS: readonly ModulePermissionGroup[] = [
  'Analytics',
  'Users',
  'Support',
  'Business',
  'Platform',
  'Restricted',
]

/**
 * Keys a non-Super-Admin can usefully hold — the grid's editable rows.
 *
 * Excludes both the Super-Admin-only keys and the ungrantable one. The
 * narrowing predicate is what keeps the return type `ModulePermission[]`: the
 * ungrantable key is not a member of that union, and the compiler enforces
 * that it can never reach a request body.
 */
/**
 * Narrow a grid entry to one whose key the API will actually accept.
 *
 * The type predicate is the point: it is the only way a `FEEDBACK_MANAGEMENT`
 * row can be excluded from a request body by the compiler rather than by a
 * reviewer noticing. Everything that builds a `permissions` array goes through
 * it.
 */
export function hasGrantableKey(
  entry: ModulePermissionDescriptor,
): entry is ModulePermissionDescriptor & { key: ModulePermission } {
  return entry.ungrantable !== true
}

export const GRANTABLE_MODULE_PERMISSIONS: readonly ModulePermission[] =
  MODULE_PERMISSIONS.filter(hasGrantableKey)
    .filter((entry) => !entry.superAdminOnly)
    .map((entry) => entry.key)

export function describeModulePermission(
  key: DisplayModulePermission,
): ModulePermissionDescriptor {
  const found = MODULE_PERMISSIONS.find((entry) => entry.key === key)
  /*
   * Unreachable while `modulePermissionSchema` stays strict — a key the panel
   * has never heard of fails contract validation long before it reaches here.
   * Throwing rather than returning a placeholder keeps it that way: a silent
   * fallback would turn a caught contract drift into a blank grid row.
   */
  if (!found) throw new Error(`Unknown module permission: ${key}`)
  return found
}

/** Granted keys in canonical grid order, for stable summaries and labels. */
export function sortModulePermissions(
  keys: readonly ModulePermission[],
): readonly ModulePermission[] {
  const granted = new Set(keys)
  return MODULE_PERMISSION_VALUES.filter((key) => granted.has(key))
}

/* -------------------------------------------------------------------------
 * The bridge — written now, wired in A5
 * ---------------------------------------------------------------------- */

/**
 * What each backend key unlocks in the panel's own vocabulary.
 *
 * One-to-many in most rows, because ours are finer. `BUSINESS_VERIFY` maps to
 * nothing: the panel has no business-verification module yet, and inventing a
 * permission for it would put an entry in the map that no guard reads.
 */
const MODULE_TO_PANEL: Readonly<Record<ModulePermission, readonly Permission[]>> = {
  DASHBOARD_VIEW: [PERMISSIONS.analyticsView],

  USER_VIEW: [PERMISSIONS.usersView, PERMISSIONS.exportData],

  /*
   * Four panel permissions from one backend key. This is the coarseness that
   * makes the two vocabularies irreconcilable: there is no longer any way to
   * grant suspend without also granting ban.
   */
  USER_MODERATE: [
    PERMISSIONS.usersSuspend,
    PERMISSIONS.usersBan,
    PERMISSIONS.usersRestrict,
    PERMISSIONS.sessionsRevoke,
  ],

  /* No panel module exists for this yet — staff_management_plan.md §8 O9. */
  BUSINESS_VERIFY: [],

  /* Gates the GET as well as the writes, hence both. */
  SYSTEM_SETTINGS_EDIT: [
    PERMISSIONS.configurationView,
    PERMISSIONS.configurationConfigure,
  ],

  /*
   * Releases live inside the settings page, so this key needs `configurationView`
   * to reach the page at all — but NOT `configurationConfigure`, which would
   * hand over every other settings section along with it.
   */
  DEPLOYMENT_EDIT: [PERMISSIONS.configurationView],

  DATABASE_BACKUP: [PERMISSIONS.settingsDatabase],
  SMS_GATEWAY_EDIT: [PERMISSIONS.settingsSms],
}

/**
 * Every panel permission a `SUPER_ADMIN` holds.
 *
 * Not derived from {@link MODULE_TO_PANEL}: a Super Admin's access is a
 * wildcard on the backend, not the union of the eight keys, and the union is
 * strictly smaller — it contains no finance, club, host, moderation or
 * notification permission at all.
 */
const ALL_PANEL_PERMISSIONS = Object.values(PERMISSIONS)

/**
 * Translate a staff member's backend keys into panel permissions.
 *
 * ⚠️ **Role is consulted first, and that is not a stylistic choice**
 * (staff_management_plan.md §3.1). `GET /admin/auth/me` returns
 * `adminPermissions: []` for a Super Admin — the wildcard is implied by the
 * role and is never spelled out as keys. A brand-new account granted nothing
 * returns `[]` too. The array alone cannot tell them apart, so any check
 * shaped `if (keys.length === 0) denyEverything()` locks the Super
 * Administrator out of their own panel.
 *
 * ⚠️ **Not wired yet.** As of 2026-09-03 `GET /admin/auth/me` returns `[]` for
 * *every* account, including an ADMIN demonstrably holding two keys — verified
 * live, and confirmed by that account reaching `/admin/dashboard/snapshot`
 * while being refused `/admin/users`. `AuthProvider` bootstraps from `/me` on
 * every reload, so consuming this today would blank an ADMIN's navigation the
 * moment they pressed F5. It stays inert until backend ask #1 lands, at which
 * point `permissionsForRole` is deleted and A5 wires this in its place.
 */
export function modulePermissionsToPanel(
  keys: readonly ModulePermission[],
  role: string,
): readonly Permission[] {
  if (role === 'SUPER_ADMIN') return ALL_PANEL_PERMISSIONS

  const granted = new Set<Permission>()
  for (const key of keys) {
    for (const permission of MODULE_TO_PANEL[key] ?? []) granted.add(permission)
  }
  return [...granted]
}
