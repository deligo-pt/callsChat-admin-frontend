/**
 * Typed route paths.
 *
 * Every navigation target in the app comes from here, so a route rename is a
 * one-file change and a typo is a compile error rather than a dead link.
 */
export const ROUTES = {
  login: '/login',

  dashboard: '/dashboard',

  /** Self-service credential management for the signed-in admin. */
  account: '/account',

  users: '/users',
  user: (id: string) => `/users/${id}`,

  socialClubs: '/social-clubs',
  socialClubsActive: '/social-clubs/active',
  socialClub: (id: string) => `/social-clubs/${id}`,

  hostApplications: '/host-applications',
  hostApplication: (id: string) => `/host-applications/${id}`,
  hosts: '/hosts',
  host: (id: string) => `/hosts/${id}`,

  moderation: '/moderation',
  moderationCase: (id: string) => `/moderation/${id}`,
  moderationReports: '/moderation/reports',

  diamondPackages: '/diamonds/packages',
  gifts: '/diamonds/gifts',
  wallets: '/diamonds/wallets',
  wallet: (id: string) => `/diamonds/wallets/${id}`,
  diamondTransactions: '/diamonds/transactions',
  diamondTransaction: (id: string) => `/diamonds/transactions/${id}`,
  adjustments: '/diamonds/adjustments',

  payments: '/payments',
  payment: (id: string) => `/payments/${id}`,
  withdrawals: '/withdrawals',
  withdrawal: (id: string) => `/withdrawals/${id}`,
  payoutRates: '/payout-rates',
  reconciliation: '/reconciliation',

  reports: '/reports',

  notifications: '/notifications',
  notificationCreate: '/notifications/create',
  notification: (id: string) => `/notifications/${id}`,

  adminUsers: '/admin-users',
  adminUser: (id: string) => `/admin-users/${id}`,
  roles: '/roles',

  auditLogs: '/audit-logs',
  auditLog: (id: string) => `/audit-logs/${id}`,

  configuration: '/configuration',

  /** Dev-only component gallery (plan.md §1F). */
  design: '/_design',

  forbidden: '/403',
  notFound: '/404',
} as const
