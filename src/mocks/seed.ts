import { maskPhone, maskReference } from '@/lib/mask'
import type {
  AdminUser,
  Announcement,
  AuditLog,
  ConfigurationEntry,
  DiamondPackage,
  DiamondTransaction,
  DiamondWallet,
  Gift,
  HostApplication,
  HostProfile,
  ModerationCaseDetail,
  PaymentTransaction,
  PayoutRate,
  Report,
  SocialClubDetail,
  UserSummary,
  WithdrawalDetail,
} from '@/types'
import { CAPABILITY_VALUES } from '@/types/identity'

import { createRandom } from './random'

const rng = createRandom(20260819)

/* -------------------------------------------------------------------------
 * Name pools — synthetic only. plan.md §3.1: nothing here is real user data,
 * and nothing resembles message, call or media content.
 * ---------------------------------------------------------------------- */

const FIRST_NAMES = [
  'Ayesha',
  'Marcus',
  'Sofia',
  'Kenji',
  'Amara',
  'Tomas',
  'Nadia',
  'Liam',
  'Priya',
  'Diego',
  'Hana',
  'Omar',
  'Elena',
  'Noah',
  'Fatima',
  'Lucas',
  'Mei',
  'Ibrahim',
  'Clara',
  'Yusuf',
  'Ingrid',
  'Rafael',
  'Zara',
  'Anders',
]

const LAST_NAMES = [
  'Rahman',
  'Feld',
  'Almeida',
  'Watanabe',
  'Okonkwo',
  'Ricci',
  'Chowdhury',
  'Novak',
  'Sharma',
  'Morales',
  'Tanaka',
  'Haddad',
  'Petrova',
  'Bergman',
  'Khan',
  'Silva',
  'Chen',
  'Diallo',
  'Rossi',
  'Aydin',
]

const COUNTRIES = [
  'BD',
  'DE',
  'BR',
  'JP',
  'NG',
  'IT',
  'US',
  'GB',
  'IN',
  'FR',
  'ES',
  'TR',
]
const DIAL_CODES: Record<string, string> = {
  BD: '+880',
  DE: '+49',
  BR: '+55',
  JP: '+81',
  NG: '+234',
  IT: '+39',
  US: '+1',
  GB: '+44',
  IN: '+91',
  FR: '+33',
  ES: '+34',
  TR: '+90',
}

const CLUB_TOPICS = [
  'Morning Coffee Talk',
  'Language Exchange',
  'Indie Music Corner',
  'Startup Founders',
  'Late Night Stories',
  'Travel Tales',
  'Book Circle',
  'Career Advice Hour',
  'Football Banter',
  'Study Together',
  'Art & Design',
  'Cooking Basics',
  'Mindfulness Session',
  'Tech Support Hour',
  'Open Mic',
]

const CLUB_CATEGORIES = [
  'Social',
  'Education',
  'Music',
  'Business',
  'Wellness',
  'Gaming',
]

function fullName(): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
}

function id(prefix: string, index: number): string {
  return `${prefix}_${(index + 1).toString().padStart(6, '0')}`
}

/* -------------------------------------------------------------------------
 * Users — 500
 * ---------------------------------------------------------------------- */

/**
 * Seed users.
 *
 * The shape matches the VERIFIED `GET /admin/users` row exactly (plan.md
 * §10.3) so the mock and the live API are interchangeable — that is the whole
 * point of the mock layer, and a divergence here would mean Phase 3A was built
 * against a lie.
 *
 * `wallet`, `countryCode` and `maskedPhone` are extra fields consumed by
 * modules whose contracts are NOT yet verified (§10.5). They are stripped by
 * `userSummarySchema` on parse, so they never reach the user directory — they
 * exist purely to keep the other seed collections coherent until those phases
 * verify their own shapes.
 */
type SeedUser = UserSummary & {
  readonly countryCode: string
  readonly maskedPhone: string
  readonly wallet: { availableDiamonds: number; lockedDiamonds: number }
}

/**
 * Status mix. Weighted towards ACTIVE and PENDING_VERIFICATION because that is
 * what the live data looks like, while still guaranteeing enough SUSPENDED and
 * BANNED records to exercise every badge and filter.
 */
function seedStatus(): UserSummary['status'] {
  const roll = rng.int(1, 100)
  if (roll <= 55) return 'ACTIVE'
  if (roll <= 80) return 'PENDING_VERIFICATION'
  if (roll <= 88) return 'INACTIVE'
  if (roll <= 96) return 'SUSPENDED'
  return 'BANNED'
}

