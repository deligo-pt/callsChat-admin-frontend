import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Host Application Management — a mock of a backend that currently holds
 * **nothing** (plan.md §2.1, phase H3).
 *
 * Measured against `https://test-api.callschat.com/api/v1` on 2026-10-15.
 * Everything reproduced here is a behaviour that was observed, including the
 * defects:
 *
 *   - **every list is empty and every counter is zero** — the live default;
 *   - `status` is **case-SENSITIVE** (`?status=pending` is a 400), unlike the
 *     bootstrap enums which take four spellings each;
 *   - **`niche` is not validated at all** — `?niche=GARBAGE` answers 200;
 *   - `limit` is 1–100 and `page` is ≥ 1, both enforced;
 *   - **validation runs before the lookup** — a malformed body against an id
 *     that does not exist answers 400, not 404;
 *   - `rejectionReason` ≥ 5 characters when rejecting;
 *   - `reason` ≥ 5 characters when suspending **or banning**;
 *   - both 404s append `" not found"` to a label that already ends in it.
 *
 * ⚠️ **The default seed is empty, and that is the whole point.** A mock seeded
 * with tidy rows would make the queue look finished while the only thing any
 * operator can currently reach is the empty state. The populated seed is opt-in
 * via `seedMockHosts()`.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const NOT_FOUND = 'NOT_FOUND' as const

const APPLICATIONS = `${API_PREFIX}/admin/live/host-applications`
const HOSTS = `${API_PREFIX}/admin/live/hosts`

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockApplication {
  id: string
  userId: string
  niche: string
  expectedHostingHoursPerWeek: number | null
  motivation: string | null
  bio: string | null
  status: string
  introMediaUrl: string | null
  socialLinks: Record<string, string> | null
  qaResponses: Record<string, unknown> | null
  rejectionReason: string | null
  createdAt: string
  reviewedAt: string | null
  user: {
    id: string
    email: string | null
    profile: {
      displayName: string | null
      username: string | null
      avatarUrl: string | null
    } | null
  } | null
}

interface MockHost {
  id: string
  userId: string
  status: string
  badgeLevel: number | null
  totalLiveHours: number | null
  totalLiveSessions: number | null
  peakViewers: number | null
  totalDiamondsEarned: number | null
  totalGiftsReceived: number | null
  withdrawableDiamonds: number | null
  pendingWithdrawal: number | null
  revenueSharePercent: number | null
  isLive: boolean | null
  lastLiveAt: string | null
  followersCount: number | null
  approvedAt: string | null
  suspendedAt: string | null
  suspendedById: string | null
  suspendedReason: string | null
  user: MockApplication['user']
}

/**
 * The populated seed — **opt-in**, never the default.
 *
 * ⚠️ Row 3 is the hostile fixture. Every value in it is one the service would
 * accept today:
 *
 *   - **no `user.profile` at all** — an applicant who never set a display name
 *     is an ordinary account state, and a queue that requires one blanks for
 *     everybody because of one of them;
 *   - a **`javascript:` intro URL** — the comparable field on this backend
 *     (`bootstrap.storeUrl`) accepted and publicly served exactly this;
 *   - a **`niche` the panel has never heard of** — the direct consequence of
 *     the server not validating it (plan.md §3.2);
 *   - a **several-thousand-character `motivation`** with no line breaks, which
 *     is what the detail drawer actually has to lay out.
 */
