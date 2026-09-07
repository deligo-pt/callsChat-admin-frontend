import { describe, expect, it } from 'vitest'

import { resolveStatus } from '@/lib/status'
import { parseFieldErrors } from '@/types/common'
import {
  modulePermissionSchema,
  settableStaffStatusSchema,
  staffAcknowledgementSchema,
  staffListResponseSchema,
  staffMemberResponseSchema,
  staffMemberSchema,
  staffRoleSchema,
  staffStatusSchema,
} from '@/types/staff'

/**
 * Contract regression tests for Staff & Access Control.
 *
 * Every fixture below is a **real response** captured from
 * `https://api.callschat.com/api/v1` on 2026-09-03 with a `SUPER_ADMIN` token,
 * trimmed only of volatile values. If the backend changes shape, this fails
 * here rather than as a blank permission grid that a Super Admin then saves.
 */

/* ------------------------------------------------------------------ *
 * Captured responses
 * ------------------------------------------------------------------ */

const LIVE_STAFF_ROW = {
  id: 'cmtlct955010b01mhor55wy1c',
  displayName: 'Samin Israk',
  username: 'staff_samin.israk_drt4',
  email: 'samin.israk@callschat.com',
  phone: '+12025550199',
  role: 'MODERATOR',
  status: 'ACTIVE',
  adminPermissions: ['USER_VIEW', 'DASHBOARD_VIEW'],
  activeSessionsCount: 0,
  createdAt: '2026-09-03T10:00:07.817Z',
  lastActiveAt: null,
}

const LIVE_LIST_RESPONSE = {
  success: true,
  data: [LIVE_STAFF_ROW],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
}

/** `POST /admin/staff` → 201. */
const LIVE_CREATE_RESPONSE = {
  success: true,
  message: 'MODERATOR account provisioned successfully with granted permissions.',
  data: {
    id: 'cmtldnkf9010f01mhtaku4waz',
    displayName: 'Probe Temp',
    username: 'staff_probe.temp_mtnp',
    email: 'probe.temp@callschat.com',
    phone: '+12025550777',
    role: 'MODERATOR',
    status: 'ACTIVE',
    adminPermissions: ['USER_VIEW'],
    activeSessionsCount: 0,
    createdAt: '2026-09-03T10:23:42.117Z',
    lastActiveAt: null,
  },
}

/**
 * `PATCH /:id/status` → 200.
 *
 * Captured immediately after suspending an account that held one live session.
 * Note `activeSessionsCount: 1` and a populated `lastActiveAt`: the sessions
 * were destroyed by this very call, and a `GET` one second later returned `0`
 * and `null`. This fixture is the evidence for staff_management_plan.md §3.7 —
 * the response is stale by one revocation and must never seed the cache.
 */
const LIVE_STATUS_RESPONSE = {
  success: true,
  message: 'Staff account status updated to SUSPENDED.',
  data: {
    id: 'cmtldnkf9010f01mhtaku4waz',
    displayName: 'Probe Temp',
    username: 'staff_probe.temp_mtnp',
    email: 'probe.temp@callschat.com',
    phone: '+12025550777',
    role: 'ADMIN',
    status: 'SUSPENDED',
    adminPermissions: ['DASHBOARD_VIEW', 'USER_MODERATE'],
    activeSessionsCount: 1,
    createdAt: '2026-09-03T10:23:42.117Z',
    lastActiveAt: '2026-09-03T10:24:52.612Z',
  },
}

