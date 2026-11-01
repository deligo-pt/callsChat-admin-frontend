import { http, HttpResponse } from 'msw'

import { users } from '../seed'
import { currentMockAdminId } from './auth'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * `GET /admin/wallet/transactions` and `/:id` (plan.md §2, phase T1).
 *
 * ⚠️ **Copies the live service, broken parts included.** Measured 2026-11-01:
 *
 *   - strict validation — every bad value is a `400` with the service's own
 *     wording, and several are collected into one message;
 *   - `maxAmount` is validated and then **ignored** (B1);
 *   - `direction` filters by **sign**, so the 0-amount rows labelled
 *     `CREDIT` appear under neither (B2);
 *   - the `summary` Diamond totals **ignore `direction`**; its count does
 *     not (B3);
 *   - `search` is a SQL `LIKE`, so `%` and `_` are wildcards (B5).
 *
 * Seeded by default, unlike the W1 wallet mock: the live ledger holds real
 * rows, so an empty default would test a state no operator is in.
 * `resetMockWalletTransactions()` restores the seed; `clearMockWalletTransactions()`
 * empties it for the empty-state tests.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const TRANSACTIONS = `${API_PREFIX}/admin/wallet/transactions`

interface MockLedgerUser {
  id: string
  displayName: string | null
  username: string | null
  avatarUrl: string | null
  email: string | null
  phoneMasked: string | null
  role: string
  status: string
}

type SeedRow = [
  id: string,
  userId: string,
  type: string,
  amount: number,
  direction: string,
  balanceAfter: number,
  refId: string,
  note: string,
  createdAt: string,
]

export interface MockWalletTransaction {
  id: string
  userId: string
  user: MockLedgerUser
  type: string
  amount: number
  direction: string
  balanceAfter: number
  refId: string | null
  note: string | null
  createdAt: string
}

/* Generated from the 59 rows captured on staging 2026-11-01; personal details scrubbed. */
const SEED_USERS: Record<string, MockLedgerUser> = {
  cmv5jz04e000201o5mtu3alad: {
    id: 'cmv5jz04e000201o5mtu3alad',
    displayName: 'App Developer',
    username: 'user42435',
    avatarUrl: 'avatars/avatar_cmv5jz04e000201o5mtu3alad_1793010419825.jpg',
    email: 'user42435@example.com',
    phoneMasked: '+880 *** *** 1000',
    role: 'USER',
    status: 'PENDING_VERIFICATION',
  },
  cmv6ekev300t901o5lz8yjf49: {
    id: 'cmv6ekev300t901o5lz8yjf49',
    displayName: 'call chat',
    username: 'chat155',
    avatarUrl: 'avatars/default-avatar.png',
    email: null,
    phoneMasked: '+880 *** *** 1111',
    role: 'USER',
    status: 'PENDING_VERIFICATION',
  },
  cmv60689100jl01o54peqzc2d: {
    id: 'cmv60689100jl01o54peqzc2d',
    displayName: 'Asibul Alam',
    username: 'alam424',
    avatarUrl: 'avatars/avatar_cmv60689100jl01o54peqzc2d_1791879275799.jpg',
    email: null,
    phoneMasked: '+880 *** *** 1222',
    role: 'USER',
    status: 'PENDING_VERIFICATION',
  },
  cmvf68a40001l01oaeh2n0rve: {
    id: 'cmvf68a40001l01oaeh2n0rve',
    displayName: 'Amelia Harris',
    username: 'amelia_h',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=amelia_h',
    email: null,
    phoneMasked: '+880 *** *** 1333',
    role: 'USER',
    status: 'ACTIVE',
  },
  cmv80oug40000b9kzd52qpjds: {
    id: 'cmv80oug40000b9kzd52qpjds',
    displayName: 'Super Administrator',
    username: 'superadmin',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=superadmin',
    email: 'superadmin@example.com',
    phoneMasked: '+880 *** *** 1444',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  },
  cmvph3l9p000q01p6nwhwy0qf: {
    id: 'cmvph3l9p000q01p6nwhwy0qf',
    displayName: 'sayed',
    username: 'sayed843',
    avatarUrl: 'avatars/default-avatar.png',
    email: null,
    phoneMasked: '+880 *** *** 1555',
    role: 'USER',
    status: 'PENDING_VERIFICATION',
  },
  cmvatgmtp00sn01qgs1j9kg3e: {
    id: 'cmvatgmtp00sn01qgs1j9kg3e',
    displayName: 'My Business',
    username: 'business874',
    avatarUrl: 'avatars/default-avatar.png',
    email: null,
    phoneMasked: '+880 *** *** 1666',
    role: 'USER',
    status: 'PENDING_VERIFICATION',
  },
}

