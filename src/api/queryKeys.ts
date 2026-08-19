import type { ListParams } from '@/types/common'

/**
 * Central query key factory (plan.md §2.3).
 *
 * Keys are hierarchical so a mutation can invalidate precisely — the detail
 * and audit views of one record, or a whole list — instead of nuking the cache
 * and re-fetching everything.
 *
 *   queryKeys.users.all      -> ['users']
 *   queryKeys.users.list(f)  -> ['users', 'list', f]
 *   queryKeys.users.detail(1)-> ['users', 'detail', '1']
 *   queryKeys.users.audit(1) -> ['users', 'audit', '1']
 */
function domain(name: string) {
  return {
    all: [name] as const,
    lists: () => [name, 'list'] as const,
    list: (params?: ListParams) => [name, 'list', params ?? {}] as const,
    details: () => [name, 'detail'] as const,
    detail: (id: string) => [name, 'detail', id] as const,
    audit: (id: string) => [name, 'audit', id] as const,
  }
}

export const queryKeys = {
  session: { current: ['session', 'me'] as const },

  users: {
    ...domain('users'),
    sessions: (id: string) => ['users', 'sessions', id] as const,
    reports: (id: string) => ['users', 'reports', id] as const,
    restrictions: (id: string) => ['users', 'restrictions', id] as const,
  },

  socialClubs: {
    ...domain('social-clubs'),
    active: (params?: ListParams) => ['social-clubs', 'active', params ?? {}] as const,
    members: (id: string) => ['social-clubs', 'members', id] as const,
  },

  hostApplications: domain('host-applications'),
  hosts: domain('hosts'),

  moderation: {
    ...domain('moderation-cases'),
    reports: (params?: ListParams) =>
      ['moderation-cases', 'reports', params ?? {}] as const,
  },

  wallets: domain('wallets'),
  diamondTransactions: domain('diamond-transactions'),
  diamondPackages: domain('diamond-packages'),
  gifts: domain('gifts'),
  payoutRates: domain('payout-rates'),

  payments: domain('payments'),
  withdrawals: domain('withdrawals'),

  auditLogs: domain('audit-logs'),
  announcements: domain('announcements'),
  adminUsers: domain('admin-users'),
  roles: { all: ['roles'] as const },
  configuration: { all: ['configuration'] as const },

  search: (term: string) => ['search', term] as const,
} as const
