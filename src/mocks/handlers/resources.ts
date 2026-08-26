import { http, HttpResponse } from 'msw'

import type { Paginated } from '@/types/common'

import { queryCollection, type QueryConfig } from '../query'
import {
  adminUsers,
  announcements,
  auditLogs,
  configuration,
  diamondPackages,
  diamondTransactions,
  gifts,
  hostApplications,
  hostProfiles,
  moderationCases,
  payments,
  payoutRates,
  socialClubs,
  users,
  wallets,
  withdrawals,
} from '../seed'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Reproduce the backend's body validation for a DELETE.
 *
 * Fastify sets `request.body` to `null` when no payload is sent, and the route
 * schemas reject that with this exact message. Only the object is mandatory —
 * every field inside it is optional, so an empty object passes.
 */
async function requireJsonBody(request: Request) {
  const raw = await request.text()
  if (raw.trim() === '') {
    return errorResponse(400, 'FST_ERR_VALIDATION', 'body/ Expected object, received null')
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/ Expected object, received null',
      )
    }
  } catch {
    return errorResponse(400, 'FST_ERR_VALIDATION', 'body/ Expected object, received null')
  }
  return null
}

const EMPTY: Paginated<never> = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
}

/** List endpoint with real server-side pagination, filtering and sorting. */
function listHandler<TRow extends object>(
  path: string,
  rows: readonly TRow[],
  config: QueryConfig<TRow> = {},
) {
  return http.get(`${API_PREFIX}${path}`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    if (isEmptyScenario()) return HttpResponse.json(EMPTY)

    return HttpResponse.json(queryCollection(new URL(request.url), rows, config))
  })
}