function populatedApplications(): MockApplication[] {
  return [
    {
      id: 'cmv6j6vfk00007wvb59fdeh07',
      userId: 'cmu2moelr0000zwvbz66ignv7',
      niche: 'TECH',
      expectedHostingHoursPerWeek: 12,
      motivation: 'I love hosting live interactive coding sessions.',
      bio: 'Full-stack developer and open source enthusiast.',
      status: 'PENDING',
      introMediaUrl: 'https://cdn.callschat.com/samples/intro.mp4',
      socialLinks: { youtube: 'https://youtube.com/@alice_dev' },
      /*
       * ⚠️ Shaped like the live record found on 2026-10-15 (O4): free-form
       * keys, and a value that is NOT a string — nothing in the contract says
       * the answers are text, and a renderer that assumed so would drop this
       * one silently.
       */
      qaResponses: {
        equipment: 'Condenser mic, ring light, wired connection.',
        yearsExperience: 3,
        hasStreamedBefore: true,
      },
      rejectionReason: null,
      createdAt: '2026-10-13T10:21:32.960Z',
      reviewedAt: null,
      user: {
        id: 'cmu2moelr0000zwvbz66ignv7',
        email: 'sk_alice@test.com',
        profile: {
          displayName: 'Alice Johnson',
          username: 'alice_live',
          avatarUrl: 'https://cdn.callschat.com/avatars/alice.png',
        },
      },
    },
    {
      id: 'cmv6j6vfk00017wvb59fdeh08',
      userId: 'cmu2moelr0001zwvbz66ignv8',
      niche: 'MUSIC',
      expectedHostingHoursPerWeek: 4,
      motivation: 'Weekly acoustic sets and requests from listeners.',
      bio: null,
      status: 'REJECTED',
      introMediaUrl: 'https://cdn.callschat.com/samples/acoustic.mp3',
      socialLinks: null,
      qaResponses: null,
      rejectionReason:
        'Sample intro audio was unclear. Please submit a clearer sample with noise reduction.',
      createdAt: '2026-10-11T08:02:11.000Z',
      reviewedAt: '2026-10-12T09:15:00.000Z',
      user: {
        id: 'cmu2moelr0001zwvbz66ignv8',
        email: 'rafa@test.com',
        profile: { displayName: 'Rafa', username: 'rafa_sounds', avatarUrl: null },
      },
    },
    {
      /* ⚠️ The hostile fixture — see the note above. */
      id: 'cmv6j6vfk00027wvb59fdeh09',
      userId: 'cmu2moelr0002zwvbz66ignv9',
      niche: 'ASTROLOGY',
      expectedHostingHoursPerWeek: null,
      motivation: `I have been broadcasting to a small community for three years and I want to bring that audience here. ${'I can describe my plans at length and this is exactly the kind of unbroken paragraph an operator has to read on a narrow screen. '.repeat(
        28,
      )}`,
      bio: null,
      status: 'PENDING',
      introMediaUrl: 'javascript:alert(document.domain)',
      socialLinks: {
        tiktok: 'https://tiktok.com/@nameless',
        personal: 'not-a-url-at-all',
      },
      qaResponses: {},
      rejectionReason: null,
      createdAt: '2026-10-14T23:59:59.000Z',
      reviewedAt: null,
      user: { id: 'cmu2moelr0002zwvbz66ignv9', email: null, profile: null },
    },
  ]
}

function populatedHosts(): MockHost[] {
  return [
    {
      id: 'prof_123',
      userId: 'usr_99',
      status: 'ACTIVE',
      badgeLevel: 2,
      /* ⚠️ A float. Never coerce it to an integer. */
      totalLiveHours: 48.5,
      totalLiveSessions: 63,
      peakViewers: 124,
      totalDiamondsEarned: 64200,
      totalGiftsReceived: 58,
      /*
       * ⚠️ Three different numbers on purpose. Lifetime earned, what is
       * withdrawable now, and what is already in flight are not the same
       * money, and a fixture where they matched would let a cell render the
       * wrong one and still pass.
       */
      withdrawableDiamonds: 12189,
      pendingWithdrawal: 4000,
      revenueSharePercent: 70,
      isLive: true,
      lastLiveAt: '2026-10-26T16:54:33.572Z',
      followersCount: 1420,
      approvedAt: '2026-10-01T08:00:00.000Z',
      suspendedAt: null,
      suspendedById: null,
      suspendedReason: null,
      user: {
        id: 'usr_99',
        email: 'alex@stream.com',
        profile: {
          displayName: 'Alex Rivers',
          username: 'alexrivers',
          avatarUrl: 'https://cdn.callschat.com/avatars/alex.jpg',
        },
      },
    },
    {
      id: 'prof_124',
      userId: 'usr_100',
      status: 'SUSPENDED',
      badgeLevel: null,
      totalLiveHours: 0,
      totalLiveSessions: null,
      peakViewers: null,
      totalDiamondsEarned: 0,
      totalGiftsReceived: 0,
      /*
       * ⚠️ A suspended host with earnings still in flight. Suspension does not
       * cancel a withdrawal, and the panel cannot do anything about either —
       * which is exactly the state an operator needs to be able to see.
       */
      withdrawableDiamonds: 0,
      pendingWithdrawal: 2500,
      revenueSharePercent: 70,
      isLive: false,
      lastLiveAt: null,
      followersCount: 0,
      approvedAt: '2026-09-20T08:00:00.000Z',
      suspendedAt: '2026-10-02T11:30:00.000Z',
      suspendedById: 'usr_admin_1',
      suspendedReason: 'Repeated copyright infringement during audio streaming.',
      user: { id: 'usr_100', email: null, profile: null },
    },
  ]
}

