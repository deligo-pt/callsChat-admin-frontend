import { http, HttpResponse } from 'msw'

import { MODULE_PERMISSION_VALUES } from '@/types/staff'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Mock Staff & Access Control backend.
 *
 * Every rejection below was observed on the live API on 2026-09-03 and is
 * reproduced verbatim, message included. The rule from `settings.ts` applies
 * with full force: **a mock laxer than the service tests nothing.**
 *
 * Five of the seven traps in staff_management_plan.md §3 are invisible from a
 * success response — they are shapes, filters and staleness. A permissive mock
 * answers 200 to all of them, the suite goes green, and the defect ships. So
 * this handler is deliberately as hostile as the real service, **including its
 * bugs**:
 *
 *   - a bodyless PATCH is rejected with `body/ Expected object, received null`
 *   - PATCH /permissions REPLACES the set, it does not merge
 *   - soft-deleted rows stay VISIBLE to both reads and 404 on every mutation
 *   - `status` filter refuses INACTIVE, so deleted rows cannot be filtered out
 *   - `reason` is optional — a ban with no reason succeeds
 *   - a status mutation returns PRE-revocation session counts
 *   - two distinct 403 vocabularies: module-gated and role-gated
 *   - a Super Admin is invisible (404) and immune (403)
 *   - the 404 message really is doubled: "…not found. not found"
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const

/* ------------------------------------------------------------------ *
 * Acting-role switch
 * ------------------------------------------------------------------ */

/**
 * Which role the mock treats the caller as.
 *
 * Defaults to `SUPER_ADMIN` because that is the only role for which this
 * module does anything at all. Flip it to exercise the guard:
 *
 *   __mockStaffActingRole.set('ADMIN')   // every route answers 403
 */
type ActingRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR'

let actingRole: ActingRole = 'SUPER_ADMIN'

export const mockStaffActingRole = {
  get: (): ActingRole => actingRole,
  set: (role: ActingRole): void => {
    actingRole = role
  },
}

declare global {
  var __mockStaffActingRole: typeof mockStaffActingRole | undefined
}

globalThis.__mockStaffActingRole = mockStaffActingRole

/**
 * The role-gated 403.
 *
 * Distinct from the module-gated one raised elsewhere in the API — this is the
 * one an operator can do nothing about, and the UI must not offer them a
 * "request access" affordance for it (staff_management_plan.md §5.7).
 */