/** `[id, userId, type, amount, direction, balanceAfter, refId, note, createdAt]`, newest first. */
const SEED_ROWS: readonly SeedRow[] = [
  [
    'cmvx1qbqo01i501ta3w4e0d1e',
    'cmv5jz04e000201o5mtu3alad',
    'CREATOR_EARNINGS_CONVERT',
    100,
    'CREDIT',
    6599,
    'cmvx1qbql01i401ta0blrpcjz',
    'Converted from Creator Studio earnings',
    '2026-10-31T23:42:34.224Z',
  ],
  [
    'cmvx1lwcz01hu01tafqkj6zfs',
    'cmv5jz04e000201o5mtu3alad',
    'CREATOR_EARNINGS_CONVERT',
    100,
    'CREDIT',
    6499,
    'cmvx1lwcw01ht01taezljnebu',
    'Converted from Creator Studio earnings',
    '2026-10-31T23:39:07.667Z',
  ],
  [
    'cmvx1fyga01hj01tay3mji105',
    'cmv5jz04e000201o5mtu3alad',
    'CREATOR_EARNINGS_CONVERT',
    99,
    'CREDIT',
    6399,
    'cmvx1fyg901hi01talxqnmmwm',
    'Converted from Creator Studio earnings',
    '2026-10-31T23:34:30.442Z',
  ],
  [
    'cmvx1e9jl01hg01ta8opdxwl1',
    'cmv5jz04e000201o5mtu3alad',
    'CREATOR_EARNINGS_CONVERT',
    100,
    'CREDIT',
    6300,
    'cmvx1e9jh01hf01ta84ipt6os',
    'Converted from Creator Studio earnings',
    '2026-10-31T23:33:11.505Z',
  ],
  [
    'cmvx1c1ab01h301tau5vt7m4i',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -990,
    'DEBIT',
    10970,
    'gift-heart_icon',
    'Sent 99x Heart Icon',
    '2026-10-31T23:31:27.491Z',
  ],
  [
    'cmvx1bybx01h001tatrvr2vko',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -990,
    'DEBIT',
    11960,
    'gift-heart_icon',
    'Sent 99x Heart Icon',
    '2026-10-31T23:31:23.661Z',
  ],
  [
    'cmvx1bw7t01gx01tak1nmgu8a',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -990,
    'DEBIT',
    12950,
    'gift-heart_icon',
    'Sent 99x Heart Icon',
    '2026-10-31T23:31:20.921Z',
  ],
  [
    'cmvx1blmy01gu01ta7u1mfhkj',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -990,
    'DEBIT',
    13940,
    'gift-heart_icon',
    'Sent 99x Heart Icon',
    '2026-10-31T23:31:07.210Z',
  ],
  [
    'cmvx017pa01ge01tal8aqd82e',
    'cmv5jz04e000201o5mtu3alad',
    'CREATOR_EARNINGS_CONVERT',
    50,
    'CREDIT',
    6200,
    'cmvx017p201gd01taoowwtz0u',
    'Converted from Creator Studio earnings',
    '2026-10-31T22:55:02.974Z',
  ],
  [
    'cmvwzsi0m01fv01tafr599gms',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -50,
    'DEBIT',
    14930,
    'gift-heart_icon',
    'Sent 5x Heart Icon',
    '2026-10-31T22:48:16.438Z',
  ],
  [
    'cmvwzsdmk01fs01tajg5lwgva',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -10,
    'DEBIT',
    14980,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T22:48:10.748Z',
  ],
  [
    'cmvwzs26901fp01taf42w5nln',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    -10,
    'DEBIT',
    14990,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T22:47:55.905Z',
  ],
  [
    'cmvwzmkzm01fc01tavwotm7ua',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6150,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T22:43:40.354Z',
  ],
  [
    'cmvwzmeqv01f901taajd1bn7s',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6160,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T22:43:32.263Z',
  ],
  [
    'cmvwzli8001f501ta7dwd6scb',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6170,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T22:42:50.112Z',
  ],
  [
    'cmvw1fq40008q01mw0vnpi20n',
    'cmv60689100jl01o54peqzc2d',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6540,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-31T06:46:33.456Z',
  ],
  [
    'cmvw07fyn008h01mw0d56qmet',
    'cmv5jz04e000201o5mtu3alad',
    'ADMIN_ADJUSTMENT',
    30,
    'CREDIT',
    6180,
    'cmv80oug40000b9kzd52qpjds',
    'This is testing',
    '2026-10-31T06:12:07.439Z',
  ],
  [
    'cmvw00sx4006r01mwcueg4myx',
    'cmv5jz04e000201o5mtu3alad',
    'ADMIN_ADJUSTMENT',
    20,
    'CREDIT',
    6150,
    'cmv80oug40000b9kzd52qpjds',
    'This is testing',
    '2026-10-31T06:06:57.640Z',
  ],
  [
    'cmvvzvwwr006q01mwrs9bpmpl',
    'cmv5jz04e000201o5mtu3alad',
    'ADMIN_ADJUSTMENT',
    40,
    'CREDIT',
    6130,
    'cmv80oug40000b9kzd52qpjds',
    'This is for testing',
    '2026-10-31T06:03:09.531Z',
  ],
  [
    'cmvvzuidq006p01mw29iedllu',
    'cmv5jz04e000201o5mtu3alad',
    'ADMIN_ADJUSTMENT',
    30,
    'CREDIT',
    6090,
    'cmv80oug40000b9kzd52qpjds',
    'this is for testing purpose',
    '2026-10-31T06:02:04.046Z',
  ],
  [
    'cmvtpqtfh00we01ph7tuy41u2',
    'cmv60689100jl01o54peqzc2d',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6550,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-29T15:43:43.229Z',
  ],
  [
    'cmvtpqhs200wb01phdf24bxz6',
    'cmv60689100jl01o54peqzc2d',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6560,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-29T15:43:28.130Z',
  ],
  [
    'cmvtpq0lg00w801phs5y587t1',
    'cmv60689100jl01o54peqzc2d',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6570,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-29T15:43:05.860Z',
  ],
  [
    'cmvtnufmj00vs01phivis13td',
    'cmv60689100jl01o54peqzc2d',
    'TOP_UP',
    5500,
    'CREDIT',
    6580,
    'cmvtntxyr00vq01phzsxueffg',
    'Manual top-up via BKASH (TrxID: TEST0001)',
    '2026-10-29T14:50:32.731Z',
  ],
  [
    'cmvtntfz900vp01phwm1wj3pb',
    'cmv60689100jl01o54peqzc2d',
    'TOP_UP',
    1080,
    'CREDIT',
    1080,
    'cmvtnt30q00vn01phvvmbxtjb',
    'Manual top-up via BKASH (TrxID: TEST0001)',
    '2026-10-29T14:49:46.533Z',
  ],
  [
    'cmvtctmtt00na01phbty261xo',
    'cmvf68a40001l01oaeh2n0rve',
    'ADMIN_ADJUSTMENT',
    20,
    'CREDIT',
    240,
    'cmv80oug40000b9kzd52qpjds',
    'This is testing',
    '2026-10-29T09:41:59.633Z',
  ],
  [
    'cmvtctae400n901phu65z01n7',
    'cmvf68a40001l01oaeh2n0rve',
    'ADMIN_ADJUSTMENT',
    20,
    'CREDIT',
    220,
    'cmv80oug40000b9kzd52qpjds',
    'This is testing',
    '2026-10-29T09:41:43.516Z',
  ],
  [
    'cmvtct06c00n801phvhd40ell',
    'cmvf68a40001l01oaeh2n0rve',
    'ADMIN_ADJUSTMENT',
    100,
    'CREDIT',
    200,
    'cmv80oug40000b9kzd52qpjds',
    'this is testing',
    '2026-10-29T09:41:30.276Z',
  ],
  [
    'cmvtcrx7u00n601phdiyx1jp5',
    'cmvf68a40001l01oaeh2n0rve',
    'ADMIN_ADJUSTMENT',
    100,
    'CREDIT',
    100,
    'cmv80oug40000b9kzd52qpjds',
    'this is testing.',
    '2026-10-29T09:40:39.786Z',
  ],
  [
    'cmvsl6o9v00mz01phkda4i479',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6060,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-28T20:48:18.787Z',
  ],
  [
    'cmvsl6j0g00mw01phjvcijlra',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    -10,
    'DEBIT',
    6070,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-28T20:48:11.968Z',
  ],
  [
    'cmvsl6bj900mu01phfv7wivkk',
    'cmv5jz04e000201o5mtu3alad',
    'GIFT_SENT',
    0,
    'CREDIT',
    6080,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-28T20:48:02.277Z',
  ],
  [
    'cmvsl453i00ml01phdnsg27lg',
    'cmv5jz04e000201o5mtu3alad',
    'TOP_UP',
    1080,
    'CREDIT',
    6080,
    'cmvsl3qa200mj01phlrxru14d',
    'Manual top-up via BKASH (TrxID: TEST0001)',
    '2026-10-28T20:46:20.622Z',
  ],
  [
    'cmvskr5z800m901phirv2yjhi',
    'cmv5jz04e000201o5mtu3alad',
    'ADMIN_ADJUSTMENT',
    5000,
    'CREDIT',
    5000,
    'cmv80oug40000b9kzd52qpjds',
    'from Administration',
    '2026-10-28T20:36:15.236Z',
  ],
  [
    'cmvqvumww007901pblznxde6a',
    'cmv80oug40000b9kzd52qpjds',
    'TOP_UP',
    100,
    'CREDIT',
    5100,
    'cmvqsqonv007001pbohzpfb2n',
    'Manual top-up via NAGAD (TrxID: TEST0001)',
    '2026-10-27T16:11:20.576Z',
  ],
  [
    'cmvqvufef007701pbghw2pxse',
    'cmv80oug40000b9kzd52qpjds',
    'ADMIN_ADJUSTMENT',
    -1,
    'DEBIT',
    5000,
    'cmv80oug40000b9kzd52qpjds',
    'Contract verification: reversing the one-diamond test credit.',
    '2026-10-27T16:11:10.839Z',
  ],
  [
    'cmvqvtz8b007601pbca2at111',
    'cmv80oug40000b9kzd52qpjds',
    'ADMIN_ADJUSTMENT',
    1,
    'CREDIT',
    5001,
    'cmv80oug40000b9kzd52qpjds',
    'Contract verification: crediting one diamond to observe the success shape.',
    '2026-10-27T16:10:49.883Z',
  ],
  [
    'cmvphnfvq00lp01p6b7vt02m0',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-26T16:46:04.070Z',
  ],
  [
    'cmvphjspl00ll01p6y8e4o5dt',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-26T16:43:14.073Z',
  ],
  [
    'cmvphjbf800lj01p6v65fmd38',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-26T16:42:51.668Z',
  ],
  [
    'cmvphfdp600lh01p6mkvx9i5r',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-26T16:39:47.994Z',
  ],
  [
    'cmvphembu00lf01p6w8anwxy6',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-26T16:39:12.522Z',
  ],
  [
    'cmvpheix700ld01p6rw2n0kfn',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-26T16:39:08.107Z',
  ],
  [
    'cmvphecif00lb01p6j48mc1th',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-26T16:38:59.799Z',
  ],
  [
    'cmvphdo0y00l601p6mcvviucq',
    'cmvph3l9p000q01p6nwhwy0qf',
    'GIFT_SENT',
    0,
    'CREDIT',
    0,
    'gift-love_guitar',
    'Sent 99x Love Guitar',
    '2026-10-26T16:38:28.066Z',
  ],
  [
    'cmvphd1sx00l401p6wo6jdat5',
    'cmvph3l9p000q01p6nwhwy0qf',
    'GIFT_SENT',
    0,
    'CREDIT',
    0,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-26T16:37:59.265Z',
  ],
  [
    'cmvnzfmn100xh01pj5mwuqjwu',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 10x Chocolate Box',
    '2026-10-25T15:28:20.317Z',
  ],
  [
    'cmvnzfimq00xf01pjllft65xj',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-25T15:28:15.123Z',
  ],
  [
    'cmvnz41ra00wr01pj3g5t83n1',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-25T15:19:20.038Z',
  ],
  [
    'cmvnz3txl00wp01pj8awls6fh',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-25T15:19:09.897Z',
  ],
  [
    'cmvntpn4400cq01pjjacdrk4h',
    'cmvatgmtp00sn01qgs1j9kg3e',
    'GIFT_SENT',
    0,
    'CREDIT',
    5000,
    'gift-chocolate_box',
    'Sent 10x Chocolate Box',
    '2026-10-25T12:48:09.796Z',
  ],
  [
    'cmvntpg2y00co01pjv2w5wy3t',
    'cmvatgmtp00sn01qgs1j9kg3e',
    'GIFT_SENT',
    0,
    'CREDIT',
    5000,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-25T12:48:00.682Z',
  ],
  [
    'cmvnsz6d100b501pj06119ck2',
    'cmvatgmtp00sn01qgs1j9kg3e',
    'GIFT_SENT',
    0,
    'CREDIT',
    5000,
    'gift-chocolate_box',
    'Sent 1x Chocolate Box',
    '2026-10-25T12:27:35.029Z',
  ],
  [
    'cmvnsyy4400b301pj702lzu87',
    'cmvatgmtp00sn01qgs1j9kg3e',
    'GIFT_SENT',
    0,
    'CREDIT',
    5000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-25T12:27:24.340Z',
  ],
  [
    'cmvnsxkvj00aw01pjo20w8ddv',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-25T12:26:20.527Z',
  ],
  [
    'cmvnsotk900ae01pjbs14ksfm',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 5x Rose Bouquet',
    '2026-10-25T12:19:31.881Z',
  ],
  [
    'cmvnsol4500ac01pjbf8zyaix',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-rose_bouquet',
    'Sent 1x Rose Bouquet',
    '2026-10-25T12:19:20.933Z',
  ],
  [
    'cmvnsoc3c00aa01pjbkadffu0',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-25T12:19:09.240Z',
  ],
  [
    'cmvnso09g00a801pjnuejrdgs',
    'cmv6ekev300t901o5lz8yjf49',
    'GIFT_SENT',
    0,
    'CREDIT',
    15000,
    'gift-heart_icon',
    'Sent 1x Heart Icon',
    '2026-10-25T12:18:53.908Z',
  ],
]