let applications: MockApplication[] = []
let hosts: MockHost[] = []

/**
 * Reproduce the live stats regression (plan.md O1, phase W0).
 *
 * ⚠️ **The real backend does this and our mock does not**, which is exactly
 * why it has to be switchable. `GET /admin/live/host-applications/stats`
 * returned `200` on 2026-10-15 and `404` on 2026-10-27: the `:id` route now
 * swallows the literal `stats` segment, and the body is the *application*
 * not-found message rather than a route error. The handler below is ordered
 * correctly and would hide the defect forever — a mock that is better behaved
 * than the server cannot test what the server does.
 */
let statsRouteBroken = false

export function breakMockStatsRoute(broken = true): void {
  statsRouteBroken = broken
}

/** Restore the live default: nothing at all. */
export function resetMockHosts(): void {
  applications = []
  hosts = []
  statsRouteBroken = false
}

/**
 * Opt into the populated seed.
 *
 * ⚠️ Deliberately a function a test must call, not a default. Production holds
 * zero rows, so a test that does not ask for data is testing the state an
 * operator is actually in.
 */
export function seedMockHosts(): void {
  applications = populatedApplications()
  hosts = populatedHosts()
}

/** Read-only view, for assertions about what a write actually changed. */
export function mockHostApplications(): readonly MockApplication[] {
  return applications
}

export function mockLiveHosts(): readonly MockHost[] {
  return hosts
}

declare global {
  var __mockHosts: { readonly seed: () => void; readonly reset: () => void } | undefined
}

/**
 * The seed switch, in a real browser.
 *
 * ⚠️ **Nothing outside this bundle can reach `seedMockHosts()` otherwise.** The
 * fixtures are module variables inside the page's own JavaScript, and the
 * live-faithful default is zero rows (H3) — so without this the e2e suite, and
 * a developer poking at the panel, would both be looking at an empty queue
 * forever.
 *
 * ⚠️ **The choice is remembered in `sessionStorage`, which is the whole
 * point.** A reload re-evaluates the bundle and the fixtures go back to empty,
 * so a seed that lived only in memory would vanish on the first refresh — and
 * every e2e test would have to reach its screen by clicking through the
 * sidebar, which is a different widget at 360px than at 1920px. The flag lets
 * a test (or a person) ask for data once and then navigate normally.
 *
 * `sessionStorage` and not `localStorage`: the seeded state should not outlive
 * the tab, or a developer would find invented hosts waiting for them tomorrow.
 */
const SEED_FLAG = 'callschat.mocks.hosts.seeded'

function remember(seeded: boolean): void {
  /* Private browsing and a blocked-storage profile both throw on access. */
  try {
    if (seeded) sessionStorage.setItem(SEED_FLAG, '1')
    else sessionStorage.removeItem(SEED_FLAG)
  } catch {
    /* A forgotten preference is harmless; a crashed mock backend is not. */
  }
}

export function exposeHostFixtureControls(): void {
  let wanted: boolean
  try {
    wanted = sessionStorage.getItem(SEED_FLAG) === '1'
  } catch {
    wanted = false
  }
  if (wanted) seedMockHosts()

  globalThis.__mockHosts = {
    seed: () => {
      seedMockHosts()
      remember(true)
    },
    reset: () => {
      resetMockHosts()
      remember(false)
    },
  }
}

/* ------------------------------------------------------------------ *
 * Validation — the service's own wordings, verbatim
 * ------------------------------------------------------------------ */

const APPLICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const HOST_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const

/**
 * ⚠️ Compared **exactly**, with no case folding. `?status=pending` is a 400 on
 * the live service, and a mock that accepted it would let the panel ship a
 * lower-cased filter that 400s in production.
 */
function enumIssue(
  field: string,
  value: string | null,
  allowed: readonly string[],
): string | null {
  if (value === null) return null
  if (allowed.includes(value)) return null

  return `querystring/${field} Invalid enum value. Expected ${allowed
    .map((option) => `'${option}'`)
    .join(' | ')}, received '${value}'`
}

