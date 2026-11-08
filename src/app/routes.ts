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

  /**
   * Live stream management (plan.md §4, phase L0). One page with two tabs
   * (`?tab=live` default, `?tab=past`) and a room page.
   */
  liveStreams: '/live-streams',
  liveStream: (id: string) => `/live-streams/${encodeURIComponent(id)}`,
  /** The list, pre-filtered — `hostId` is undocumented but measured to work. */
  liveStreamsFor: (filter: { hostId?: string; tab?: 'live' | 'past' }) => {
    const params = new URLSearchParams()
    if (filter.tab === 'past') params.set('tab', 'past')
    if (filter.hostId) params.set('hostId', filter.hostId)
    const query = params.toString()
    return query ? `/live-streams?${query}` : '/live-streams'
  },

  moderation: '/moderation',
  moderationCase: (id: string) => `/moderation/${id}`,
  moderationReports: '/moderation/reports',

  /**
   * Diamond Wallet & Creator Economy (plan.md §4.1, phase W2).
   *
   * ⚠️ `/diamonds/*` was reserved here long before the module existed, and
   * `features/users/detail/panels.tsx` already calls it "the Diamond economy
   * module" in copy that is on screen. The namespace is reused rather than
   * renamed.
   *
   * `topUps` is the one slot that was not already cut — there is no counters
   * endpoint and no detail route for it, so one path serves the whole queue.
   */
  topUps: '/diamonds/top-ups',
  /**
   * The top-up queue searched for one payment. ⚠️ The search matches the
   * payment TrxID and the username — **not** the request id (measured
   * 2026-11-01), and there is no `/wallet/requests/:id` route — so a TrxID is
   * how one request is found.
   */
  topUpsFor: (search: string) =>
    `/diamonds/top-ups?${new URLSearchParams({ search }).toString()}`,
  diamondPackages: '/diamonds/packages',
  wallets: '/diamonds/wallets',
  wallet: (id: string) => `/diamonds/wallets/${id}`,
  /**
   * ⚠️ The **gift** ledger, under the name reserved for a diamond ledger that
   * does not exist yet (plan.md §3.3, O9). Top-ups and adjustments are not in
   * it.
   */
  diamondTransactions: '/diamonds/transactions',
  /** Phase G5. `senderId` and `receiverId` are the two filters measured to work. */
  giftLedger: (filter: {
    senderId?: string
    receiverId?: string
    contextId?: string
  }) => {
    const params = new URLSearchParams()
    if (filter.senderId) params.set('senderId', filter.senderId)
    if (filter.receiverId) params.set('receiverId', filter.receiverId)
    /* A live room's gifts: the gift's `contextId` is the room id (Live L2). */
    if (filter.contextId) params.set('contextId', filter.contextId)
    const query = params.toString()
    return query ? `/diamonds/transactions?${query}` : '/diamonds/transactions'
  },
  diamondTransaction: (id: string) => `/diamonds/transactions/${id}`,
  /**
   * The **wallet** ledger (plan.md §4, phases T1–T3): every diamond movement —
   * top-ups, adjustments, gifts, conversions. A new name rather than the
   * reserved `diamondTransactions`, which G5 links already point at the gift
   * ledger.
   */
  walletTransactions: '/diamonds/wallet-transactions',
  walletTransaction: (id: string) =>
    `/diamonds/wallet-transactions/${encodeURIComponent(id)}`,
  /** Into the wallet ledger, pre-filtered — from a user record or a row. */
  walletLedger: (filter: {
    userId?: string
    type?: string
    search?: string
    /** Bangladesh calendar days, `yyyy-MM-dd`. */
    fromDate?: string
    toDate?: string
  }) => {
    const params = new URLSearchParams()
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.type) params.set('type', filter.type)
    if (filter.search) params.set('search', filter.search)
    if (filter.fromDate) params.set('fromDate', filter.fromDate)
    if (filter.toDate) params.set('toDate', filter.toDate)
    const query = params.toString()
    return query
      ? `/diamonds/wallet-transactions?${query}`
      : '/diamonds/wallet-transactions'
  },
  adjustments: '/diamonds/adjustments',

  payments: '/payments',
  payment: (id: string) => `/payments/${id}`,
  /** Host withdrawals (plan.md W0). `settings` is matched before `:id`. */
  withdrawals: '/withdrawals',
  withdrawal: (id: string) => `/withdrawals/${encodeURIComponent(id)}`,
  withdrawalSettings: '/withdrawals/settings',
  withdrawalsFor: (filter: { userId?: string; status?: string }) => {
    const params = new URLSearchParams()
    if (filter.status) params.set('status', filter.status)
    if (filter.userId) params.set('userId', filter.userId)
    const query = params.toString()
    return query ? `/withdrawals?${query}` : '/withdrawals'
  },
  payoutRates: '/payout-rates',
  reconciliation: '/reconciliation',

  reports: '/reports',

  notifications: '/notifications',
  notificationCreate: '/notifications/create',
  notification: (id: string) => `/notifications/${id}`,

  /**
   * Staff & Access Control (staff_management_plan.md §4.1).
   *
   * Replaces the `/admin-users` and `/roles` placeholders reserved by plan.md
   * §10B. `/roles` is gone rather than renamed: it stood for a role builder,
   * and the backend has two fixed staff roles and a flat list of eight module
   * keys — there is no role to build.
   *
   * `/staff/new` is a route rather than a modal because provisioning is six
   * fields plus an eight-key permission grid, and because the grid needs room
   * to explain what each key actually unlocks.
   */
  staff: '/staff',
  staffNew: '/staff/new',
  staffMember: (id: string) => `/staff/${id}`,

  /**
   * Feedback & Support (feedback_management_plan.md §4.1).
   *
   * Two routes and no `/new`: there is no admin submit endpoint, and a "New
   * ticket" button would file a report as the acting Super Admin against
   * themselves.
   *
   * Status is a query parameter rather than a route segment, so a filtered
   * queue round-trips through a deep link the way every other list in the
   * panel does.
   */
  feedback: '/feedback',
  feedbackTicket: (id: string) => `/feedback/${id}`,

  /**
   * Verification & Compliance (plan.md §4.1).
   *
   * Two routes and no `/new`: there is no admin submit endpoint, and an admin
   * filing a verification would be submitting their own identity documents.
   *
   * A route rather than a drawer for the application, because it holds
   * documents, a decision and an audit trail — and because it must be linkable:
   * *"take a look at this one"* is how compliance work gets shared.
   *
   * Status is a query parameter, so a filtered queue round-trips through a deep
   * link the way every other list in the panel does.
   */
  verifications: '/verifications',
  verification: (id: string) => `/verifications/${id}`,

  /**
   * Official Announcements (plan.md §4.1).
   *
   * **One route, and deliberately no `/announcements/:id`.** There is no
   * `GET /admin/announcements/:id` to hang a detail page on — it answers
   * `ROUTE_NOT_FOUND` — and the list row already carries the whole record, so
   * there is nothing a detail page could show that the queue does not (§3.2).
   *
   * No `/new` either: composing is a dialog over the list. Staff earned a route
   * because it has six fields plus an eight-key permission grid that needs room
   * to explain itself; an announcement is a headline, a body and four selects.
   *
   * Filters round-trip as query parameters (`?status=DRAFT`), the way every
   * other list in this panel does.
   */
  announcements: '/announcements',
  /**
   * Legal & policies (plan.md §3, LG0). `new` is matched before `:id`.
   * `legalFor` keeps the overview's tab and type filter in the query string.
   */
  legal: '/legal',
  legalFor: (filter: { tab?: string; type?: string }) => {
    const query = new URLSearchParams()
    if (filter.tab) query.set('tab', filter.tab)
    if (filter.type) query.set('type', filter.type)
    const text = query.toString()
    return text ? `/legal?${text}` : '/legal'
  },
  legalNew: (type?: string, fromId?: string) => {
    const query = new URLSearchParams()
    if (type) query.set('type', type)
    if (fromId) query.set('from', fromId)
    const text = query.toString()
    return text ? `/legal/new?${text}` : '/legal/new'
  },
  legalDoc: (id: string) => `/legal/${encodeURIComponent(id)}`,
  legalEdit: (id: string) => `/legal/${encodeURIComponent(id)}/edit`,
  /**
   * Emoji packs (plan.md §3.4, phase G4). **In Platform, not under
   * `/diamonds`** — a pack has no price, and the Diamonds section is about
   * money.
   */
  emojiPacks: '/emoji-packs',
  /**
   * The gift catalog (plan.md §4, phase T0). **Moved to Platform 2026-11-01**,
   * beside emoji packs: both are staff-curated content pushed to every client.
   * Its old address redirects here, so G2–G6 links and bookmarks keep
   * working.
   */
  gifts: '/gift-catalog',
  legacyGifts: '/diamonds/gifts',

  auditLogs: '/audit-logs',
  auditLog: (id: string) => `/audit-logs/${id}`,

  /**
   * System Settings (system_settings_plan.md §4.1).
   *
   * Every section is a real URL rather than in-page tab state, so an operator
   * can bookmark one, link a colleague to it, and — where a section is Super
   * Admin only — land on a 403 for that section instead of for the whole page.
   *
   * `configuration` below is the old placeholder path and is retained only
   * until nothing references it.
   */
  settings: '/settings',
  settingsGeneral: '/settings/general',
  settingsBranding: '/settings/branding',
  settingsMaintenance: '/settings/maintenance',
  settingsChat: '/settings/chat',
  settingsPlatform: '/settings/platform',
  /**
   * Diamond economy (plan.md §4.3, phase W7).
   *
   * ⚠️ In `/settings/*` rather than `/diamonds/*`, although the diamonds
   * module owns the endpoint. `PATCH /admin/settings/economy` writes the same
   * `id: "primary"` singleton every other tab here writes, and two features
   * mutating one record through two optimistic paths is the class of bug the
   * bootstrap work spent a phase removing.
   */
  settingsEconomy: '/settings/economy',
  /**
   * Bootstrap Configuration (plan.md §4.1).
   *
   * Platform is a **query parameter**, not a route segment: it is a view of
   * the same screen, and `?platform=IOS` round-trips through a deep link the
   * way every other filter in this panel does.
   */
  settingsBootstrap: '/settings/bootstrap',
  settingsDatabase: '/settings/database',
  settingsSms: '/settings/sms',

  configuration: '/configuration',

  /** Dev-only component gallery (plan.md §1F). */
  design: '/_design',

  forbidden: '/403',
  notFound: '/404',
} as const