/** `PATCH /:id/reset-password` and `DELETE /:id` — no `data` at all. */
const LIVE_ACK_RESPONSE = {
  success: true,
  message:
    'Staff password has been reset successfully. All active sessions have been terminated.',
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('staff contract', () => {
  it('accepts the live list response', () => {
    expect(() => staffListResponseSchema.parse(LIVE_LIST_RESPONSE)).not.toThrow()
  })

  it('accepts the live create response', () => {
    expect(() => staffMemberResponseSchema.parse(LIVE_CREATE_RESPONSE)).not.toThrow()
  })

  it('accepts the live status-mutation response', () => {
    expect(() => staffMemberResponseSchema.parse(LIVE_STATUS_RESPONSE)).not.toThrow()
  })

  it('accepts the bare acknowledgement from reset-password and delete', () => {
    expect(() => staffAcknowledgementSchema.parse(LIVE_ACK_RESPONSE)).not.toThrow()
  })

  it('accepts a detail response, which carries no message', () => {
    // `GET /:id` returns `{ success, data }` — `message` is mutation-only.
    expect(() =>
      staffMemberResponseSchema.parse({ success: true, data: LIVE_STAFF_ROW }),
    ).not.toThrow()
  })

  it('accepts a null phone and a null lastActiveAt', () => {
    const parsed = staffMemberSchema.parse({
      ...LIVE_STAFF_ROW,
      phone: null,
      lastActiveAt: null,
    })
    expect(parsed.phone).toBeNull()
    expect(parsed.lastActiveAt).toBeNull()
  })

  it('accepts an account with no permissions at all', () => {
    // Denied by default is a real, shippable state — not a malformed response.
    const parsed = staffMemberSchema.parse({ ...LIVE_STAFF_ROW, adminPermissions: [] })
    expect(parsed.adminPermissions).toEqual([])
  })

  /**
   * ⚠️ Deliberately strict, unlike consumer-user statuses.
   *
   * `types/identity.ts` tolerates an unknown account *status* because one
   * unrecognised value once blanked the whole user directory, and a status is
   * a display-only label. That reasoning stops at permissions: silently
   * dropping an unknown key would show a Super Admin a grid missing a
   * permission the account actually holds — and saving that grid would revoke
   * it without anyone intending to.
   */
  it('rejects an unknown permission key rather than dropping it', () => {
    expect(() =>
      staffMemberSchema.parse({
        ...LIVE_STAFF_ROW,
        adminPermissions: ['USER_VIEW', 'TIME_TRAVEL'],
      }),
    ).toThrow()
  })

  it('rejects SUPER_ADMIN as a staff role', () => {
    // The panel cannot mint, list or manage one — the type says so.
    expect(() => staffRoleSchema.parse('SUPER_ADMIN')).toThrow()
    expect(staffRoleSchema.parse('ADMIN')).toBe('ADMIN')
  })

  it('accepts INACTIVE as a status but refuses it as a settable one', () => {
    /*
     * `INACTIVE` is reached only through DELETE, and there is no route back.
     * Modelling it as settable would put a "reactivate" option in front of an
     * operator that the API answers 404 to.
     */
    expect(staffStatusSchema.parse('INACTIVE')).toBe('INACTIVE')
    expect(() => settableStaffStatusSchema.parse('INACTIVE')).toThrow()
  })

  it('holds all eight module permission keys, in the documented order', () => {
    expect(modulePermissionSchema.options).toEqual([
      'DASHBOARD_VIEW',
      'USER_VIEW',
      'USER_MODERATE',
      'BUSINESS_VERIFY',
      'SYSTEM_SETTINGS_EDIT',
      'DEPLOYMENT_EDIT',
      'DATABASE_BACKUP',
      'SMS_GATEWAY_EDIT',
    ])
  })
})

describe('staff status labels', () => {
  it('renders INACTIVE as "Deleted", never as "Inactive"', () => {
    /*
     * The whole reason the `staff` domain exists rather than reusing `user`.
     * Because the backend leaves soft-deleted rows in the directory, this
     * badge is the only thing separating a deleted colleague from a working
     * one — and "Inactive" would state the opposite of what happened.
     */
    const deleted = resolveStatus('staff', 'INACTIVE')
    expect(deleted.label).toBe('Deleted')
    expect(deleted.tone).toBe('locked')

    expect(resolveStatus('user', 'INACTIVE').label).toBe('Inactive')
  })

  it('keeps BANNED reversible-looking and deletion terminal-looking', () => {
    expect(resolveStatus('staff', 'BANNED').tone).toBe('danger')
    expect(resolveStatus('staff', 'SUSPENDED').tone).toBe('warning')
    expect(resolveStatus('staff', 'ACTIVE').tone).toBe('success')
  })

  it('renders the two staff roles distinctly', () => {
    expect(resolveStatus('staffRole', 'ADMIN').label).toBe('Admin')
    expect(resolveStatus('staffRole', 'MODERATOR').label).toBe('Moderator')
    expect(resolveStatus('staffRole', 'SUPER_ADMIN').label).toBe('Super Admin')
  })
})

describe('staff validation errors', () => {
  it('splits the live multi-field create rejection onto the right fields', () => {
    /*
     * Captured verbatim from `POST /admin/staff` with every field wrong at
     * once. Six errors, comma-joined into one string — the shape
     * `parseFieldErrors` exists for.
     */
    const parsed = parseFieldErrors(
      "body/email Valid email address is required, body/password Password must be at least 8 characters long, body/displayName Display name is required, body/role Invalid enum value. Expected 'ADMIN' | 'MODERATOR', received 'SUPER_ADMIN', body/permissions Expected array, received string, body/phone Expected string, received number",
    )

    expect(parsed.map((entry) => entry.field)).toEqual([
      'email',
      'password',
      'displayName',
      'role',
      'permissions',
      'phone',
    ])
    /* The enum message contains its own commas and must survive intact. */
    expect(parsed[3]?.message).toContain("Expected 'ADMIN' | 'MODERATOR'")
  })

  it('indexes an array rejection to the offending element', () => {
    const parsed = parseFieldErrors(
      "body/permissions/0 Invalid enum value. Expected 'DASHBOARD_VIEW' | 'USER_VIEW', received 'BOGUS'",
    )
    expect(parsed[0]?.field).toBe('permissions[0]')
  })

  it('handles the querystring prefix on list rejections', () => {
    const parsed = parseFieldErrors(
      'querystring/limit Number must be less than or equal to 100',
    )
    expect(parsed[0]?.field).toBe('limit')
  })
})