function pagingIssue(params: URLSearchParams): string | null {
  const rawLimit = params.get('limit')
  const rawPage = params.get('page')

  if (rawLimit !== null) {
    const limit = Number(rawLimit)
    if (!Number.isFinite(limit)) return 'querystring/limit Expected number'
    if (limit > 100) return 'querystring/limit Number must be less than or equal to 100'
    if (limit < 1) return 'querystring/limit Number must be greater than or equal to 1'
  }

  if (rawPage !== null) {
    const page = Number(rawPage)
    if (!Number.isFinite(page)) return 'querystring/page Expected number'
    if (page < 1) return 'querystring/page Number must be greater than or equal to 1'
  }

  return null
}

/** `startDate` / `endDate` must parse as datetimes. `YYYY-MM-DD` is accepted. */
function dateIssue(params: URLSearchParams): string | null {
  for (const field of ['startDate', 'endDate'] as const) {
    const raw = params.get(field)
    if (raw === null) continue
    if (Number.isNaN(Date.parse(raw))) {
      return `querystring/${field} Invalid datetime`
    }
  }

  return null
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text()
  if (raw.trim() === '') return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

const EMPTY_BODY = "Body cannot be empty when content-type is set to 'application/json'"

function paginate<T>(rows: readonly T[], params: URLSearchParams) {
  const limit = Number(params.get('limit') ?? 20)
  const page = Number(params.get('page') ?? 1)
  const start = (page - 1) * limit

  return {
    data: rows.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: rows.length,
      /*
       * ⚠️ `Math.max(1, …)` — the live service answers `totalPages: 1` for an
       * empty table, not 0. Verified 2026-10-15.
       */
      totalPages: Math.max(1, Math.ceil(rows.length / limit)),
    },
  }
}