/**
 * Narrow to the three-state status that the still-unverified modules
 * (§10.5) model. Widening those types on speculation would be inventing a
 * contract; clamping here keeps this file honest until each phase verifies
 * its own shapes.
 */
function legacyStatus(
  status: UserSummary['status'],
): 'ACTIVE' | 'SUSPENDED' | 'BANNED' {
  return status === 'SUSPENDED' || status === 'BANNED' ? status : 'ACTIVE'
}

export const users: SeedUser[] = Array.from({ length: 500 }, (_, index) => {
  const country = rng.pick(COUNTRIES)
  const status = seedStatus()
  const isHost = rng.bool(0.18)
  const name = fullName()
  const phone = `${DIAL_CODES[country] ?? '+1'}${rng.int(700000000, 799999999)}`
  const handle = name.toLowerCase().replace(/\s+/g, '.')

  const restrictionCount = status === 'ACTIVE' && rng.bool(0.14) ? rng.int(1, 3) : 0
  const capabilities = CAPABILITY_VALUES

  return {
    id: id('usr', index),
    displayName: name,
    username: rng.bool(0.8) ? handle.replace(/\./g, '') : null,
    avatarUrl: null,
    email: rng.bool(0.6) ? `${handle}@example.com` : null,
    /* The API returns both; the UI is expected to render only the masked one. */
    phone,
    phoneMasked: maskPhone(phone),
    role: 'USER',
    status,
    accountType: rng.bool(0.12) ? 'BUSINESS' : 'PERSONAL',
    isHost,
    activeRestrictions: Array.from(
      { length: restrictionCount },
      (_unused, rIndex) => capabilities[(index + rIndex) % capabilities.length]!,
    ),
    createdAt: rng.pastDate(540, 1),
    lastActiveAt: status === 'BANNED' ? rng.pastDate(90, 30) : rng.pastDate(14, 0),

    /* Extras for unverified modules — see the note above. */
    countryCode: country,
    maskedPhone: maskPhone(phone),
    wallet: {
      availableDiamonds: rng.int(0, 120000),
      lockedDiamonds: isHost && rng.bool(0.3) ? 10000 : 0,
    },
  } satisfies SeedUser
})

const hostUsers = users.filter((user) => user.isHost)

/* -------------------------------------------------------------------------
 * Social Clubs — 60
 * ---------------------------------------------------------------------- */

export const socialClubs: SocialClubDetail[] = Array.from(
  { length: 60 },
  (_, index) => {
    const host = hostUsers[index % hostUsers.length] ?? users[0]!
    const status = rng.bool(0.25)
      ? 'ACTIVE'
      : rng.bool(0.5)
        ? 'ENDED'
        : rng.bool(0.6)
          ? 'SCHEDULED'
          : 'DISABLED'
    const participantCount = status === 'ACTIVE' ? rng.int(3, 180) : rng.int(0, 90)
    const createdAt = rng.pastDate(200, 1)

    return {
      id: id('clb', index),
      title: `${rng.pick(CLUB_TOPICS)} #${index + 1}`,
      description: 'Community space for scheduled group conversation.',
      category: rng.pick(CLUB_CATEGORIES),
      hostId: host.id,
      hostName: host.displayName,
      status,
      visibility:
        status === 'DISABLED' ? 'HIDDEN' : rng.bool(0.8) ? 'PUBLIC' : 'UNLISTED',
      discoverable: status !== 'DISABLED' && rng.bool(0.85),
      participantCount,
      openReportCount: rng.bool(0.22) ? rng.int(1, 5) : 0,
      createdAt,
      startedAt: status === 'SCHEDULED' ? null : createdAt,
      endedAt: status === 'ENDED' ? rng.pastDate(30, 0) : null,
      durationSeconds: status === 'ENDED' ? rng.int(600, 14400) : null,
      giftSummary: {
        giftCount: rng.int(0, 400),
        diamondsGifted: rng.int(0, 250000),
      },
      members: Array.from({ length: Math.min(participantCount, 12) }, (_, mIndex) => {
        const member = users[(index * 7 + mIndex * 13) % users.length]!
        return {
          id: id(`mem_${index}`, mIndex),
          userId: member.id,
          displayName: member.displayName,
          role: mIndex === 0 ? 'HOST' : mIndex < 3 ? 'MODERATOR' : 'PARTICIPANT',
          joinedAt: rng.pastDate(30, 0),
          leftAt: null,
        }
      }),
    } satisfies SocialClubDetail
  },
)

