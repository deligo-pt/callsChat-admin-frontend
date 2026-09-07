import { describe, expect, it } from 'vitest'

import { resolveStatus } from '@/lib/status'

import { paginatedSchema, parseFieldErrors } from '@/types/common'
import {
  currentAdminSchema,
  loginResponseSchema,
  userDetailSchema,
  userSessionSchema,
  userSummarySchema,
} from '@/types/identity'

import { SORTABLE_FIELDS } from './listParams'

/**
 * Contract regression tests.
 *
 * plan.md Phase 3A gate: the schemas must accept the shapes the LIVE API
 * actually returns. Every fixture below is a real response captured from
 * `https://api.callschat.com/api/v1` on 2026-08-25, trimmed only of volatile
 * values — so if the backend changes shape, this fails here rather than as a
 * blank table in production.
 */

const LIVE_USER_ROW = {
  id: 'cmt8orkov00004upco3oifg2v',
  displayName: 'Super Administrator',
  username: 'superadmin',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=superadmin',
  email: 'admin@callschat.com',
  phone: '+10000000000',
  phoneMasked: '+100 *** *** 0000',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  accountType: 'PERSONAL',
  isHost: false,
  activeRestrictions: [],
  createdAt: '2026-08-25T13:13:44.575Z',
  lastActiveAt: '2026-08-25T13:49:00.679Z',
}

const LIVE_LIST_RESPONSE = {
  success: true,
  data: [LIVE_USER_ROW],
  pagination: { page: 1, limit: 1, total: 22, totalPages: 22 },
}