function seed(): MockWalletTransaction[] {
  return SEED_ROWS.map(
    ([id, userId, type, amount, direction, balanceAfter, refId, note, createdAt]) => ({
      id,
      userId,
      user: { ...SEED_USERS[userId]! },
      type,
      amount,
      direction,
      balanceAfter,
      refId,
      note,
      createdAt,
    }),
  )
}

let rows: MockWalletTransaction[] = seed()

/** Restore the captured seed. */
export function resetMockWalletTransactions(): void {
  rows = seed()
}

/** No rows at all — for empty states. */
export function clearMockWalletTransactions(): void {
  rows = []
}

/** Mutable, for a test that needs one row to differ. */
export function mockWalletTransactions(): MockWalletTransaction[] {
  return rows
}

/**
 * Append the row a successful `POST /admin/wallet/adjust` writes live: type
 * `ADMIN_ADJUSTMENT`, `refId` = the adjusting admin's id.
 */
export function recordMockAdjustment(entry: {
  user: MockLedgerUser
  amount: number
  balanceAfter: number
  note: string
}): MockWalletTransaction {
  const row: MockWalletTransaction = {
    id: `cmvtx_adj_${Date.now().toString(36)}_${rows.length}`,
    userId: entry.user.id,
    user: entry.user,
    type: 'ADMIN_ADJUSTMENT',
    amount: entry.amount,
    direction: entry.amount < 0 ? 'DEBIT' : 'CREDIT',
    balanceAfter: entry.balanceAfter,
    refId: currentMockAdminId(),
    note: entry.note,
    createdAt: new Date().toISOString(),
  }
  rows = [row, ...rows]
  return row
}