/* -------------------------------------------------------------------------
 * Host applications — 40
 * ---------------------------------------------------------------------- */

export const hostApplications: HostApplication[] = Array.from(
  { length: 40 },
  (_, index) => {
    const user = users[(index * 11) % users.length]!
    const status = index < 18 ? 'SUBMITTED' : rng.bool(0.65) ? 'APPROVED' : 'REJECTED'
    const submittedAt = rng.pastDate(90, 0)

    return {
      id: id('hap', index),
      userId: user.id,
      displayName: user.displayName,
      maskedPhone: user.maskedPhone,
      countryCode: user.countryCode,
      introduction:
        'I would like to host weekly conversation sessions for my local community and help newcomers practise speaking.',
      status,
      submittedAt,
      reviewedAt: status === 'SUBMITTED' ? null : rng.pastDate(60, 0),
      reviewerName: status === 'SUBMITTED' ? null : 'Tomas Ricci',
      decisionReason:
        status === 'APPROVED'
          ? 'Profile complete and no safety history. Approved for hosting.'
          : status === 'REJECTED'
            ? 'Open moderation case against this account; re-apply after resolution.'
            : null,
      applicantStatus: legacyStatus(user.status),
    } satisfies HostApplication
  },
)

export const hostProfiles: HostProfile[] = hostUsers.slice(0, 60).map((user, index) => {
  const available = rng.int(0, 180000)
  return {
    id: id('hst', index),
    userId: user.id,
    displayName: user.displayName,
    approved: true,
    approvedAt: rng.pastDate(300, 10),
    countryCode: user.countryCode,
    clubCount: rng.int(0, 6),
    openReportCount: rng.bool(0.2) ? rng.int(1, 4) : 0,
    earnings: {
      availableDiamonds: available,
      lockedDiamonds: user.wallet?.lockedDiamonds ?? 0,
      withdrawalThreshold: 10000,
      eligibleForWithdrawal: available >= 10000,
    },
  } satisfies HostProfile
})

/* -------------------------------------------------------------------------
 * Diamond economy
 * ---------------------------------------------------------------------- */

export const diamondPackages: DiamondPackage[] = [
  { market: 'US', currency: 'USD', price: 499, diamonds: 500, name: 'Starter (US)' },
  { market: 'US', currency: 'USD', price: 1999, diamonds: 2200, name: 'Plus (US)' },
  { market: 'US', currency: 'USD', price: 4999, diamonds: 6000, name: 'Pro (US)' },
  { market: 'DE', currency: 'EUR', price: 499, diamonds: 450, name: 'Starter (EU)' },
  { market: 'DE', currency: 'EUR', price: 1999, diamonds: 2000, name: 'Plus (EU)' },
  { market: 'BD', currency: 'BDT', price: 29900, diamonds: 500, name: 'Starter (BD)' },
  { market: 'JP', currency: 'JPY', price: 600, diamonds: 500, name: 'Starter (JP)' },
].map((entry, index) => ({
  id: id('dpk', index),
  name: entry.name,
  marketCountry: entry.market,
  currency: entry.currency,
  priceMinorUnits: entry.price,
  diamondsGranted: entry.diamonds,
  providerProductId: `prod_${entry.market.toLowerCase()}_${entry.diamonds}`,
  active: index !== 6,
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveTo: null,
  displayOrder: index,
  version: 1,
}))

export const gifts: Gift[] = [
  { name: 'Wave', price: 10 },
  { name: 'Coffee', price: 50 },
  { name: 'Bouquet', price: 200 },
  { name: 'Spotlight', price: 1000 },
  { name: 'Crown', price: 5000 },
].map((entry, index) => ({
  id: id('gft', index),
  name: entry.name,
  diamondPrice: entry.price,
  active: true,
  displayOrder: index,
}))

