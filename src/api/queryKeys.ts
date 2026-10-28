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

  hostApplications: {
    ...domain('host-applications'),
    /*
     * ⚠️ Its own key, deliberately outside `list`. The stats route takes no
     * query parameters and ignores every filter, so keying it by the queue's
     * params would refetch six platform-wide counters every time an operator
     * narrowed the table — and cache six identical copies under six keys.
     */
    stats: () => ['host-applications', 'stats'] as const,
    /*
     * ⚠️ **A fallback key, used only while `stats` is a 404** (plan.md W0, O1).
     * Each entry is one `limit=1` read whose only purpose is `pagination.total`
     * for one status. Kept out of `list` so a count can never be mistaken for a
     * page of rows, and so the whole fallback can be invalidated in one call
     * the day the stats route comes back.
     */
    count: (params?: ListParams) =>
      ['host-applications', 'count', params ?? {}] as const,
  },
  hosts: {
    ...domain('hosts'),
    count: (params?: ListParams) => ['hosts', 'count', params ?? {}] as const,
  },

  moderation: {
    ...domain('moderation-cases'),
    reports: (params?: ListParams) =>
      ['moderation-cases', 'reports', params ?? {}] as const,
  },

  wallets: domain('wallets'),
  diamondTransactions: domain('diamond-transactions'),
  diamondPackages: domain('diamond-packages'),
  /** The manual top-up queue — `GET /admin/wallet/requests` (plan.md §5, W2). */
  topUpRequests: domain('top-up-requests'),
  gifts: domain('gifts'),
  /** The gift ledger — not `diamondTransactions`, which it is not (plan.md O9, G5). */
  giftTransactions: domain('gift-transactions'),
  /** Emoji packs with their nested emojis (plan.md §3.4, G4). */
  emojiPacks: domain('emoji-packs'),
  payoutRates: domain('payout-rates'),

  payments: domain('payments'),
  withdrawals: domain('withdrawals'),

  auditLogs: domain('audit-logs'),

  /**
   * Official Announcements (plan.md §4.4).
   *
   * `all` is the invalidation root every write targets, and here that is a
   * correctness requirement rather than a convenience. There is **no
   * `GET /admin/announcements/:id`** (plan.md §3.2), so the list is the only
   * thing that can show the result of a write — nothing may be patched from a
   * create, an update or a pin response, because those shapes are unobserved.
   *
   * `stats` sits under the same root so a publish refreshes the counters the
   * queue header shows. It takes no parameters: the endpoint is platform-wide
   * and ignores every filter.
   *
   * ⚠️ `details()` and `detail()` come along from {@link domain} and are
   * **unusable** — there is no route behind them. Left rather than carved out
   * because a hand-rolled object would drift from every sibling, but nothing
   * should ever reference them.
   */
  announcements: {
    ...domain('announcements'),
    stats: () => ['announcements', 'stats'] as const,
  },
  /**
   * Staff & Access Control (staff_management_plan.md §4.5).
   *
   * `all` is the invalidation root every staff mutation targets. That is not a
   * convenience: a status change revokes sessions, and the mutation's own
   * response reports the counts from *before* the revocation (§3.7). Both the
   * list and the detail must be refetched, never patched from the response, or
   * the directory shows live sessions on an account whose sessions were just
   * destroyed — precisely the fact the operator is checking.
   */
  staff: domain('staff'),

  /**
   * Feedback & Support (feedback_management_plan.md §4.5).
   *
   * `all` is the invalidation root every feedback mutation targets, and — as
   * with staff — that is a correctness requirement rather than a convenience.
   * `PATCH /:id/status` returns one of two different shapes depending on which
   * backend process answers (§3.2), and `POST /:id/reply` silently rewrites
   * `adminResponse` (§3.3). Neither response may seed the cache; both the
   * queue and the ticket must be refetched.
   *
   * `stats` sits under the same root so a transition refreshes the counters
   * the queue header shows. It takes no parameters — the endpoint is global
   * and ignores every filter.
   */
  feedback: {
    ...domain('feedback'),
    stats: () => ['feedback', 'stats'] as const,
  },

  /**
   * Verification & Compliance (plan.md §4.4).
   *
   * `all` is the invalidation root every decision targets, and — as with staff
   * and feedback — that is a correctness requirement. A decision rewrites the
   * application, appends to its audit trail and touches the applicant's account
   * in one transaction, while the response carries three keys
   * (`verificationDecisionResponseSchema`). Nothing may be patched from it.
   *
   * ⚠️ There is deliberately **no key for a document**. The stream is not query
   * data: every fetch writes a `VIEWED_DOCUMENT` audit row naming the acting
   * admin and their IP, so caching one would let a remount, a refocus or a
   * background refetch forge a record of a human opening someone's passport
   * (plan.md §3.3). Documents are fetched imperatively, once, on a click.
   */
  verifications: domain('verifications'),

  /**
   * System Settings (system_settings_plan.md §4.4).
   *
   * `all` is the invalidation root every settings mutation targets, so a save
   * on one tab refreshes the sibling reads that share the same singleton
   * record. `publicConfig` sits under it on purpose: it is a different shape
   * from a different route, but it is the same underlying data, and it must
   * never be left stale after a write.
   */
  configuration: {
    all: ['configuration'] as const,
    settings: ['configuration', 'settings'] as const,
    backups: (params?: ListParams) =>
      ['configuration', 'backups', params ?? {}] as const,
    sms: ['configuration', 'sms'] as const,
    publicConfig: ['configuration', 'public'] as const,
    /**
     * Bootstrap is keyed on the **composite pair** `(platform, appType)`,
     * because the four are independent records rather than four views of one
     * (plan.md §2.1) — verified by writing to Android and watching iOS stay
     * put. One shared key would let a write to one record serve another's
     * cached copy.
     *
     * ⚠️ **Both halves are load-bearing.** Keyed on `platform` alone, opening
     * Business would be served the cached Personal record for the same
     * platform — the operator would edit, and save, a record they were never
     * shown. That is the dual-app version of the bug this key already
     * prevented between Android and iOS.
     */
    bootstrap: (platform: string, appType: string) =>
      ['configuration', 'bootstrap', platform, appType] as const,
  },

  search: (term: string) => ['search', term] as const,
} as const