/**
 * Append the row an approved top-up writes live (plan.md T5): type `TOP_UP`,
 * `refId` = the request id, and the note in the measured wording, so the
 * panel's "See wallet entry" (ledger `search` on `refId`) finds it.
 * `balanceAfter` follows this user's newest row when there is no wallet to
 * read.
 */
export function recordMockTopUp(entry: {
  requestId: string
  user: MockLedgerUser
  diamonds: number
  method: string
  transactionId: string | null
  balanceAfter?: number
}): MockWalletTransaction {
  const previous = rows.find((row) => row.userId === entry.user.id)?.balanceAfter ?? 0
  const row: MockWalletTransaction = {
    id: `cmvtx_top_${Date.now().toString(36)}_${rows.length}`,
    userId: entry.user.id,
    user: entry.user,
    type: 'TOP_UP',
    amount: entry.diamonds,
    direction: 'CREDIT',
    balanceAfter: entry.balanceAfter ?? previous + entry.diamonds,
    refId: entry.requestId,
    note: `Manual top-up via ${entry.method}${
      entry.transactionId ? ` (TrxID: ${entry.transactionId})` : ''
    }`,
    createdAt: new Date().toISOString(),
  }
  rows = [row, ...rows]
  return row
}

/**
 * The directory user the e2e history fixture belongs to: the first seeded
 * account, which every user-record spec already opens.
 */