export const payoutRates: PayoutRate[] = [
  { market: 'US', currency: 'USD', gross: 4000, feeFixed: 0, feeBps: 1000 },
  { market: 'DE', currency: 'EUR', gross: 3700, feeFixed: 0, feeBps: 1000 },
  { market: 'BD', currency: 'BDT', gross: 440000, feeFixed: 0, feeBps: 1200 },
].map((entry, index) => ({
  id: id('pyr', index),
  marketCountry: entry.market,
  payoutCurrency: entry.currency,
  eligibleDiamondBasis: 10000,
  grossPayoutMinorUnits: entry.gross,
  feeType: 'PERCENTAGE' as const,
  feeFixedMinorUnits: entry.feeFixed,
  feePercentageBps: entry.feeBps,
  active: true,
  effectiveFrom: '2026-01-01T00:00:00Z',
  effectiveTo: null,
  version: 1,
}))

export const wallets: DiamondWallet[] = users.slice(0, 200).map((user, index) => ({
  id: id('wal', index),
  ownerId: user.id,
  ownerName: user.displayName,
  ownerType: user.isHost ? 'HOST' : 'USER',
  availableDiamonds: user.wallet?.availableDiamonds ?? 0,
  lockedDiamonds: user.wallet?.lockedDiamonds ?? 0,
  version: rng.int(1, 40),
  updatedAt: rng.pastDate(30, 0),
}))

const TX_TYPES = [
  'PURCHASE_CREDIT',
  'GIFT_DEBIT',
  'GIFT_EARNING_CREDIT',
  'ADJUSTMENT_CREDIT',
  'ADJUSTMENT_DEBIT',
  'WITHDRAWAL_LOCK',
  'WITHDRAWAL_RELEASE',
  'PAYOUT_SETTLEMENT',
] as const

export const diamondTransactions: DiamondTransaction[] = Array.from(
  { length: 5000 },
  (_, index) => {
    const wallet = wallets[index % wallets.length]!
    const type = rng.pick(TX_TYPES)
    const isDebit = type.includes('DEBIT') || type === 'WITHDRAWAL_LOCK'
    const magnitude = rng.int(10, 5000)
    const counterparty = rng.bool(0.6) ? users[(index * 3) % users.length]! : null

    return {
      id: id('dtx', index),
      type,
      amount: isDebit ? -magnitude : magnitude,
      walletId: wallet.id,
      ownerId: wallet.ownerId,
      ownerName: wallet.ownerName,
      counterpartyId: counterparty?.id ?? null,
      counterpartyName: counterparty?.displayName ?? null,
      clubId: rng.bool(0.35)
        ? (socialClubs[index % socialClubs.length]?.id ?? null)
        : null,
      relatedTransactionId: null,
      idempotencyKey: `idem_${index.toString().padStart(8, '0')}`,
      correlationId: `corr_${index.toString().padStart(10, '0')}`,
      createdAt: rng.pastDate(365, 0),
    } satisfies DiamondTransaction
  },
)

/* -------------------------------------------------------------------------
 * Payments — 300
 * ---------------------------------------------------------------------- */

export const payments: PaymentTransaction[] = Array.from(
  { length: 300 },
  (_, index) => {
    const user = users[(index * 5) % users.length]!
    const pkg = diamondPackages[index % diamondPackages.length]!
    const status = rng.bool(0.82)
      ? 'SUCCEEDED'
      : rng.bool(0.5)
        ? 'FAILED'
        : rng.bool(0.6)
          ? 'PENDING'
          : rng.bool(0.5)
            ? 'REFUNDED'
            : 'CHARGEBACK'
    const createdAt = rng.pastDate(180, 0)

    return {
      id: id('pay', index),
      userId: user.id,
      userName: user.displayName,
      provider: rng.bool(0.7) ? 'stripe' : 'paypal',
      providerReference: `pi_${index.toString(36).padStart(14, '0')}`,
      packageSnapshot: {
        packageId: pkg.id,
        packageVersion: pkg.version,
        name: pkg.name,
        currency: pkg.currency,
        priceMinorUnits: pkg.priceMinorUnits,
        diamondsGranted: pkg.diamondsGranted,
      },
      amountMinorUnits: pkg.priceMinorUnits,
      currency: pkg.currency,
      status,
      attemptCount: status === 'FAILED' ? rng.int(2, 4) : 1,
      webhookEventId: status === 'PENDING' ? null : `evt_${index.toString(36)}`,
      failureReason: status === 'FAILED' ? 'Card declined by issuer.' : null,
      reconciled: status === 'SUCCEEDED' ? rng.bool(0.9) : false,
      createdAt,
      processedAt: status === 'PENDING' ? null : createdAt,
    } satisfies PaymentTransaction
  },
)

/* -------------------------------------------------------------------------
 * Withdrawals — 80
 * ---------------------------------------------------------------------- */