/** Detail endpoint returning 404 for an unknown id. */
function detailHandler<TRow extends { id: string }>(
  path: string,
  rows: readonly TRow[],
  label: string,
) {
  return http.get(`${API_PREFIX}${path}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const record = rows.find((row) => row.id === params['id'])
    if (!record) return errorResponse(404, 'NOT_FOUND', `${label} not found.`)

    return HttpResponse.json({ success: true, data: record })
  })
}

export const resourceHandlers = [
  /* ---------------------------------------------------------------- Users */
  /*
   * plan.md §10.4: this mirrors the VERIFIED behaviour of the live endpoint,
   * including what it does NOT support. `isHost`, date ranges and
   * `restrictionType` are deliberately absent so the mock cannot make a
   * filter appear to work that would silently no-op in production.
   */
  listHandler('/admin/users', users, {
    searchFields: ['id', 'displayName', 'username', 'email'],
    sortFields: ['createdAt', 'displayName', 'status', 'lastActiveAt'],
    filters: {
      status: (row, value) => row.status === value,
      role: (row, value) => row.role === value,
      accountType: (row, value) => row.accountType === value,
      hasRestrictions: (row, value) =>
        String(row.activeRestrictions.length > 0) === value,
    },
  }),
  /*
   * `GET /admin/users/export` — real CSV, honouring the SAME filters as the
   * list, exactly as the live endpoint does. Returning JSON here would leave
   * the download path (blob + Content-Disposition) untested.
   *
   * ⚠️ MUST stay above `GET /admin/users/:id`. MSW matches in registration
   * order, so with the detail handler first the literal path `/export` binds
   * as `:id` and the download 404s as a missing user.
   */
  http.get(`${API_PREFIX}/admin/users/export`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const format = url.searchParams.get('format') ?? 'csv'
    if (!['csv', 'json'].includes(format)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        `querystring/format Invalid enum value. Expected 'csv' | 'json', received '${format}'`,
      )
    }

    // Reuse the list query so the export really does match the filtered view.
    const filtered = queryCollection(url, users, {
      searchFields: ['id', 'displayName', 'username', 'email'],
      filters: {
        status: (row, value) => row.status === value,
        role: (row, value) => row.role === value,
        accountType: (row, value) => row.accountType === value,
        hasRestrictions: (row, value) =>
          String(row.activeRestrictions.length > 0) === value,
      },
    })

    const columns = [
      'id',
      'displayName',
      'username',
      'email',
      'phone',
      'role',
      'status',
      'accountType',
      'activeRestrictions',
      'createdAt',
    ] as const

    if (format === 'json') {
      return HttpResponse.json(filtered.data, {
        headers: {
          'Content-Disposition': 'attachment; filename="users_export.json"',
        },
      })
    }

    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const body = [
      columns.join(','),
      ...filtered.data.map((row) =>
        columns
          .map((column) =>
            column === 'activeRestrictions'
              ? escape(row.activeRestrictions.join('|'))
              : escape((row as unknown as Record<string, unknown>)[column]),
          )
          .join(','),
      ),
    ].join('\n')

    return new HttpResponse(body, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="users_export_mock.csv"',
      },
    })
  }),

  /*
   * `GET /admin/users/:id` returns the SIX-GROUP payload (plan.md §10.3), not a
   * list row — a genuinely different shape from the list endpoint. The generic
   * `detailHandler` would return the row and fail contract validation, so this
   * one is bespoke and mirrors the verified live structure exactly.
   */
  http.get(`${API_PREFIX}/admin/users/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const user = users.find((row) => row.id === params['id'])
    if (!user) return errorResponse(404, 'NOT_FOUND', 'User not found.')

    return HttpResponse.json({
      success: true,
      data: {
        identity: {
          id: user.id,
          displayName: user.displayName,
          username: user.username,
          avatarUrl: user.avatarUrl,
          phone: user.phone,
          phoneMasked: user.phoneMasked,
          email: user.email,
          role: user.role,
          status: user.status,
          accountType: user.accountType,
          isHost: user.isHost,
          activeRestrictionsCount: user.activeRestrictions.length,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
        },
        overview: {
          bio: null,
          gender: null,
          dateOfBirth: null,
          country: user.countryCode,
          timezone: 'UTC',
          language: 'en',
          isOnline: false,
          lastSeenAt: user.lastActiveAt,
          emailVerified: user.email !== null,
          phoneVerified: true,
          isProfileSetupComplete: true,
          businessDetails: null,
          businessProfile: null,
          socialStats: {
            totalContacts: 3,
            totalGroups: 1,
            totalCommunities: 0,
            totalCallsInitiated: 4,
            totalCallsReceived: 6,
          },
        },
        accessAndRestrictions: {
          currentStatus: user.status,
          /*
           * Shapes verified against a live account that actually carries a
           * restriction. They were previously left empty because every account
           * sampled upstream had none — which meant the Remove control never
           * rendered in a single test, and the bodyless-DELETE bug in
           * `removeRestriction` had no way to be caught. An empty fixture is
           * not a neutral choice; it silently deletes a code path from the
           * suite.
           *
           * `suspensionHistory` stays empty: no live account was observed with
           * one, so its shape is still unverified and inventing fields here
           * would be the same mistake in the other direction.
           */
          activeRestrictions: user.activeRestrictions.map((capability, rIndex) => ({
            id: `rst_${user.id}_${rIndex}`,
            capability,
            reason: 'Repeated unsolicited gifting reports',
            restrictedBy: 'adm_000001',
            startsAt: user.lastActiveAt,
            expiresAt: null,
            createdAt: user.lastActiveAt,
          })),
          restrictionHistory: user.activeRestrictions.map((capability, rIndex) => ({
            id: `rst_${user.id}_${rIndex}`,
            capability,
            reason: 'Repeated unsolicited gifting reports',
            restrictedBy: 'adm_000001',
            startsAt: user.lastActiveAt,
            expiresAt: null,
            isRevoked: false,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            createdAt: user.lastActiveAt,
          })),
          suspensionHistory: [],
        },
        sessionsAndDevices: {
          totalActiveSessions: 1,
          sessions: [
            {
              id: `ses_${user.id}`,
              platform: 'WEB',
              deviceName: null,
              deviceId: null,
              ipAddress: '203.0.113.10',
              userAgent: 'Mozilla/5.0',
              isRevoked: false,
              expiresAt: null,
              lastActiveAt: user.lastActiveAt,
              createdAt: user.createdAt,
            },
          ],
          deviceTokens: [
            { id: `dev_${user.id}`, deviceType: 'ANDROID', createdAt: user.createdAt },
          ],
        },
        safety: {
          blocksSentCount: 0,
          blocksReceivedCount: 0,
          reportsSubmittedCount: 0,
          reportsAgainstCount: 0,
          suspensionsCount: 0,
        },
        finance: {
          availableDiamonds: user.wallet.availableDiamonds,
          lockedDiamonds: user.wallet.lockedDiamonds,
          totalPurchased: 0,
          totalGiftsSent: 0,
          totalGiftsReceived: 0,
        },
        auditHistory: { recentActivityLogs: [] },
      },
    })
  }),

  /* --------------------------------- Export / provisioning / edits */

  /** `POST /admin/users` — provisioning. Required: displayName + phone. */
  http.post(`${API_PREFIX}/admin/users`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as {
      displayName?: string
      phone?: string
      password?: string
    }

    const missing: string[] = []
    if (!body.displayName) missing.push('body/displayName Required')
    if (!body.phone) missing.push('body/phone Required')
    if (missing.length > 0) {
      return errorResponse(400, 'FST_ERR_VALIDATION', missing.join(', '))
    }
    if (body.password !== undefined && body.password.length < 6) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/password String must contain at least 6 character(s)',
      )
    }

    /*
     * The live API does NOT validate phone format. The mock reproduces that so
     * the client's own guard is what gets exercised, rather than the mock
     * quietly enforcing a rule production does not have.
     */
    return HttpResponse.json({
      success: true,
      message: 'User account provisioned successfully.',
      data: { id: `usr_mock_${Date.now().toString(36)}` },
    })
  }),

  http.patch(`${API_PREFIX}/admin/users/:id/profile`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    // Every field optional; an empty body is a no-op, as upstream.
    return HttpResponse.json({
      success: true,
      message: 'User profile updated successfully.',
    })
  }),

  http.patch(`${API_PREFIX}/admin/users/:id/email`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const body = (await request.json()) as { email?: string }
    if (!body.email) {
      return errorResponse(400, 'FST_ERR_VALIDATION', 'body/email Required')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/email Must be a valid email address',
      )
    }
    return HttpResponse.json({ success: true, message: 'Email updated.' })
  }),

  /* ------------------------------------------- User actions (Phase 3C) */

  /*
   * These mirror the LIVE validation rules exactly, including the two places
   * the API is weaker than it should be: `unsuspend` and `sessions/revoke-all`
   * both accept an empty body and execute. The mock reproduces that so the
   * client's stricter behaviour (it always sends a reason) is what is being
   * exercised, rather than the mock quietly enforcing what the server does not.
   *
   * State is not persisted: these return success without mutating the seed, so
   * a test run is repeatable. Verifying that a suspend really flips the status
   * needs the real backend.
   */
  http.post(`${API_PREFIX}/admin/users/:id/suspend`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as { reason?: string }
    const REASONS = ['SPAM', 'HARASSMENT', 'FAKE_ACCOUNT', 'POLICY_VIOLATION', 'OTHER']
    if (!body.reason) {
      return errorResponse(400, 'FST_ERR_VALIDATION', 'body/reason Required')
    }
    if (!REASONS.includes(body.reason)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        `body/reason Invalid enum value. Expected ${REASONS.map((r) => `'${r}'`).join(' | ')}, received '${body.reason}'`,
      )
    }
    return HttpResponse.json({ success: true, message: 'User suspended.' })
  }),

  http.post(`${API_PREFIX}/admin/users/:id/unsuspend`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    // No required fields — matching the live API's (weaker) contract.
    return HttpResponse.json({ success: true, message: 'Suspension lifted.' })
  }),

  http.post(`${API_PREFIX}/admin/users/:id/ban`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const body = (await request.json()) as { reason?: string }
    if (!body.reason) {
      return errorResponse(400, 'FST_ERR_VALIDATION', 'body/reason Required')
    }
    return HttpResponse.json({ success: true, message: 'User banned.' })
  }),

  http.post(`${API_PREFIX}/admin/users/:id/restore`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const body = (await request.json()) as { reason?: string }
    if (!body.reason) {
      return errorResponse(400, 'FST_ERR_VALIDATION', 'body/reason Required')
    }
    return HttpResponse.json({ success: true, message: 'User restored.' })
  }),

  http.patch(`${API_PREFIX}/admin/users/:id/role`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const body = (await request.json()) as { role?: string; reason?: string }
    const ROLES = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']
    if (!body.role || !body.reason) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/role Required, body/reason Required',
      )
    }
    if (!ROLES.includes(body.role)) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        `body/role Invalid enum value. Expected ${ROLES.map((r) => `'${r}'`).join(' | ')}, received '${body.role}'`,
      )
    }
    return HttpResponse.json({ success: true, message: 'Role updated.' })
  }),

  http.post(`${API_PREFIX}/admin/users/:id/restrictions`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const body = (await request.json()) as { capability?: string; reason?: string }
    if (!body.capability || !body.reason) {
      return errorResponse(
        400,
        'FST_ERR_VALIDATION',
        'body/capability Required, body/reason Required',
      )
    }
    return HttpResponse.json({ success: true, message: 'Restriction applied.' })
  }),

  /*
   * Both DELETEs below REQUIRE a JSON body, verified live. A bodyless request
   * — the natural way to write a DELETE whose target is fully identified by the
   * path — is rejected before the handler runs.
   *
   * This mock used to accept anything, so the client shipped a bodyless DELETE
   * and every test passed while the real endpoint returned 400. A mock that is
   * laxer than the service it stands in for does not just miss bugs, it
   * actively certifies them.
   */
  http.delete(`${API_PREFIX}/admin/users/:id/restrictions/:rid`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const invalid = await requireJsonBody(request)
    if (invalid) return invalid
    return HttpResponse.json({ success: true, message: 'Restriction removed.' })
  }),

  http.delete(`${API_PREFIX}/admin/users/:id/sessions/:sid`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const invalid = await requireJsonBody(request)
    if (invalid) return invalid
    return HttpResponse.json({ success: true, message: 'Session revoked.' })
  }),

  http.post(`${API_PREFIX}/admin/users/:id/sessions/revoke-all`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    // Again: no reason required server-side. The client sends one regardless.
    return HttpResponse.json({
      success: true,
      message: 'All active sessions have been revoked.',
    })
  }),

  /* ------------------------------------------------------- Social Clubs */
  listHandler('/admin/social-clubs', socialClubs, {
    searchFields: ['id', 'title', 'hostName'],
    sortFields: ['title', 'createdAt', 'participantCount', 'status'],
    filters: {
      status: (row, value) => row.status === value,
      visibility: (row, value) => row.visibility === value,
      category: (row, value) => row.category === value,
      reported: (row, value) => String(row.openReportCount > 0) === value,
    },
  }),
  detailHandler('/admin/social-clubs', socialClubs, 'Social Club'),

  /* ------------------------------------------------------------- Hosts */
  listHandler('/admin/host-applications', hostApplications, {
    searchFields: ['id', 'displayName', 'userId'],
    sortFields: ['submittedAt', 'displayName', 'status'],
    filters: {
      status: (row, value) => row.status === value,
      country: (row, value) => row.countryCode === value,
    },
  }),
  detailHandler('/admin/host-applications', hostApplications, 'Host application'),

  listHandler('/admin/hosts', hostProfiles, {
    searchFields: ['id', 'displayName', 'userId'],
    sortFields: ['displayName', 'clubCount', 'approvedAt'],
    filters: { country: (row, value) => row.countryCode === value },
  }),
  detailHandler('/admin/hosts', hostProfiles, 'Host'),

  /* -------------------------------------------------------- Moderation */
  listHandler('/admin/moderation-cases', moderationCases, {
    searchFields: ['id', 'reference', 'targetName'],
    sortFields: ['createdAt', 'priority', 'status', 'reportCount'],
    filters: {
      status: (row, value) => row.status === value,
      priority: (row, value) => row.priority === value,
      category: (row, value) => row.category === value,
      targetType: (row, value) => row.targetType === value,
      escalated: (row, value) => String(row.escalated) === value,
    },
  }),
  detailHandler('/admin/moderation-cases', moderationCases, 'Moderation case'),

  /* ----------------------------------------------------------- Economy */
  listHandler('/admin/wallets', wallets, {
    searchFields: ['id', 'ownerId', 'ownerName'],
    sortFields: ['ownerName', 'availableDiamonds', 'lockedDiamonds', 'updatedAt'],
    filters: { ownerType: (row, value) => row.ownerType === value },
  }),
  detailHandler('/admin/wallets', wallets, 'Wallet'),

  listHandler('/admin/diamond-transactions', diamondTransactions, {
    searchFields: ['id', 'ownerName', 'counterpartyName', 'correlationId'],
    sortFields: ['createdAt', 'amount', 'type'],
    filters: {
      type: (row, value) => row.type === value,
      ownerId: (row, value) => row.ownerId === value,
      clubId: (row, value) => row.clubId === value,
    },
  }),
  detailHandler('/admin/diamond-transactions', diamondTransactions, 'Transaction'),

  listHandler('/admin/diamond-packages', diamondPackages, {
    searchFields: ['id', 'name'],
    sortFields: ['displayOrder', 'name', 'priceMinorUnits'],
    filters: {
      active: (row, value) => String(row.active) === value,
      market: (row, value) => row.marketCountry === value,
    },
  }),

  listHandler('/admin/gifts', gifts, {
    searchFields: ['id', 'name'],
    sortFields: ['displayOrder', 'name', 'diamondPrice'],
  }),

  listHandler('/admin/payout-rates', payoutRates, {
    searchFields: ['id'],
    sortFields: ['payoutCurrency', 'effectiveFrom'],
    filters: { active: (row, value) => String(row.active) === value },
  }),

  /* ----------------------------------------------------------- Finance */
  listHandler('/admin/payments', payments, {
    searchFields: ['id', 'userName', 'providerReference'],
    sortFields: ['createdAt', 'amountMinorUnits', 'status'],
    filters: {
      status: (row, value) => row.status === value,
      provider: (row, value) => row.provider === value,
      reconciled: (row, value) => String(row.reconciled) === value,
    },
  }),
  detailHandler('/admin/payments', payments, 'Payment'),

  listHandler('/admin/withdrawals', withdrawals, {
    searchFields: ['id', 'reference', 'hostName'],
    sortFields: ['createdAt', 'requestedDiamonds', 'state'],
    filters: {
      state: (row, value) => row.state === value,
      hostId: (row, value) => row.hostId === value,
      currency: (row, value) => row.calculation.currency === value,
    },
  }),
  detailHandler('/admin/withdrawals', withdrawals, 'Withdrawal'),

  /* ---------------------------------------------------- Administration */
  listHandler('/admin/audit-logs', auditLogs, {
    searchFields: ['id', 'actorName', 'targetLabel', 'correlationId', 'action'],
    sortFields: ['occurredAt', 'actorName', 'action'],
    filters: {
      actorId: (row, value) => row.actorId === value,
      action: (row, value) => row.action === value,
      targetType: (row, value) => row.targetType === value,
    },
  }),
  detailHandler('/admin/audit-logs', auditLogs, 'Audit entry'),

  listHandler('/admin/announcements', announcements, {
    searchFields: ['id', 'title'],
    sortFields: ['publishedAt', 'title', 'status'],
    filters: {
      status: (row, value) => row.status === value,
      channel: (row, value) => row.channel === value,
    },
  }),
  detailHandler('/admin/announcements', announcements, 'Announcement'),

  listHandler('/admin/admin-users', adminUsers, {
    searchFields: ['id', 'displayName', 'email'],
    sortFields: ['displayName', 'role', 'lastActiveAt'],
    filters: {
      role: (row, value) => row.role === value,
      status: (row, value) => row.status === value,
    },
  }),

  http.get(`${API_PREFIX}/admin/configuration`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    return HttpResponse.json({ data: configuration })
  }),
]
