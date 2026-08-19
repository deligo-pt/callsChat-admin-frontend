import type { AdminColumn } from '@/components/data'

/**
 * Fixture rows for the design gallery only.
 *
 * Deliberately synthetic: no real user data, and — per plan.md §3.1 — no
 * message, call or media content of any kind, not even as sample text.
 */
export interface DemoUser {
  readonly id: string
  readonly displayName: string
  readonly phone: string
  readonly status: string
  readonly restrictions: number
  readonly isHost: boolean
  readonly availableDiamonds: number
  readonly registeredAt: string
  readonly lastActiveAt: string
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: 'usr_8Fk29ZqLm401',
    displayName: 'Ayesha Rahman',
    phone: '+8801712345678',
    status: 'ACTIVE',
    restrictions: 0,
    isHost: true,
    availableDiamonds: 12480,
    registeredAt: '2026-03-14T09:12:00Z',
    lastActiveAt: '2026-08-19T06:41:00Z',
  },
  {
    id: 'usr_2Bq77XtNc918',
    displayName: 'Marcus Feld',
    phone: '+4917612349876',
    status: 'SUSPENDED',
    restrictions: 1,
    isHost: false,
    availableDiamonds: 340,
    registeredAt: '2026-01-02T14:38:00Z',
    lastActiveAt: '2026-08-11T18:02:00Z',
  },
  {
    id: 'usr_5Dp10VrWq223',
    displayName: 'Sofia Almeida',
    phone: '+5511998877665',
    status: 'ACTIVE',
    restrictions: 2,
    isHost: true,
    availableDiamonds: 98120,
    registeredAt: '2025-11-27T21:05:00Z',
    lastActiveAt: '2026-08-19T04:15:00Z',
  },
  {
    id: 'usr_9Hs64MnBv770',
    displayName: 'Kenji Watanabe',
    phone: '+819012345678',
    status: 'BANNED',
    restrictions: 0,
    isHost: false,
    availableDiamonds: 0,
    registeredAt: '2026-05-30T07:44:00Z',
    lastActiveAt: '2026-07-02T11:23:00Z',
  },
  {
    id: 'usr_4Jn82CxKd556',
    displayName: 'Amara Okonkwo',
    phone: '+2348031234567',
    status: 'ACTIVE',
    restrictions: 0,
    isHost: false,
    availableDiamonds: 5600,
    registeredAt: '2026-07-19T16:20:00Z',
    lastActiveAt: '2026-08-18T22:57:00Z',
  },
]

export type DemoUserColumns = readonly AdminColumn<DemoUser>[]

export const DEMO_AUDIT_ENTRIES = [
  {
    id: 'aud_01',
    actorName: 'Nadia Chowdhury',
    actorRole: 'Super Admin',
    action: 'Approved withdrawal',
    occurredAt: '2026-08-19T05:22:11Z',
    reason: 'Eligibility verified against ledger; payout profile confirmed active.',
    changes: [{ field: 'state', before: 'UNDER_REVIEW', after: 'APPROVED' }],
    correlationId: 'corr_01JQZ8N4X7VYB2K9TREM5HWDCF',
  },
  {
    id: 'aud_02',
    actorName: 'Tomas Ricci',
    actorRole: 'Operations Admin',
    action: 'Started review',
    occurredAt: '2026-08-19T04:58:03Z',
    reason: 'Routine review of the pending payout queue.',
    changes: [{ field: 'state', before: 'PENDING', after: 'UNDER_REVIEW' }],
    correlationId: 'corr_01JQZ8M2K4PPQ7R3ZXBN9WTDCA',
  },
  {
    id: 'aud_03',
    actorName: 'System',
    action: 'Withdrawal submitted',
    occurredAt: '2026-08-18T20:11:47Z',
    changes: [{ field: 'lockedDiamonds', before: '0', after: '10000' }],
  },
] as const