const WITHDRAWAL_STATES = [
  'PENDING',
  'PENDING',
  'UNDER_REVIEW',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'COMPLETED',
  'REJECTED',
  'FAILED',
] as const

/** The backend owns this graph; the mock mirrors it (plan.md §8B). */
const NEXT_STATES: Record<string, readonly string[]> = {
  PENDING: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  REJECTED: [],
  FAILED: ['PROCESSING'],
}

export const withdrawals: WithdrawalDetail[] = Array.from(
  { length: 80 },
  (_, index) => {
    const host = hostProfiles[index % hostProfiles.length]!
    const state = WITHDRAWAL_STATES[index % WITHDRAWAL_STATES.length]!
    const rate = payoutRates[index % payoutRates.length]!
    const multiplier = rng.int(1, 6)
    const requested = rate.eligibleDiamondBasis * multiplier
    const gross = rate.grossPayoutMinorUnits * multiplier
    const fee =
      Math.round((gross * rate.feePercentageBps) / 10000) + rate.feeFixedMinorUnits
    const createdAt = rng.pastDate(120, 0)
    const user = users.find((candidate) => candidate.id === host.userId)

    return {
      id: id('wdr', index),
      reference: `WD-${(10000 + index).toString()}`,
      hostId: host.id,
      hostName: host.displayName,
      state,
      requestedDiamonds: requested,
      lockedDiamonds: ['COMPLETED', 'REJECTED', 'FAILED'].includes(state)
        ? 0
        : requested,
      calculation: {
        payoutRateId: rate.id,
        payoutRateVersion: rate.version,
        requestedDiamonds: requested,
        grossMinorUnits: gross,
        feeMinorUnits: fee,
        netMinorUnits: gross - fee,
        currency: rate.payoutCurrency,
        appliedAt: createdAt,
      },
      payoutProfile: {
        id: id('pof', index),
        providerKey: rng.bool(0.6) ? 'stripe' : 'paypal',
        methodType: rng.bool(0.5) ? 'BANK_ACCOUNT' : 'WALLET',
        country: host.countryCode ?? 'US',
        currency: rate.payoutCurrency,
        maskedReference: maskReference(`acct_${index.toString(36).padStart(14, '0')}`),
        verificationStatus: 'VERIFIED',
      },
      hostAccountStatus: user ? legacyStatus(user.status) : 'ACTIVE',
      hostActiveRestrictionCount: user?.activeRestrictions.length ?? 0,
      previousWithdrawalCount: rng.int(0, 12),
      payoutReference: ['PROCESSING', 'COMPLETED'].includes(state)
        ? `po_${index.toString(36).padStart(12, '0')}`
        : null,
      failureEvidence:
        state === 'FAILED' ? 'Provider rejected: recipient account closed.' : null,
      reviewHistory: [
        {
          id: id(`wev_${index}`, 0),
          fromState: null,
          toState: 'PENDING',
          reviewerName: 'System',
          reason: null,
          occurredAt: createdAt,
        },
      ],
      linkedTransactionIds: [diamondTransactions[index * 3]?.id ?? 'dtx_000001'],
      availableActions: (NEXT_STATES[state] ??
        []) as WithdrawalDetail['availableActions'],
      updatedAt: createdAt,
      createdAt,
    } satisfies WithdrawalDetail
  },
)

/* -------------------------------------------------------------------------
 * Moderation — 120 cases
 * ---------------------------------------------------------------------- */

const CATEGORIES = [
  'HARASSMENT',
  'SPAM',
  'IMPERSONATION',
  'FRAUD',
  'EXPLICIT_CONTENT',
  'UNDERAGE',
  'SELF_HARM',
  'OTHER',
] as const