function requireSuperAdmin(): Response | null {
  if (actingRole === 'SUPER_ADMIN') return null
  return errorResponse(
    403,
    'FORBIDDEN',
    'Access Denied: Requires SUPER_ADMIN privileges',
  )
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * Persisted in `localStorage` for the same reason `settings.ts` is: MSW's
 * browser handlers run in the page, so module state is wiped by every full
 * page load — and a backend that forgets a provisioned colleague on refresh is
 * a backend nobody has.
 */
const STATE_KEY = 'callschat.mock.staff'

interface MockStaff {
  id: string
  displayName: string
  username: string
  email: string
  phone: string | null
  password: string
  role: 'ADMIN' | 'MODERATOR'
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'INACTIVE'
  adminPermissions: string[]
  activeSessionsCount: number
  createdAt: string
  lastActiveAt: string | null
  /** The soft-delete marker. Reads ignore it; mutations do not. */
  deletedAt: string | null
}

/**
 * The Super Admin.
 *
 * Held here but **never** returned by any handler — it exists so the immunity
 * and invisibility rules have something real to be enforced against, rather
 * than being faked with a hard-coded id check.
 */
const SUPER_ADMIN_ID = 'cmt8orkov00004upco3oifg2v'

const SEED: MockStaff[] = [
  {
    id: 'stf_sarah',
    displayName: 'Sarah Connor',
    username: 'staff_sarah.connor_a1b2',
    email: 'sarah.connor@callschat.com',
    phone: '+12025550199',
    password: 'Password123!',
    role: 'MODERATOR',
    status: 'ACTIVE',
    adminPermissions: ['USER_VIEW', 'USER_MODERATE', 'DASHBOARD_VIEW'],
    activeSessionsCount: 2,
    createdAt: '2026-08-28T09:14:00.000Z',
    lastActiveAt: '2026-09-03T08:41:12.000Z',
    deletedAt: null,
  },
  {
    id: 'stf_marcus',
    displayName: 'Marcus Webb',
    username: 'staff_marcus.webb_k4x9',
    email: 'marcus.webb@callschat.com',
    phone: null,
    password: 'Password123!',
    role: 'ADMIN',
    status: 'ACTIVE',
    adminPermissions: [
      'DASHBOARD_VIEW',
      'USER_VIEW',
      'USER_MODERATE',
      'BUSINESS_VERIFY',
      'SYSTEM_SETTINGS_EDIT',
    ],
    activeSessionsCount: 1,
    createdAt: '2026-08-19T11:02:00.000Z',
    lastActiveAt: '2026-09-03T07:55:40.000Z',
    deletedAt: null,
  },
  {
    id: 'stf_priya',
    displayName: 'Priya Raman',
    username: 'staff_priya.raman_m7q1',
    email: 'priya.raman@callschat.com',
    phone: '+12025550144',
    password: 'Password123!',
    role: 'MODERATOR',
    status: 'SUSPENDED',
    adminPermissions: ['USER_VIEW'],
    activeSessionsCount: 0,
    createdAt: '2026-08-22T15:30:00.000Z',
    lastActiveAt: null,
    deletedAt: null,
  },
  {
    /* No permissions at all. Denied by default is a valid, shippable state. */
    id: 'stf_tomas',
    displayName: 'Tomas Lindqvist',
    username: 'staff_tomas.lindqvist_p3v8',
    email: 'tomas.lindqvist@callschat.com',
    phone: null,
    password: 'Password123!',
    role: 'MODERATOR',
    status: 'ACTIVE',
    adminPermissions: [],
    activeSessionsCount: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    lastActiveAt: null,
    deletedAt: null,
  },
  {
    id: 'stf_banned',
    displayName: 'Dana Okonkwo',
    username: 'staff_dana.okonkwo_z2r5',
    email: 'dana.okonkwo@callschat.com',
    phone: null,
    password: 'Password123!',
    role: 'ADMIN',
    status: 'BANNED',
    adminPermissions: ['DASHBOARD_VIEW'],
    activeSessionsCount: 0,
    createdAt: '2026-07-14T08:00:00.000Z',
    lastActiveAt: '2026-08-30T16:20:00.000Z',
    deletedAt: null,
  },
  {
    /*
     * A soft-deleted row, seeded on purpose.
     *
     * This is the shape of staff_management_plan.md §3.4 and the reason the
     * directory needs a client-side "Hide deleted" toggle: the live API leaves
     * it in the list, offers no `INACTIVE` filter value, and 404s every action
     * taken against it. Without one of these in the seed, the empty-state and
     * hide-deleted behaviour would never be exercised.
     */
    id: 'stf_deleted',
    displayName: 'Probe Temp',
    username: 'staff_probe.temp_mtnp',
    email: 'probe.temp@callschat.com',
    phone: '+12025550777',
    password: 'Password123!',
    role: 'ADMIN',
    status: 'INACTIVE',
    adminPermissions: ['DASHBOARD_VIEW', 'USER_MODERATE'],
    activeSessionsCount: 0,
    createdAt: '2026-09-03T10:23:42.117Z',
    lastActiveAt: null,
    deletedAt: '2026-09-03T10:31:08.000Z',
  },
]

function load(): MockStaff[] {
  try {
    const raw = globalThis.localStorage?.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as MockStaff[]) : structuredClone(SEED)
  } catch {
    return structuredClone(SEED)
  }
}

let roster: MockStaff[] = load()

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(roster))
  } catch {
    /* Private mode or blocked storage — in-memory only. */
  }
}

/**
 * Restore the seed roster.
 *
 * `roster` is loaded once at module import, so clearing `localStorage` from a
 * test does nothing — the in-memory copy survives. Tests that mutate staff
 * must call this in `beforeEach`, or a deletion in one test leaks into the
 * next. Mirrors `resetSessionForTests` in `auth/tokenStore.ts`.
 */
