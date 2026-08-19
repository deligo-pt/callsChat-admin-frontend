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

const EMPTY: Paginated<never> = {
  data: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
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

    return HttpResponse.json(record)
  })
}

export const resourceHandlers = [
  /* ---------------------------------------------------------------- Users */
  listHandler('/admin/users', users, {
    searchFields: ['id', 'displayName', 'maskedPhone'],
    sortFields: ['displayName', 'registeredAt', 'lastActiveAt', 'status'],
    filters: {
      status: (row, value) => row.status === value,
      isHost: (row, value) => String(row.isHost) === value,
      hasRestrictions: (row, value) => String(row.activeRestrictionCount > 0) === value,
      country: (row, value) => row.countryCode === value,
    },
  }),
  detailHandler('/admin/users', users, 'User'),

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
    searchFields: ['id', 'name', 'email'],
    sortFields: ['name', 'role', 'lastSignInAt'],
    filters: {
      role: (row, value) => row.role === value,
      active: (row, value) => String(row.active) === value,
    },
  }),

  http.get(`${API_PREFIX}/admin/configuration`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    return HttpResponse.json({ data: configuration })
  }),
]