export const moderationCases: ModerationCaseDetail[] = Array.from(
  { length: 120 },
  (_, index) => {
    const targetIsUser = rng.bool(0.7)
    const user = users[(index * 9) % users.length]!
    const club = socialClubs[index % socialClubs.length]!
    const status = index < 44 ? 'OPEN' : rng.bool(0.4) ? 'UNDER_REVIEW' : 'RESOLVED'
    const category = rng.pick(CATEGORIES)
    const createdAt = rng.pastDate(120, 0)
    const reportCount = rng.int(1, 5)

    const reports: Report[] = Array.from({ length: reportCount }, (_, rIndex) => {
      const reporter = users[(index * 3 + rIndex * 17) % users.length]!
      return {
        id: id(`rep_${index}`, rIndex),
        targetType: targetIsUser ? 'USER' : 'SOCIAL_CLUB',
        targetId: targetIsUser ? user.id : club.id,
        targetName: targetIsUser ? user.displayName : club.title,
        reporterId: reporter.id,
        reporterName: reporter.displayName,
        category,
        // Reporter's own complaint text — never conversation content.
        note: 'Reported for behaviour that made participants uncomfortable.',
        sourceClubId: targetIsUser ? club.id : null,
        createdAt,
      }
    })

    return {
      id: id('mcs', index),
      reference: `MC-${(5000 + index).toString()}`,
      targetType: targetIsUser ? 'USER' : 'SOCIAL_CLUB',
      targetId: targetIsUser ? user.id : club.id,
      targetName: targetIsUser ? user.displayName : club.title,
      category,
      status,
      priority: rng.pick(['LOW', 'NORMAL', 'NORMAL', 'HIGH', 'URGENT'] as const),
      assigneeName: status === 'OPEN' ? null : 'Tomas Ricci',
      reportCount,
      escalated: rng.bool(0.1),
      createdAt,
      updatedAt: createdAt,
      reports,
      internalNotes:
        status === 'OPEN'
          ? []
          : [
              {
                id: id(`nte_${index}`, 0),
                authorName: 'Tomas Ricci',
                body: 'Reviewed report metadata and prior case history for this account.',
                createdAt: rng.pastDate(30, 0),
              },
            ],
      resolution:
        status === 'RESOLVED'
          ? rng.pick([
              'NO_ACTION',
              'RESTRICTION_APPLIED',
              'SUSPENDED',
              'BANNED',
            ] as const)
          : null,
      decisionNote:
        status === 'RESOLVED'
          ? 'Decision recorded after reviewing all linked reports.'
          : null,
      appliedActionId: status === 'RESOLVED' && rng.bool(0.6) ? id('act', index) : null,
      resolvedAt: status === 'RESOLVED' ? rng.pastDate(20, 0) : null,
    } satisfies ModerationCaseDetail
  },
)

/* -------------------------------------------------------------------------
 * Audit logs — 400
 * ---------------------------------------------------------------------- */

const AUDIT_ACTIONS = [
  { action: 'Suspended user', targetType: 'USER' },
  { action: 'Banned user', targetType: 'USER' },
  { action: 'Added capability restriction', targetType: 'USER' },
  { action: 'Approved host application', targetType: 'HOST_APPLICATION' },
  { action: 'Rejected host application', targetType: 'HOST_APPLICATION' },
  { action: 'Approved withdrawal', targetType: 'WITHDRAWAL' },
  { action: 'Rejected withdrawal', targetType: 'WITHDRAWAL' },
  { action: 'Created ledger adjustment', targetType: 'WALLET' },
  { action: 'Activated Diamond package', targetType: 'DIAMOND_PACKAGE' },
  { action: 'Disabled Social Club', targetType: 'SOCIAL_CLUB' },
  { action: 'Exported records', targetType: 'EXPORT' },
  { action: 'Changed admin role', targetType: 'ADMIN_USER' },
] as const

const ADMIN_ACTORS = [
  { id: 'adm_000001', name: 'Nadia Chowdhury', role: 'Super Admin' },
  { id: 'adm_000002', name: 'Tomas Ricci', role: 'Operations Admin' },
  { id: 'adm_000003', name: 'Elena Petrova', role: 'Moderator' },
] as const

export const auditLogs: AuditLog[] = Array.from({ length: 400 }, (_, index) => {
  const actor = rng.pick(ADMIN_ACTORS)
  const entry = rng.pick(AUDIT_ACTIONS)
  const user = users[(index * 7) % users.length]!

  return {
    id: id('aud', index),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: entry.action,
    targetType: entry.targetType,
    targetId: user.id,
    targetLabel: user.displayName,
    reason: 'Recorded at action time as required for this operation.',
    changes: [{ field: 'status', before: 'ACTIVE', after: 'SUSPENDED' }],
    correlationId: `corr_${index.toString().padStart(10, '0')}`,
    sourceIp: '203.0.113.' + rng.int(1, 254),
    occurredAt: rng.pastDate(180, 0),
  } satisfies AuditLog
})

/* -------------------------------------------------------------------------
 * Administration
 * ---------------------------------------------------------------------- */