function matchesSearch(row: MockApplication | MockHost, term: string): boolean {
  const haystack = [
    row.user?.profile?.displayName ?? '',
    row.user?.profile?.username ?? '',
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(term.toLowerCase())
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const hostHandlers = [
  /**
   * `GET /admin/live/host-applications/stats`.
   *
   * ⚠️ Registered **before** the list route below. MSW matches in order, and
   * `/host-applications/:id` would otherwise swallow `/stats` and answer the
   * detail 404 for it.
   */
  http.get(`${APPLICATIONS}/stats`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    /* The live 404, verbatim — the detail message, not a route error. */
    if (statsRouteBroken) {
      return errorResponse(404, NOT_FOUND, 'Host application not found')
    }

    const approved = applications.filter((row) => row.status === 'APPROVED').length

    return HttpResponse.json({
      success: true,
      data: {
        totalApplications: applications.length,
        pendingCount: applications.filter((row) => row.status === 'PENDING').length,
        approvedCount: approved,
        rejectedCount: applications.filter((row) => row.status === 'REJECTED').length,
        activeHostsCount: hosts.filter((row) => row.status === 'ACTIVE').length,
        suspendedHostsCount: hosts.filter(
          (row) => row.status === 'SUSPENDED' || row.status === 'BANNED',
        ).length,
      },
    })
  }),

  /** `GET /admin/live/host-applications`. */
  http.get(APPLICATIONS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const params = new URL(request.url).searchParams

    const issue =
      enumIssue('status', params.get('status'), APPLICATION_STATUSES) ??
      pagingIssue(params) ??
      dateIssue(params)
    if (issue) return errorResponse(400, VALIDATION, issue)

    /*
     * ⚠️ `niche` is read and filtered on, but **never validated** — exactly as
     * the service behaves (plan.md §3.2). An unknown value is not an error; it
     * simply matches nothing, which is the silent-wrong-answer this reproduces
     * so the panel's closed select looks necessary.
     */
    const niche = params.get('niche')
    const status = params.get('status')
    const search = params.get('search')

    const rows = applications.filter((row) => {
      if (status !== null && row.status !== status) return false
      if (niche !== null && row.niche !== niche) return false
      if (search !== null && search !== '' && !matchesSearch(row, search)) return false
      return true
    })

    if (isEmptyScenario()) {
      return HttpResponse.json({ success: true, ...paginate([], params) })
    }

    return HttpResponse.json({ success: true, ...paginate(rows, params) })
  }),

  /**
   * `POST /admin/live/host-applications/:id/review`.
   *
   * ⚠️ **Validation before lookup.** A malformed body against an id that does
   * not exist answers `400`, not `404` — verified live, and the reason the
   * whole write contract could be mapped against an empty database.
   */
  http.post(`${APPLICATIONS}/:id/review`, async ({ request, params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return errorResponse(400, VALIDATION, EMPTY_BODY)

    const action = body['action']
    if (action !== 'APPROVE' && action !== 'REJECT') {
      return errorResponse(
        400,
        VALIDATION,
        "body/action Action must be either 'APPROVE' or 'REJECT'",
      )
    }

    if (action === 'REJECT') {
      const reason = body['rejectionReason']
      if (typeof reason !== 'string' || reason.trim().length < 5) {
        return errorResponse(
          400,
          VALIDATION,
          'body/rejectionReason A rejection reason of at least 5 characters is required when rejecting an application',
        )
      }
    }

    const row = applications.find((candidate) => candidate.id === params['id'])
    if (!row) {
      /* ⚠️ The doubled message, verbatim. Repaired in `api/hosts.ts`. */
      return errorResponse(404, NOT_FOUND, 'Host application not found not found')
    }

    row.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    row.reviewedAt = new Date().toISOString()
    row.rejectionReason =
      action === 'REJECT' ? String(body['rejectionReason']) : row.rejectionReason

    /*
     * Approving creates the live host profile, exactly as the service does —
     * which is what makes the approval irreversible from this panel.
     */
    if (action === 'APPROVE' && !hosts.some((host) => host.userId === row.userId)) {
      hosts.push({
        id: `prof_${row.userId}`,
        userId: row.userId,
        status: 'ACTIVE',
        badgeLevel: 1,
        totalLiveHours: 0,
        totalLiveSessions: 0,
        peakViewers: 0,
        totalDiamondsEarned: 0,
        totalGiftsReceived: 0,
        withdrawableDiamonds: 0,
        pendingWithdrawal: 0,
        revenueSharePercent: 70,
        isLive: false,
        lastLiveAt: null,
        followersCount: 0,
        approvedAt: new Date().toISOString(),
        suspendedAt: null,
        suspendedById: null,
        suspendedReason: null,
        user: row.user,
      })
    }

    return HttpResponse.json({ success: true, data: row })
  }),

  /** `GET /admin/live/host-applications/:id`. */
  http.get(`${APPLICATIONS}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = applications.find((candidate) => candidate.id === params['id'])
    if (!row) {
      return errorResponse(404, NOT_FOUND, 'Host application not found not found')
    }

    return HttpResponse.json({ success: true, data: row })
  }),

  /** `GET /admin/live/hosts`. */
  http.get(HOSTS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const params = new URL(request.url).searchParams

    const issue =
      enumIssue('status', params.get('status'), HOST_STATUSES) ?? pagingIssue(params)
    if (issue) return errorResponse(400, VALIDATION, issue)

    const status = params.get('status')
    const search = params.get('search')

    const rows = hosts.filter((row) => {
      if (status !== null && row.status !== status) return false
      if (search !== null && search !== '' && !matchesSearch(row, search)) return false
      return true
    })

    if (isEmptyScenario()) {
      return HttpResponse.json({ success: true, ...paginate([], params) })
    }

    return HttpResponse.json({ success: true, ...paginate(rows, params) })
  }),

  /**
   * `PATCH /admin/live/hosts/:userId/status`.
   *
   * ⚠️ Keyed on `userId`, not on the profile's own `id`. Both appear on every
   * roster row and they are different values.
   */
  http.patch(`${HOSTS}/:userId/status`, async ({ request, params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    if (!body) return errorResponse(400, VALIDATION, EMPTY_BODY)

    const status = body['status']
    if (
      typeof status !== 'string' ||
      !(HOST_STATUSES as readonly string[]).includes(status)
    ) {
      return errorResponse(
        400,
        VALIDATION,
        "body/status Status must be 'ACTIVE', 'SUSPENDED', or 'BANNED'",
      )
    }

    /* ⚠️ Required for BANNED as well as SUSPENDED — the doc never says so. */
    if (status === 'SUSPENDED' || status === 'BANNED') {
      const reason = body['reason']
      if (typeof reason !== 'string' || reason.trim().length < 5) {
        return errorResponse(
          400,
          VALIDATION,
          'body/reason A reason of at least 5 characters is required when suspending or banning a host',
        )
      }
    }

    const row = hosts.find((candidate) => candidate.userId === params['userId'])
    if (!row) {
      return errorResponse(
        404,
        NOT_FOUND,
        'Live host profile not found for this user not found',
      )
    }

    row.status = status
    const active = status === 'ACTIVE'
    row.suspendedReason = active ? null : String(body['reason'] ?? row.suspendedReason)
    row.suspendedAt = active ? null : new Date().toISOString()
    row.suspendedById = active ? null : 'usr_admin_1'

    return HttpResponse.json({ success: true, data: row })
  }),
]