describe('user list contract', () => {
  it('accepts a live list response', () => {
    const result = paginatedSchema(userSummarySchema).safeParse(LIVE_LIST_RESPONSE)
    expect(result.success).toBe(true)
  })

  it('rejects the OLD proposed envelope, so a regression cannot pass silently', () => {
    // `meta` / `pageSize` was the pre-verification assumption (plan.md §10.2).
    const result = paginatedSchema(userSummarySchema).safeParse({
      data: [LIVE_USER_ROW],
      meta: { page: 1, pageSize: 25, total: 22, totalPages: 1 },
    })
    expect(result.success).toBe(false)
  })

  it('accepts a null lastActiveAt, which the live data contains', () => {
    const result = userSummarySchema.safeParse({
      ...LIVE_USER_ROW,
      lastActiveAt: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts every verified account status', () => {
    for (const status of [
      'ACTIVE',
      'INACTIVE',
      'SUSPENDED',
      'BANNED',
      'PENDING_VERIFICATION',
      // Undocumented deletion grace period; found live, not in any spec.
      'SCHEDULED_FOR_DELETION',
    ]) {
      expect(userSummarySchema.safeParse({ ...LIVE_USER_ROW, status }).success).toBe(
        true,
      )
    }
  })

  it('does not reject a whole page over one unfamiliar status', () => {
    /*
     * This is the regression. `SCHEDULED_FOR_DELETION` appeared on one account
     * and the strict enum failed the parse, blanking the entire directory —
     * including the twenty-odd rows that were perfectly valid.
     *
     * A status is a display-only label and `resolveStatus()` already renders an
     * unknown one as a neutral badge, so refusing the row bought no safety. IDs,
     * money and permissions stay strict; see `accountStatusValueSchema`.
     */
    const result = userSummarySchema.safeParse({
      ...LIVE_USER_ROW,
      status: 'SOME_FUTURE_STATE',
    })
    expect(result.success).toBe(true)
    expect(result.data?.status).toBe('SOME_FUTURE_STATE')
  })

  it('renders an unknown status as a neutral badge rather than crashing', () => {
    expect(resolveStatus('user', 'SCHEDULED_FOR_DELETION')).toEqual({
      label: 'Scheduled for deletion',
      tone: 'locked',
    })
    // Humanised, not raw — an operator should not be shown SCREAMING_SNAKE.
    expect(resolveStatus('user', 'SOME_FUTURE_STATE')).toEqual({
      label: 'Some future state',
      tone: 'neutral',
    })
  })

  it('exposes exactly the API’s sortBy allowlist', () => {
    // Taken verbatim from the API's own rejection message for an unknown field.
    expect([...SORTABLE_FIELDS].sort()).toEqual(
      ['createdAt', 'displayName', 'lastActiveAt', 'status'].sort(),
    )
  })
})

describe('session contract', () => {
  it('accepts the live /admin/auth/me payload', () => {
    const result = currentAdminSchema.safeParse({
      id: 'cmt8orkov00004upco3oifg2v',
      phone: '+10000000000',
      phoneMasked: '+100 *** *** 0000',
      email: 'admin@callschat.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      accountType: 'PERSONAL',
      profile: {
        displayName: 'Super Administrator',
        username: 'superadmin',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=superadmin',
      },
      createdAt: '2026-08-25T13:13:44.575Z',
      isProfileSetupComplete: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts the live login payload and its token bundle', () => {
    const result = loginResponseSchema.safeParse({
      user: {
        id: 'cmt8orkov00004upco3oifg2v',
        email: 'admin@callschat.com',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        accountType: 'PERSONAL',
      },
      tokens: {
        accessToken: 'header.payload.signature',
        refreshToken: '75209699-1952-41fe-9b07-913a0db82196',
        expiresIn: '7d',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('user detail contract (consumed by Phase 3B)', () => {
  it('accepts the six-group live payload', () => {
    const result = userDetailSchema.safeParse({
      identity: { ...LIVE_USER_ROW, activeRestrictionsCount: 0 },
      overview: {
        bio: null,
        gender: null,
        dateOfBirth: null,
        country: null,
        timezone: null,
        language: null,
        isOnline: false,
        lastSeenAt: null,
        emailVerified: true,
        phoneVerified: true,
        isProfileSetupComplete: true,
        businessDetails: null,
        businessProfile: null,
        socialStats: {
          totalContacts: 0,
          totalGroups: 0,
          totalCommunities: 0,
          totalCallsInitiated: 0,
          totalCallsReceived: 0,
        },
      },
      accessAndRestrictions: {
        currentStatus: 'ACTIVE',
        activeRestrictions: [],
        restrictionHistory: [],
        suspensionHistory: [],
      },
      sessionsAndDevices: {
        totalActiveSessions: 1,
        sessions: [
          {
            id: '4348ed24-eb7e-45a6-9f05-4ccda87f5917',
            userId: 'cmt6vf0f9000001mmu79cnlmv',
            platform: 'WEB',
            deviceName: null,
            deviceId: null,
            ipAddress: '203.0.113.10',
            userAgent: 'Dart/3.12 (dart:io)',
            isRevoked: true,
            revokedAt: '2026-08-25T14:39:41.492Z',
            expiresAt: '2026-08-31T06:44:23.434Z',
            lastActiveAt: '2026-08-24T06:46:27.436Z',
            createdAt: '2026-08-24T06:44:23.441Z',
          },
        ],
        deviceTokens: [],
      },
      safety: {
        blocksSentCount: 0,
        blocksReceivedCount: 0,
        reportsSubmittedCount: 0,
        reportsAgainstCount: 0,
        suspensionsCount: 0,
      },
      finance: {
        availableDiamonds: 0,
        lockedDiamonds: 0,
        totalPurchased: 0,
        totalGiftsSent: 0,
        totalGiftsReceived: 0,
      },
      auditHistory: { recentActivityLogs: [] },
    })

    expect(result.success).toBe(true)
  })
})

describe('session shape divergence between endpoints', () => {
  const BASE_SESSION = {
    id: '4348ed24-eb7e-45a6-9f05-4ccda87f5917',
    platform: 'WEB',
    deviceName: null,
    deviceId: null,
    ipAddress: '203.0.113.10',
    userAgent: 'Dart/3.12 (dart:io)',
    isRevoked: true,
    createdAt: '2026-08-24T06:44:23.441Z',
    lastActiveAt: '2026-08-24T06:46:27.436Z',
    expiresAt: '2026-08-31T06:44:23.434Z',
  }

  it('accepts the detail-endpoint shape, which OMITS userId and revokedAt', () => {
    /*
     * Caught by validating against live data rather than a hand-written
     * fixture: `GET /admin/users/:id` leaves `revokedAt` absent even when
     * `isRevoked` is true, so a `.nullable()` schema rejected real responses.
     */
    expect(userSessionSchema.safeParse(BASE_SESSION).success).toBe(true)
  })

  it('accepts the /sessions-endpoint shape, which includes both', () => {
    expect(
      userSessionSchema.safeParse({
        ...BASE_SESSION,
        userId: 'cmt6vf0f9000001mmu79cnlmv',
        revokedAt: '2026-08-25T14:39:41.492Z',
      }).success,
    ).toBe(true)
  })
})

describe('Fastify validation message parsing', () => {
  it('recovers field names from a multi-field rejection', () => {
    expect(parseFieldErrors('body/capability Required, body/reason Required')).toEqual([
      { field: 'capability', message: 'Required' },
      { field: 'reason', message: 'Required' },
    ])
  })

  it('handles a querystring rejection', () => {
    expect(
      parseFieldErrors('querystring/limit Number must be less than or equal to 100'),
    ).toEqual([{ field: 'limit', message: 'Number must be less than or equal to 100' }])
  })

  it('keeps an enum message containing a comma whole', () => {
    /*
     * This used to return `[]`: a plain `split(', ')` tore
     * "Expected 'A' | 'B', received 'X'" into a nonsense second segment and
     * the parse aborted. Splitting only ahead of a location prefix keeps the
     * message intact AND maps it, which is strictly better than falling back
     * to the raw string.
     */
    expect(
      parseFieldErrors(
        "body/status Invalid enum value. Expected 'ACTIVE' | 'SUSPENDED', received 'XX'",
      ),
    ).toEqual([
      {
        field: 'status',
        message: "Invalid enum value. Expected 'ACTIVE' | 'SUSPENDED', received 'XX'",
      },
    ])
  })

  it('returns nothing for a message that is not field-shaped', () => {
    expect(parseFieldErrors('Invalid or expired access token')).toEqual([])
  })

  it('maps an array member to bracket notation', () => {
    /*
     * The settings API indexes array failures with a slash —
     * `body/allowedFileTypes/1`. The capture group used to stop at the second
     * slash, so the whole parse bailed and every field mapping in the message
     * was lost. Normalising to `allowedFileTypes[1]` matches the path React
     * Hook Form addresses the control by.
     */
    expect(
      parseFieldErrors('body/allowedFileTypes/1 Expected string, received number'),
    ).toEqual([
      { field: 'allowedFileTypes[1]', message: 'Expected string, received number' },
    ])
  })

  it('still maps sibling fields when one of them is an array member', () => {
    expect(
      parseFieldErrors(
        'body/supportedLanguages/2 String must contain at least 2 character(s), body/appName App name is required',
      ),
    ).toEqual([
      {
        field: 'supportedLanguages[2]',
        message: 'String must contain at least 2 character(s)',
      },
      { field: 'appName', message: 'App name is required' },
    ])
  })

  it('returns nothing for the root-level body rejection, which names no field', () => {
    // `body/ Expected object, received null` — the mandatory-body trap.
    expect(parseFieldErrors('body/ Expected object, received null')).toEqual([])
  })
})