/** Roles use the VERIFIED enum — `ADMIN`, not the assumed `OPERATIONS_ADMIN`. */
export const adminUsers: AdminUser[] = [
  {
    displayName: 'Nadia Chowdhury',
    email: 'nadia@callchat.app',
    role: 'SUPER_ADMIN' as const,
  },
  { displayName: 'Tomas Ricci', email: 'tomas@callchat.app', role: 'ADMIN' as const },
  {
    displayName: 'Elena Petrova',
    email: 'elena@callchat.app',
    role: 'MODERATOR' as const,
  },
  {
    displayName: 'Ibrahim Diallo',
    email: 'ibrahim@callchat.app',
    role: 'MODERATOR' as const,
  },
  { displayName: 'Clara Bergman', email: 'clara@callchat.app', role: 'ADMIN' as const },
].map((entry, index) => ({
  id: id('adm', index),
  displayName: entry.displayName,
  email: entry.email,
  role: entry.role,
  status: index !== 4 ? ('ACTIVE' as const) : ('INACTIVE' as const),
  createdAt: rng.pastDate(500, 100),
  lastActiveAt: rng.pastDate(10, 0),
}))

export const announcements: Announcement[] = Array.from({ length: 24 }, (_, index) => {
  const status = rng.pick([
    'DRAFT',
    'SCHEDULED',
    'QUEUED',
    'SENT_TO_PROVIDER',
    'DELIVERED',
    'FAILED',
    'EXPIRED',
  ] as const)
  const estimated = rng.int(500, 48000)

  return {
    id: id('ann', index),
    title: `Scheduled maintenance notice #${index + 1}`,
    body: 'CallChat will be briefly unavailable while we complete planned maintenance.',
    channel: rng.bool(0.6) ? 'PUSH' : 'IN_APP_BANNER',
    audience: rng.pick([
      'ALL_USERS',
      'HOSTS_ONLY',
      'BY_STATUS',
      'EXPLICIT_IDS',
    ] as const),
    audienceDescription: 'All active users',
    status,
    deepLink: rng.bool(0.3) ? 'callchat://settings' : null,
    createdByName: rng.pick(ADMIN_ACTORS).name,
    version: 1,
    scheduledAt: status === 'SCHEDULED' ? rng.pastDate(-10, -20) : null,
    publishedAt: ['DELIVERED', 'SENT_TO_PROVIDER', 'FAILED'].includes(status)
      ? rng.pastDate(30, 0)
      : null,
    expiresAt: status === 'EXPIRED' ? rng.pastDate(5, 0) : null,
    delivery: {
      estimatedRecipients: estimated,
      queued: status === 'QUEUED' ? estimated : 0,
      sentToProvider: ['SENT_TO_PROVIDER', 'DELIVERED', 'FAILED'].includes(status)
        ? estimated
        : 0,
      delivered: status === 'DELIVERED' ? Math.floor(estimated * 0.94) : 0,
      failed: status === 'FAILED' ? Math.floor(estimated * 0.12) : 0,
    },
  } satisfies Announcement
})

export const configuration: ConfigurationEntry[] = [
  {
    key: 'withdrawal.threshold.diamonds',
    label: 'Withdrawal threshold',
    description:
      'Minimum eligible earning Diamonds a Host must hold before submitting a Withdrawal request.',
    valueType: 'INTEGER' as const,
    value: 10000,
    constraint: '1,000 – 1,000,000 Diamonds',
  },
  {
    key: 'club.max_participants',
    label: 'Maximum club participants',
    description: 'Upper bound on concurrent participants in one Social Club.',
    valueType: 'INTEGER' as const,
    value: 500,
    constraint: '10 – 5,000 participants',
  },
  {
    key: 'platform.maintenance_mode',
    label: 'Maintenance mode',
    description: 'When enabled, consumer clients show a maintenance notice.',
    valueType: 'BOOLEAN' as const,
    value: false,
    constraint: 'true or false',
  },
  {
    key: 'moderation.auto_escalate_hours',
    label: 'Auto-escalate after',
    description:
      'Hours an OPEN case may sit unassigned before it is flagged for escalation.',
    valueType: 'INTEGER' as const,
    value: 48,
    constraint: '1 – 168 hours',
  },
].map((entry, index) => ({
  ...entry,
  updatedByName: 'Nadia Chowdhury',
  effectiveFrom: '2026-01-01T00:00:00Z',
  version: index + 1,
}))