export const HISTORY_FIXTURE_USER_ID = 'usr_000001'
/** Rows in the fixture — three pages at the Finance tab's default of 5. */
export const HISTORY_FIXTURE_ROWS = 12

/**
 * Opt-in e2e fixture (plan.md T6): a wallet history for a user the directory
 * has. The staging-captured rows belong to accounts the mock directory does
 * not hold, so without this no user record has enough history to page
 * through — and rows written by clicking "Adjust" vanish on a reload.
 *
 * Credits of 1…12 Diamonds, one per day, oldest first, ending yesterday; the
 * newest carries a long unbroken note for the layout checks.
 */
export function seedMockHistory(): void {
  const user = users.find((row) => row.id === HISTORY_FIXTURE_USER_ID)
  if (!user) return
  const ledgerUser: MockLedgerUser = {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    email: user.email,
    phoneMasked: user.phoneMasked,
    role: user.role,
    status: user.status,
  }
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  let balance = 0
  const history: MockWalletTransaction[] = []
  for (let index = 1; index <= HISTORY_FIXTURE_ROWS; index += 1) {
    balance += index
    history.unshift({
      id: `cmvtx_hist_${String(index).padStart(2, '0')}`,
      userId: user.id,
      user: ledgerUser,
      type: 'ADMIN_ADJUSTMENT',
      amount: index,
      direction: 'CREDIT',
      balanceAfter: balance,
      refId: currentMockAdminId(),
      note:
        index === HISTORY_FIXTURE_ROWS
          ? `Goodwill credit after a long dispute — reference ${'X'.repeat(90)}`
          : `Fixture credit number ${index}.`,
      createdAt: new Date(now - (HISTORY_FIXTURE_ROWS - index + 1) * day).toISOString(),
    })
  }
  rows = [...history, ...rows.filter((row) => row.userId !== user.id)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

const HISTORY_FLAG = 'callschat.mocks.ledger.history'

/** Read the fixture flag at boot, as `exposeWalletFixtureControls` does. */
export function exposeLedgerFixtureControls(): void {
  try {
    if (sessionStorage.getItem(HISTORY_FLAG) === '1') seedMockHistory()
  } catch {
    /* Blocked storage: no fixture, which is the default anyway. */
  }
}

/* ------------------------------------------------------------------ *
 * Validation — the service's own wordings, verbatim
 * ------------------------------------------------------------------ */

const TYPES = [
  'TOP_UP',
  'TOP_UP_PURCHASE',
  'GIFT_SENT',
  'FRAME_PURCHASE',
  'ADMIN_ADJUSTMENT',
  'REFUND',
  'SIGNUP_BONUS',
  'CREATOR_EARNINGS_CONVERT',
]
const DIRECTIONS = ['CREDIT', 'DEBIT']
const SORTS = ['desc', 'asc']

/** Full ISO in UTC, milliseconds optional. `2026-10-29` and `+06:00` are refused. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(' | ')
}

interface ParsedQuery {
  page: number
  limit: number
  userId?: string
  type?: string
  direction?: string
  startDate?: string
  endDate?: string
  minAmount?: number
  search?: string
  sort: string
}

function parseQuery(url: URL): ParsedQuery | string {
  const errors: string[] = []
  const params = url.searchParams
  const parsed: ParsedQuery = { page: 1, limit: 20, sort: 'desc' }

  const integer = (name: string, max?: number): number | undefined => {
    if (!params.has(name)) return undefined
    const raw = params.get(name)!
    const value = Number(raw)
    if (Number.isNaN(value)) {
      errors.push(`querystring/${name} Expected number, received nan`)
    } else if (!Number.isInteger(value)) {
      errors.push(`querystring/${name} Expected integer, received float`)
    } else if (value < 1) {
      errors.push(`querystring/${name} Number must be greater than or equal to 1`)
    } else if (max !== undefined && value > max) {
      errors.push(`querystring/${name} Number must be less than or equal to ${max}`)
    } else {
      return value
    }
    return undefined
  }

  const choice = (name: string, allowed: readonly string[]): string | undefined => {
    const all = params.getAll(name)
    if (all.length === 0) return undefined
    if (all.length > 1) {
      errors.push(`querystring/${name} Expected ${quoted(allowed)}, received array`)
      return undefined
    }
    const value = all[0]!
    if (!allowed.includes(value)) {
      errors.push(
        `querystring/${name} Invalid enum value. Expected ${quoted(allowed)}, received '${value}'`,
      )
      return undefined
    }
    return value
  }

  const date = (name: string): string | undefined => {
    if (!params.has(name)) return undefined
    const value = params.get(name)!
    if (!ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
      errors.push(`querystring/${name} Invalid ${name} ISO format`)
      return undefined
    }
    return value
  }

  parsed.page = integer('page') ?? 1
  parsed.limit = integer('limit', 100) ?? 20
  const type = choice('type', TYPES)
  const direction = choice('direction', DIRECTIONS)
  const startDate = date('startDate')
  const endDate = date('endDate')
  const minAmount = integer('minAmount')
  /* B1: validated like `minAmount`, then never used. */
  integer('maxAmount')
  parsed.sort = choice('sort', SORTS) ?? 'desc'

  if (errors.length > 0) return errors.join(', ')

  /* Only these two are ignored when empty; everything above is a 400. */
  const userId = params.get('userId')
  const search = params.get('search')?.trim()
  if (userId) parsed.userId = userId
  if (search) parsed.search = search
  if (type) parsed.type = type
  if (direction) parsed.direction = direction
  if (startDate) parsed.startDate = startDate
  if (endDate) parsed.endDate = endDate
  if (minAmount) parsed.minAmount = minAmount
  return parsed
}

/** A SQL `LIKE '%term%'`, case-insensitive: `%` and `_` stay wildcards (B5). */
function likeMatcher(term: string): RegExp {
  const pattern = term
    .split('')
    .map((char) => {
      if (char === '%') return '.*'
      if (char === '_') return '.'
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(pattern, 'i')
}

/** Every filter except `direction` — the scope the summary totals use (B3). */
function matchesExceptDirection(
  row: MockWalletTransaction,
  query: ParsedQuery,
): boolean {
  if (query.userId && row.userId !== query.userId) return false
  if (query.type && row.type !== query.type) return false
  if (query.startDate && row.createdAt < query.startDate) return false
  if (query.endDate && row.createdAt > query.endDate) return false
  if (query.minAmount && Math.abs(row.amount) < query.minAmount) return false
  if (query.search) {
    const like = likeMatcher(query.search)
    const fields = [
      row.user.displayName,
      row.user.username,
      row.user.email,
      row.refId,
      row.note,
    ]
    if (!fields.some((value) => value !== null && like.test(value))) return false
  }
  return true
}

/** B2: by sign, so a 0-amount row is neither. */
function matchesDirection(row: MockWalletTransaction, direction: string | undefined) {
  if (direction === 'CREDIT') return row.amount > 0
  if (direction === 'DEBIT') return row.amount < 0
  return true
}

function summarise(scope: readonly MockWalletTransaction[], count: number) {
  const credit = scope
    .filter((row) => row.amount > 0)
    .reduce((sum, row) => sum + row.amount, 0)
  const debit = scope
    .filter((row) => row.amount < 0)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0)
  return {
    totalTransactions: count,
    totalVolumeDiamonds: credit + debit,
    totalCreditDiamonds: credit,
    totalDebitDiamonds: debit,
  }
}

export const walletTransactionHandlers = [
  http.get(TRANSACTIONS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const query = parseQuery(new URL(request.url))
    if (typeof query === 'string') return errorResponse(400, VALIDATION, query)

    const source = isEmptyScenario() ? [] : rows
    const scope = source.filter((row) => matchesExceptDirection(row, query))
    const matched = scope
      .filter((row) => matchesDirection(row, query.direction))
      .sort((a, b) =>
        query.sort === 'asc'
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
      )

    const start = (query.page - 1) * query.limit
    const totalPages = Math.ceil(matched.length / query.limit)
    return HttpResponse.json({
      success: true,
      data: matched.slice(start, start + query.limit),
      pagination: {
        total: matched.length,
        page: query.page,
        limit: query.limit,
        totalPages,
        hasMore: query.page < totalPages,
      },
      summary: summarise(scope, matched.length),
    })
  }),

  http.get(`${TRANSACTIONS}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = rows.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, 'NOT_FOUND', 'Transaction not found.')

    /* The account's balance now: its newest row's `balanceAfter`. */
    const newest = rows
      .filter((candidate) => candidate.userId === row.userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return HttpResponse.json({
      success: true,
      data: {
        ...row,
        user: { ...row.user, currentDiamondBalance: newest?.balanceAfter ?? null },
      },
    })
  }),
]