export function resetMockStaff(): void {
  roster = structuredClone(SEED)
  actingRole = 'SUPER_ADMIN'
  try {
    globalThis.localStorage?.removeItem(STATE_KEY)
  } catch {
    /* Nothing to clear. */
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** The wire shape. `password` and `deletedAt` are internal and never sent. */
function toWire(entry: MockStaff) {
  const { password: _password, deletedAt: _deletedAt, ...rest } = entry
  return rest
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text()
  if (raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** Fastify sets `request.body = null` for a bodyless PATCH. Sixth family. */
const NULL_BODY = errorResponse.bind(
  null,
  400,
  VALIDATION,
  'body/ Expected object, received null',
)

function validationFailure(issues: readonly string[]): Response {
  return errorResponse(400, VALIDATION, issues.join(', '))
}

/** Verbatim, doubled suffix and all — staff_management_plan.md §2.9. */
function notFound(): Response {
  return errorResponse(404, 'NOT_FOUND', 'Staff member account not found. not found')
}

/**
 * Resolve an id for a **read**.
 *
 * Deliberately does NOT filter `deletedAt` — that is the live bug, and the one
 * this module's UI is most shaped by.
 */
function findForRead(id: string): MockStaff | undefined {
  return roster.find((entry) => entry.id === id)
}

/**
 * Resolve an id for a **mutation**.
 *
 * Filters `deletedAt`, exactly as the live service does — which is why a
 * deleted row renders in the directory and then 404s on every action. The
 * asymmetry between this and `findForRead` is the bug, faithfully reproduced.
 */
function findForMutation(id: string): MockStaff | undefined {
  return roster.find((entry) => entry.id === id && entry.deletedAt === null)
}

/**
 * Super Admin immunity.
 *
 * Checked before the 404, because that is the live ordering: targeting the
 * Super Admin with a status change answers 403, not "not found", even though
 * the same id answers 404 on a read.
 */
function superAdminGuard(id: string): Response | null {
  if (id !== SUPER_ADMIN_ID) return null
  return errorResponse(
    403,
    'FORBIDDEN',
    'Super Administrator accounts cannot be suspended or banned.',
  )
}

function isPermissionArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** `body/permissions/1 Invalid enum value. Expected …, received 'BOGUS'`. */
function validatePermissions(value: unknown, field = 'permissions'): string[] {
  if (!Array.isArray(value)) {
    return [`body/${field} Expected array, received ${typeof value}`]
  }
  if (!isPermissionArray(value)) {
    return [`body/${field} Expected array, received object`]
  }
  const expected = MODULE_PERMISSION_VALUES.map((key) => `'${key}'`).join(' | ')
  const issues: string[] = []
  value.forEach((key, index) => {
    if (!(MODULE_PERMISSION_VALUES as readonly string[]).includes(key)) {
      issues.push(
        `body/${field}/${index} Invalid enum value. Expected ${expected}, received '${key}'`,
      )
    }
  })
  return issues
}

function generateUsername(email: string): string {
  const local = email.split('@')[0] ?? 'staff'
  const suffix = Math.random().toString(36).slice(2, 6)
  return `staff_${local}_${suffix}`
}

/**
 * What suspending, banning, resetting or deleting does to sessions.
 *
 * Kept separate from the response so a caller can echo the **pre**-revocation
 * record — see the status handler.
 */
function revokeSessions(entry: MockStaff): void {
  entry.activeSessionsCount = 0
  entry.lastActiveAt = null
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const staffHandlers = [
  /** `GET /admin/staff` — standard `{ success, data[], pagination }`. */
  http.get(`${API_PREFIX}/admin/staff`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''

    const issues: string[] = []
    if (!Number.isInteger(page) || page < 1) {
      issues.push('querystring/page Number must be greater than or equal to 1')
    }
    if (!Number.isInteger(limit) || limit > 100) {
      issues.push('querystring/limit Number must be less than or equal to 100')
    }
    if (role && !['ADMIN', 'MODERATOR', 'ALL'].includes(role)) {
      issues.push(
        `querystring/role Invalid enum value. Expected 'ADMIN' | 'MODERATOR' | 'ALL', received '${role}'`,
      )
    }
    /*
     * ⚠️ `INACTIVE` is absent from this list, and that is not an oversight in
     * the mock — it is absent from the live enum. It is what makes deleted rows
     * impossible to filter server-side in either direction.
     */
    if (status && !['ACTIVE', 'SUSPENDED', 'BANNED', 'ALL'].includes(status)) {
      issues.push(
        `querystring/status Invalid enum value. Expected 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'ALL', received '${status}'`,
      )
    }
    if (issues.length > 0) return validationFailure(issues)

    /* No `deletedAt` filter. Deleted rows are listed, exactly as live. */
    let rows = roster
    if (role && role !== 'ALL') rows = rows.filter((entry) => entry.role === role)
    if (status && status !== 'ALL') {
      rows = rows.filter((entry) => entry.status === status)
    }
    if (search) {
      rows = rows.filter((entry) =>
        [entry.displayName, entry.username, entry.email].some((field) =>
          field.toLowerCase().includes(search),
        ),
      )
    }

    const start = (page - 1) * limit
    return HttpResponse.json({
      success: true,
      data: rows.slice(start, start + limit).map(toWire),
      pagination: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
      },
    })
  }),

  /** `POST /admin/staff` → 201. */
  http.post(`${API_PREFIX}/admin/staff`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const issues: string[] = []
    const email = body['email']
    const password = body['password']
    const displayName = body['displayName']
    const role = body['role']

    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      issues.push('body/email Valid email address is required')
    }
    if (typeof password !== 'string' || password.length < 8) {
      issues.push('body/password Password must be at least 8 characters long')
    }
    if (typeof displayName !== 'string' || displayName.trim() === '') {
      issues.push('body/displayName Display name is required')
    }
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      issues.push(
        `body/role Invalid enum value. Expected 'ADMIN' | 'MODERATOR', received '${String(role)}'`,
      )
    }
    if (body['permissions'] !== undefined) {
      issues.push(...validatePermissions(body['permissions']))
    }
    /*
     * `phone` is checked for TYPE only, never for format — `"nonsense"` is
     * accepted live (staff_management_plan.md §8 O4). Validating it here would
     * hide the defect from anyone testing against the mock.
     */
    if (body['phone'] !== undefined && typeof body['phone'] !== 'string') {
      issues.push(`body/phone Expected string, received ${typeof body['phone']}`)
    }
    if (issues.length > 0) return validationFailure(issues)

    const emailValue = email as string
    if (
      roster.some((entry) => entry.email === emailValue && entry.deletedAt === null)
    ) {
      return errorResponse(
        409,
        'CONFLICT',
        'An account with this email address already exists.',
      )
    }

    const now = new Date().toISOString()
    const created: MockStaff = {
      id: `stf_${Math.random().toString(36).slice(2, 10)}`,
      displayName: (displayName as string).trim(),
      username: generateUsername(emailValue),
      email: emailValue,
      phone: typeof body['phone'] === 'string' ? body['phone'] : null,
      password: password as string,
      role: role as 'ADMIN' | 'MODERATOR',
      status: 'ACTIVE',
      adminPermissions: isPermissionArray(body['permissions'])
        ? [...body['permissions']]
        : [],
      activeSessionsCount: 0,
      createdAt: now,
      lastActiveAt: null,
      deletedAt: null,
    }
    roster = [created, ...roster]
    persist()

    return HttpResponse.json(
      {
        success: true,
        message: `${created.role} account provisioned successfully with granted permissions.`,
        data: toWire(created),
      },
      { status: 201 },
    )
  }),

  /**
   * `GET /admin/staff/:id`.
   *
   * Same shape as a list row — there is no richer detail payload. Answers 404
   * for the Super Admin (invisible, not merely protected) and **200 for a
   * soft-deleted row**.
   */
  http.get(`${API_PREFIX}/admin/staff/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const entry = findForRead(String(params['id']))
    if (!entry) return notFound()
    return HttpResponse.json({ success: true, data: toWire(entry) })
  }),

  /**
   * `PATCH /admin/staff/:id/permissions`.
   *
   * ⚠️ **Replaces.** The assignment below is deliberately not a merge — that
   * is the whole trap, and a merging mock would let a delta-posting bug ship
   * green.
   */
  http.patch(
    `${API_PREFIX}/admin/staff/:id/permissions`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const guard = requireSuperAdmin()
      if (guard) return guard

      const body = await readBody(request)
      if (!body) return NULL_BODY()

      if (body['permissions'] === undefined) {
        return validationFailure(['body/permissions Required'])
      }
      const issues = validatePermissions(body['permissions'])
      if (issues.length > 0) return validationFailure(issues)

      const immunity = superAdminGuard(String(params['id']))
      if (immunity) return immunity

      const entry = findForMutation(String(params['id']))
      if (!entry) return notFound()

      entry.adminPermissions = [...(body['permissions'] as string[])]
      persist()

      return HttpResponse.json({
        success: true,
        message: 'Staff module permissions updated successfully.',
        data: toWire(entry),
      })
    },
  ),

  /**
   * `PATCH /admin/staff/:id/status`.
   *
   * Two faithful details that matter more than the happy path:
   *
   * - `reason` is **optional**. `{"status":"BANNED"}` alone returns 200, so the
   *   mandatory-reason rule is the client's to enforce and its test must be
   *   able to fail.
   * - The response carries the **pre-revocation** record. Sessions really are
   *   destroyed, but the echoed `activeSessionsCount` and `lastActiveAt` are
   *   the values from before — so a caller that seeds its cache from this
   *   response shows live sessions on a dead account.
   */
  http.patch(`${API_PREFIX}/admin/staff/:id/status`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const status = body['status']
    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(String(status))) {
      return validationFailure([
        `body/status Invalid enum value. Expected 'ACTIVE' | 'SUSPENDED' | 'BANNED', received '${String(status)}'`,
      ])
    }

    const immunity = superAdminGuard(String(params['id']))
    if (immunity) return immunity

    const entry = findForMutation(String(params['id']))
    if (!entry) return notFound()

    /* Snapshot BEFORE revocation — this is what the live API echoes back. */
    const echoed = toWire({ ...entry, status: status as MockStaff['status'] })

    entry.status = status as MockStaff['status']
    if (status !== 'ACTIVE') revokeSessions(entry)
    persist()

    return HttpResponse.json({
      success: true,
      message: `Staff account status updated to ${String(status)}.`,
      data: echoed,
    })
  }),

  /**
   * `PATCH /admin/staff/:id/role`.
   *
   * Permissions are deliberately left untouched — verified live, a promotion
   * kept both of the probe account's keys. Role and module permissions are
   * independent axes, and the confirm copy in A4 depends on that being true.
   */
  http.patch(`${API_PREFIX}/admin/staff/:id/role`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const role = body['role']
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      return validationFailure([
        `body/role Invalid enum value. Expected 'ADMIN' | 'MODERATOR', received '${String(role)}'`,
      ])
    }

    const immunity = superAdminGuard(String(params['id']))
    if (immunity) return immunity

    const entry = findForMutation(String(params['id']))
    if (!entry) return notFound()

    entry.role = role
    persist()

    return HttpResponse.json({
      success: true,
      message: `Staff role successfully updated to ${role}.`,
      data: toWire(entry),
    })
  }),

  /**
   * `PATCH /admin/staff/:id/reset-password`.
   *
   * The only endpoint here with **no `data`** — `{ success, message }` alone.
   * Server policy is length ≥ 8 and nothing else; `"password"` passes, and the
   * mock accepts it for the same reason the live service does. The panel's
   * stricter rule lives in `passwordPolicy.ts`, not here.
   */
  http.patch(
    `${API_PREFIX}/admin/staff/:id/reset-password`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const guard = requireSuperAdmin()
      if (guard) return guard

      const body = await readBody(request)
      if (!body) return NULL_BODY()

      const newPassword = body['newPassword']
      if (newPassword === undefined) {
        return validationFailure(['body/newPassword Required'])
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return validationFailure([
          'body/newPassword New password must be at least 8 characters long',
        ])
      }

      const immunity = superAdminGuard(String(params['id']))
      if (immunity) return immunity

      const entry = findForMutation(String(params['id']))
      if (!entry) return notFound()

      entry.password = newPassword
      revokeSessions(entry)
      persist()

      return HttpResponse.json({
        success: true,
        message:
          'Staff password has been reset successfully. All active sessions have been terminated.',
      })
    },
  ),

  /**
   * `DELETE /admin/staff/:id`.
   *
   * Soft delete, with the live bug intact: the row is marked `INACTIVE` and
   * **left in the roster**, so it keeps appearing in the directory while every
   * subsequent mutation against it answers 404.
   */
  http.delete(`${API_PREFIX}/admin/staff/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireSuperAdmin()
    if (guard) return guard

    const immunity = superAdminGuard(String(params['id']))
    if (immunity) return immunity

    const entry = findForMutation(String(params['id']))
    if (!entry) return notFound()

    entry.status = 'INACTIVE'
    entry.deletedAt = new Date().toISOString()
    revokeSessions(entry)
    persist()

    return HttpResponse.json({
      success: true,
      message: 'Staff member account has been deleted successfully.',
    })
  }),
]
