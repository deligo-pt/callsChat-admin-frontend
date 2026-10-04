import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Official Announcements — a deliberately **faithful** mock (plan.md §7, B1).
 *
 * It reproduces what the live service measurably does, including the parts that
 * look like defects, because a mock that behaves better than production is a
 * mock that lets a bug ship. Everything below was observed against
 * `https://api.callschat.com/api/v1` on **2026-10-04**:
 *
 *   - the **first** list envelope, `{ success, data: [], pagination }` — not the
 *     `{ data: { items, meta } }` of `/admin/feedbacks` nor the
 *     `{ data: { …counters, requests } }` of `/admin/verifications`;
 *   - `limit` defaults to **20**, is capped at **100**, and must be ≥ 1;
 *   - `page` must be ≥ 1 and is **echoed, not clamped**: `?page=99` answers 200
 *     with `page: 99` and no rows;
 *   - `sortBy` is **silently ignored** — it is not in the query schema, and this
 *     API drops unknown query parameters rather than rejecting them;
 *   - `isPinned` is an enum of the **strings** `'true'`/`'false'`;
 *   - `title` is 3–255, `actionText` ≤ 100, `content` has **no maximum**;
 *   - `mediaUrl` must be a valid URL; **`actionUrl` is free text** and accepts
 *     `"not a url"`;
 *   - **`GET /admin/announcements/:id` does not exist** and answers
 *     `ROUTE_NOT_FOUND` (plan.md §3.2);
 *   - `POST /:id/pin` **requires** `isPinned`; an empty body is a 400;
 *   - `PATCH` with an empty body passes validation and reaches the lookup;
 *   - the not-found message really does read `"Announcement not found not
 *     found"` — the service concatenates a label with its own suffix;
 *   - `POST /media/upload` validates **nothing** and has no delete route
 *     (plan.md §3.4).
 *
 * ⚠️ **The live table is empty.** Every row below is therefore invented in
 * *shape* as well as content — see the provenance note in
 * `types/announcement.ts`. They exist so the queue is developable; the `empty`
 * scenario reproduces the real production state, which is zero rows.
 *
 * The six client routes under `/api/v1/announcements` are **not** mocked. The
 * panel must never call them: `broadcast.md` §3.4 has the detail route
 * increment the global impression counter and write a read receipt for the
 * caller, so mocking it would make a forbidden call look harmless in tests.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const NOT_FOUND = 'NOT_FOUND' as const
const ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND' as const

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockAnnouncement {
  id: string
  title: string
  content: string
  priority: string
  status: string
  targetAudience: string
  isPinned: boolean
  pinnedAt: string | null
  mediaUrl: string | null
  mediaKey: string | null
  mediaType: string | null
  mediaThumbnailUrl: string | null
  mediaDuration: number | null
  mediaSize: number | null
  actionText: string | null
  actionUrl: string | null
  isEncrypted: boolean
  encryptedPayload: unknown
  authorId: string | null
  author: {
    id: string
    profile: { displayName: string | null; avatarUrl: string | null } | null
  } | null
  viewsCount: number
  isRead: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** The signed-in Super Admin in `handlers/auth.ts`, so names resolve. */
const ROOT_ADMIN = 'cmt8orkov00004upco3oifg2v'

const MEDIA_HOST = 'https://media.callschat.com/calls-chat-media/uploads'

function seed(): MockAnnouncement[] {
  return [
    {
      id: 'cmutnyeq9000101mkrnqsid3m',
      title: 'Important Security Update',
      content:
        'Please verify your active login sessions under Settings > Security. If you see a device you do not recognise, sign it out and change your password.',
      priority: 'URGENT',
      status: 'PUBLISHED',
      targetAudience: 'ALL',
      isPinned: true,
      pinnedAt: '2026-10-04T08:15:00.000Z',
      mediaUrl: `${MEDIA_HOST}/86148262-9d0f-439c-ae6b-62e2d7295712.jpg`,
      mediaKey: 'uploads/86148262-9d0f-439c-ae6b-62e2d7295712.jpg',
      mediaType: 'IMAGE',
      mediaThumbnailUrl: null,
      mediaDuration: null,
      mediaSize: 245_100,
      actionText: 'Check Sessions',
      actionUrl: '/settings/sessions',
      isEncrypted: false,
      encryptedPayload: null,
      authorId: ROOT_ADMIN,
      author: {
        id: ROOT_ADMIN,
        profile: { displayName: 'CallsChat Security Team', avatarUrl: null },
      },
      viewsCount: 1420,
      isRead: false,
      publishedAt: '2026-10-04T08:15:00.000Z',
      createdAt: '2026-10-04T08:10:00.000Z',
      updatedAt: '2026-10-04T08:15:00.000Z',
    },
    {
      id: 'cmutnyeq9000201mkrnqsid3n',
      title: 'CallsChat 2.0 Live Rooms Are Here!',
      content:
        'Join high-definition 10-slot audio rooms, send virtual gifts, and interact with hosts.',
      priority: 'HIGH',
      status: 'PUBLISHED',
      targetAudience: 'ALL',
      isPinned: false,
      pinnedAt: null,
      mediaUrl: `${MEDIA_HOST}/c19d7f41-55a2-4e0e-9d1e-2b7a9f0c4411.mp4`,
      mediaKey: 'uploads/c19d7f41-55a2-4e0e-9d1e-2b7a9f0c4411.mp4',
      mediaType: 'VIDEO',
      mediaThumbnailUrl: null,
      mediaDuration: 45,
      mediaSize: 8_412_664,
      actionText: 'Explore Audio Stage',
      actionUrl: '/channels',
      isEncrypted: false,
      encryptedPayload: null,
      /*
       * ⚠️ `authorId` with **no** `author` expansion — the fallback path.
       * `broadcast.md` §3.1 shows the nested object, but nothing guarantees the
       * admin list projects it, so `useActorName` has to carry this case.
       */
      authorId: ROOT_ADMIN,
      author: null,
      viewsCount: 9_204,
      isRead: true,
      publishedAt: '2026-09-29T09:00:00.000Z',
      createdAt: '2026-09-29T08:40:00.000Z',
      updatedAt: '2026-09-29T09:00:00.000Z',
    },
    {
      id: 'cmutnyeq9000301mkrnqsid3o',
      title: 'Business tools are coming to your workspace',
      content:
        'Verified business accounts will soon be able to publish a catalogue directly from chat.',
      priority: 'NORMAL',
      status: 'DRAFT',
      targetAudience: 'BUSINESS',
      isPinned: false,
      pinnedAt: null,
      mediaUrl: null,
      mediaKey: null,
      mediaType: null,
      mediaThumbnailUrl: null,
      mediaDuration: null,
      mediaSize: null,
      /*
       * ⚠️ `actionUrl` is free text on this API: `"not a url"` was accepted
       * where the same string on `mediaUrl` was refused. A typo like this is
       * exactly what reaches every phone as a dead CTA, so one row carries it.
       */
      actionText: 'Learn more',
      actionUrl: 'coming soon',
      isEncrypted: false,
      encryptedPayload: null,
      authorId: ROOT_ADMIN,
      author: { id: ROOT_ADMIN, profile: { displayName: null, avatarUrl: null } },
      /* A draft has never been seen by anyone. */
      viewsCount: 0,
      isRead: false,
      publishedAt: null,
      createdAt: '2026-10-02T14:22:00.000Z',
      updatedAt: '2026-10-02T14:22:00.000Z',
    },
    {
      /*
       * ⚠️ **The hostile row.** Nothing here is decoration — each field is the
       * worst legal value for that column, and B5's layout and a11y sweeps are
       * driven against this record rather than a tidy one.
       *
       * - `title` is 255 characters, the server's exact maximum, as one
       *   unbroken token. A flex item does not shrink below its min-content
       *   width unless something lowers it, so this is what `wrap-anywhere`
       *   exists for — and what fails if it is ever swapped back to
       *   `break-words`.
       * - `content` is several thousand characters, which the service permits
       *   with **no maximum at all** (O6). It must clamp to one line in the
       *   queue and scroll rather than stretch in the editor.
       * - `actionUrl` is a long unbroken string, because the service does not
       *   URL-validate it — an operator can paste anything (§2.2).
       * - `mediaType` is `VIDEO` with **no duration and no size**, which the
       *   service accepts: the media cell must render without either.
       */
      id: 'cmutnyeq9000501mkrnqsid3q',
      title:
        'Operational-notice-concerning-the-scheduled-migration-of-legacy-identity-records-and-the-associated-downtime-window-which-affects-personal-accounts-in-every-region-and-requires-no-action-from-recipients-but-is-published-here-for-completeness-and-audit',
      content: `Full operational detail follows. ${'This sentence exists purely to make the body long enough to prove the queue clamps it and the editor scrolls it. '.repeat(
        40,
      )}`,
      priority: 'NORMAL',
      status: 'PUBLISHED',
      targetAudience: 'PERSONAL',
      isPinned: false,
      pinnedAt: null,
      mediaUrl: `${MEDIA_HOST}/d4e5f6a7-b8c9-40d1-a2e3-f4a5b6c7d8e9.mp4`,
      mediaKey: 'uploads/d4e5f6a7-b8c9-40d1-a2e3-f4a5b6c7d8e9.mp4',
      mediaType: 'VIDEO',
      mediaThumbnailUrl: null,
      /* Both absent, which the service allows. */
      mediaDuration: null,
      mediaSize: null,
      actionText: 'Read the full migration notice',
      actionUrl:
        '/support/articles/legacy-identity-record-migration-window-and-downtime-expectations-for-personal-accounts',
      isEncrypted: false,
      encryptedPayload: null,
      authorId: ROOT_ADMIN,
      author: null,
      viewsCount: 48_219,
      isRead: false,
      publishedAt: '2026-09-18T06:30:00.000Z',
      createdAt: '2026-09-18T06:10:00.000Z',
      updatedAt: '2026-09-18T06:30:00.000Z',
    },
    {
      id: 'cmutnyeq9000401mkrnqsid3p',
      title:
        'Scheduled maintenance window — an unusually long headline that exists to prove a title of up to two hundred and fifty five characters cannot widen a table row or push the pin control off the side of a phone screen at three hundred and sixty pixels wide',
      content: 'CallsChat was briefly unavailable while we completed planned work.',
      priority: 'LOW',
      status: 'ARCHIVED',
      targetAudience: 'PERSONAL',
      isPinned: false,
      pinnedAt: null,
      mediaUrl: null,
      mediaKey: null,
      mediaType: null,
      mediaThumbnailUrl: null,
      mediaDuration: null,
      mediaSize: null,
      actionText: null,
      actionUrl: null,
      isEncrypted: false,
      encryptedPayload: null,
      /* No author at all — the service may not expand a deleted staff account. */
      authorId: null,
      author: null,
      viewsCount: 312,
      isRead: true,
      publishedAt: '2026-08-11T02:00:00.000Z',
      createdAt: '2026-08-10T22:15:00.000Z',
      updatedAt: '2026-08-12T06:00:00.000Z',
    },
  ]
}

let store: MockAnnouncement[] = seed()
let created = 0
let uploadCount = 0

/** Reset between tests. */
export function resetMockAnnouncements(): void {
  store = seed()
  created = 0
  uploadCount = 0
}

/** Read the store directly — for assertions a response cannot make. */
export function mockAnnouncements(): readonly MockAnnouncement[] {
  return store
}

/* ------------------------------------------------------------------ *
 * Validation, in the service's own words
 * ------------------------------------------------------------------ */

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED']
const AUDIENCES = ['ALL', 'PERSONAL', 'BUSINESS']
const MEDIA_TYPES = ['IMAGE', 'VIDEO']

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(' | ')
}

function enumError(
  field: string,
  values: readonly string[],
  received: unknown,
): string {
  return `body/${field} Invalid enum value. Expected ${quoted(values)}, received '${String(received)}'`
}

function isUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * The create/update body check.
 *
 * `requireAll` is the only difference between the two routes: `POST` rejects a
 * missing `title` or `content`, and `PATCH` accepts a completely empty object —
 * verified, since `{}` reached the record lookup and answered 404 rather than
 * 400.
 *
 * ⚠️ Field order in the concatenated message follows the service's: it reports
 * **every** bad field in one string, which is what `parseFieldErrors` splits.
 */
function validateBody(
  body: Record<string, unknown>,
  requireAll: boolean,
): string | null {
  const problems: string[] = []

  if (requireAll && body['title'] === undefined) problems.push('body/title Required')
  if (requireAll && body['content'] === undefined) {
    problems.push('body/content Required')
  }

  const title = body['title']
  if (title !== undefined) {
    if (typeof title !== 'string') {
      problems.push(`body/title Expected string, received ${typeof title}`)
    } else if (title.length < 3) {
      problems.push('body/title Title must be at least 3 characters')
    } else if (title.length > 255) {
      problems.push('body/title String must contain at most 255 character(s)')
    }
  }

  const content = body['content']
  if (content !== undefined) {
    if (typeof content !== 'string') {
      problems.push(`body/content Expected string, received ${typeof content}`)
    } else if (content.length < 1) {
      /* The service's own wording, which is not the generic min-length text. */
      problems.push('body/content Announcement content is required')
    }
  }

  for (const [field, values] of [
    ['priority', PRIORITIES],
    ['status', STATUSES],
    ['targetAudience', AUDIENCES],
    ['mediaType', MEDIA_TYPES],
  ] as const) {
    const value = body[field]
    if (value !== undefined && value !== null && !values.includes(String(value))) {
      problems.push(enumError(field, values, value))
    }
  }

  for (const field of ['isPinned', 'isEncrypted'] as const) {
    const value = body[field]
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      problems.push(`body/${field} Expected boolean, received ${typeof value}`)
    }
  }

  for (const field of [
    'mediaUrl',
    'mediaKey',
    'mediaThumbnailUrl',
    'actionText',
    'actionUrl',
  ] as const) {
    const value = body[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      problems.push(`body/${field} Expected string, received ${typeof value}`)
    }
  }

  for (const field of ['mediaDuration', 'mediaSize'] as const) {
    const value = body[field]
    if (value !== undefined && value !== null && typeof value !== 'number') {
      problems.push(`body/${field} Expected number, received ${typeof value}`)
    }
  }

  const actionText = body['actionText']
  if (typeof actionText === 'string' && actionText.length > 100) {
    problems.push('body/actionText String must contain at most 100 character(s)')
  }

  /*
   * ⚠️ `mediaUrl` is URL-validated and `actionUrl` is NOT. That asymmetry is
   * real and measured — `"not a url"` was refused on the first and accepted on
   * the second — and reproducing it is the whole reason this mock exists.
   */
  const mediaUrl = body['mediaUrl']
  if (typeof mediaUrl === 'string' && !isUrl(mediaUrl)) {
    problems.push('body/mediaUrl Invalid url')
  }

  return problems.length > 0 ? problems.join(', ') : null
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** `querystring/*` checks. Returns the parsed page/limit, or an error message. */
function readPaging(url: URL): { page: number; limit: number } | { error: string } {
  const problems: string[] = []

  const rawPage = url.searchParams.get('page')
  const rawLimit = url.searchParams.get('limit')

  let page = 1
  let limit = 20 /* ⚠️ The service's default, echoed back when unset. */

  if (rawPage !== null) {
    const parsed = Number(rawPage)
    if (!Number.isFinite(parsed)) {
      problems.push('querystring/page Expected number, received nan')
    } else if (parsed < 1) {
      problems.push('querystring/page Number must be greater than or equal to 1')
    } else {
      page = Math.trunc(parsed)
    }
  }

  if (rawLimit !== null) {
    const parsed = Number(rawLimit)
    if (!Number.isFinite(parsed)) {
      problems.push('querystring/limit Expected number, received nan')
    } else if (parsed < 1) {
      problems.push('querystring/limit Number must be greater than or equal to 1')
    } else if (parsed > 100) {
      problems.push('querystring/limit Number must be less than or equal to 100')
    } else {
      limit = Math.trunc(parsed)
    }
  }

  const queryEnums: readonly (readonly [string, readonly string[]])[] = [
    ['status', STATUSES],
    ['priority', PRIORITIES],
    ['targetAudience', AUDIENCES],
    /* ⚠️ Strings, not booleans — the service's enum is `'true' | 'false'`. */
    ['isPinned', ['true', 'false']],
  ]

  for (const [field, values] of queryEnums) {
    const value = url.searchParams.get(field)
    if (value !== null && !values.includes(value)) {
      problems.push(
        `querystring/${field} Invalid enum value. Expected ${quoted(values)}, received '${value}'`,
      )
    }
  }

  if (problems.length > 0) return { error: problems.join(', ') }
  return { page, limit }
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const announcementHandlers = [
  /*
   * ⚠️ BEFORE the `:id` route below. `/stats` would otherwise be read as an id,
   * and MSW matches in registration order.
   */
  http.get(`${API_PREFIX}/admin/announcements/stats`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    /*
     * Derived from the store rather than hard-coded, so publishing a draft
     * moves the counters — which is the behaviour B2's stats strip claims.
     */
    const rows = isEmptyScenario() ? [] : store

    return HttpResponse.json({
      success: true,
      data: {
        totalPublished: rows.filter((row) => row.status === 'PUBLISHED').length,
        totalDrafts: rows.filter((row) => row.status === 'DRAFT').length,
        totalImpressions: rows.reduce((sum, row) => sum + row.viewsCount, 0),
        totalPinned: rows.filter((row) => row.isPinned).length,
        /* No per-row breakdown exists; the service reports one global number. */
        totalReadReceipts: rows.reduce(
          (sum, row) => sum + Math.floor(row.viewsCount * 0.7),
          0,
        ),
      },
    })
  }),

  http.get(`${API_PREFIX}/admin/announcements`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const paging = readPaging(url)
    if ('error' in paging) return errorResponse(400, VALIDATION, paging.error)

    if (isEmptyScenario()) {
      return HttpResponse.json({
        success: true,
        data: [],
        pagination: { page: paging.page, limit: paging.limit, total: 0, totalPages: 0 },
      })
    }

    const status = url.searchParams.get('status')
    const priority = url.searchParams.get('priority')
    const audience = url.searchParams.get('targetAudience')
    const pinned = url.searchParams.get('isPinned')
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''

    let rows = [...store]
    if (status) rows = rows.filter((row) => row.status === status)
    if (priority) rows = rows.filter((row) => row.priority === priority)
    if (audience) rows = rows.filter((row) => row.targetAudience === audience)
    if (pinned) rows = rows.filter((row) => row.isPinned === (pinned === 'true'))
    if (search) {
      /*
       * ⚠️ Title **and** content. `broadcast.md` §3.1 claims both for the client
       * feed and says nothing about the admin route, and the empty table made it
       * impossible to observe (plan.md O9). The wider reading is mocked, because
       * a mock that searched less than production would hide rows a test expects
       * to find rather than invent ones it does not.
       */
      rows = rows.filter(
        (row) =>
          row.title.toLowerCase().includes(search) ||
          row.content.toLowerCase().includes(search),
      )
    }

    /*
     * Pinned first, then newest. `broadcast.md` §3.1 states that order for the
     * client feed; the admin route's order was unobservable, and this is the
     * only documented ordering the backend admits to.
     *
     * ⚠️ `sortBy` is deliberately **not** read. It is absent from the query
     * schema, and this API silently drops unknown parameters — so a mock that
     * honoured one would make a sort control look functional (plan.md O4).
     */
    rows.sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
      const leftAt = Date.parse(left.publishedAt ?? left.createdAt)
      const rightAt = Date.parse(right.publishedAt ?? right.createdAt)
      return rightAt - leftAt
    })

    const total = rows.length
    const start = (paging.page - 1) * paging.limit

    return HttpResponse.json({
      success: true,
      /* ⚠️ `page` is echoed, not clamped — `?page=99` yields an empty slice. */
      data: rows.slice(start, start + paging.limit),
      pagination: {
        page: paging.page,
        limit: paging.limit,
        total,
        totalPages: Math.ceil(total / paging.limit),
      },
    })
  }),

  /**
   * ⚠️ **This route does not exist, and the mock says so.**
   *
   * Registered on purpose rather than left to fall through, because
   * `handlers/resources.ts` carries a catch-all that would otherwise answer it
   * with something plausible. The panel must never call this (plan.md §3.2),
   * and a 404 naming the method and path is how a stray call announces itself
   * instead of quietly working in tests and failing live.
   */
  http.get(`${API_PREFIX}/admin/announcements/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return errorResponse(
      404,
      ROUTE_NOT_FOUND,
      `Cannot GET /api/v1/admin/announcements/${String(params['id'])} – the requested route does not exist.`,
    )
  }),

  http.post(`${API_PREFIX}/admin/announcements`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const invalid = validateBody(body, true)
    if (invalid) return errorResponse(400, VALIDATION, invalid)

    created += 1
    const now = new Date().toISOString()
    const status = typeof body['status'] === 'string' ? body['status'] : 'DRAFT'
    const isPinned = body['isPinned'] === true

    const record: MockAnnouncement = {
      id: `cmutnyeq9${String(created).padStart(4, '0')}01mkrnqnew`,
      title: String(body['title']),
      content: String(body['content']),
      /*
       * ⚠️ These three defaults are **guesses**, and the panel is built never to
       * rely on them (plan.md §3.7): the payload type requires all four, so no
       * request from this app can reach them. They exist only so a hand-rolled
       * body in a test gets a complete record back.
       */
      priority: typeof body['priority'] === 'string' ? body['priority'] : 'NORMAL',
      status,
      targetAudience:
        typeof body['targetAudience'] === 'string' ? body['targetAudience'] : 'ALL',
      isPinned,
      pinnedAt: isPinned ? now : null,
      mediaUrl: (body['mediaUrl'] as string | undefined) ?? null,
      mediaKey: (body['mediaKey'] as string | undefined) ?? null,
      mediaType: (body['mediaType'] as string | undefined) ?? null,
      mediaThumbnailUrl: (body['mediaThumbnailUrl'] as string | undefined) ?? null,
      mediaDuration: (body['mediaDuration'] as number | undefined) ?? null,
      mediaSize: (body['mediaSize'] as number | undefined) ?? null,
      actionText: (body['actionText'] as string | undefined) ?? null,
      actionUrl: (body['actionUrl'] as string | undefined) ?? null,
      isEncrypted: body['isEncrypted'] === true,
      encryptedPayload: null,
      authorId: ROOT_ADMIN,
      author: {
        id: ROOT_ADMIN,
        profile: { displayName: 'Nadia Rahman', avatarUrl: null },
      },
      viewsCount: 0,
      isRead: false,
      /*
       * ⚠️ `publishedAt` is set by the SERVER, never by the caller — the field
       * is not in the write schema and a supplied value is stripped, so there is
       * no scheduling (plan.md §3.5).
       */
      publishedAt: status === 'PUBLISHED' ? now : null,
      createdAt: now,
      updatedAt: now,
    }

    store = [record, ...store]
    return HttpResponse.json({ success: true, data: record }, { status: 201 })
  }),

  http.patch(`${API_PREFIX}/admin/announcements/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    /*
     * ⚠️ `requireAll: false`. An empty `{}` passes validation and falls through
     * to the lookup — verified by a 404, not a 400. So validation runs BEFORE
     * the record is found, and a schema can be probed against an id that does
     * not exist.
     */
    const invalid = validateBody(body, false)
    if (invalid) return errorResponse(400, VALIDATION, invalid)

    const index = store.findIndex((row) => row.id === params['id'])
    /* The service's doubled wording, verbatim. */
    if (index < 0)
      return errorResponse(404, NOT_FOUND, 'Announcement not found not found')

    const existing = store[index]
    if (!existing)
      return errorResponse(404, NOT_FOUND, 'Announcement not found not found')

    const now = new Date().toISOString()
    const nextStatus =
      typeof body['status'] === 'string' ? body['status'] : existing.status
    const nextPinned =
      typeof body['isPinned'] === 'boolean' ? body['isPinned'] : existing.isPinned

    const updated: MockAnnouncement = {
      ...existing,
      ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}),
      ...(typeof body['content'] === 'string' ? { content: body['content'] } : {}),
      ...(typeof body['priority'] === 'string' ? { priority: body['priority'] } : {}),
      ...(typeof body['targetAudience'] === 'string'
        ? { targetAudience: body['targetAudience'] }
        : {}),
      ...(body['mediaUrl'] !== undefined
        ? { mediaUrl: (body['mediaUrl'] as string | null) ?? null }
        : {}),
      ...(body['mediaKey'] !== undefined
        ? { mediaKey: (body['mediaKey'] as string | null) ?? null }
        : {}),
      ...(body['mediaType'] !== undefined
        ? { mediaType: (body['mediaType'] as string | null) ?? null }
        : {}),
      ...(body['mediaDuration'] !== undefined
        ? { mediaDuration: (body['mediaDuration'] as number | null) ?? null }
        : {}),
      ...(body['mediaSize'] !== undefined
        ? { mediaSize: (body['mediaSize'] as number | null) ?? null }
        : {}),
      ...(body['actionText'] !== undefined
        ? { actionText: (body['actionText'] as string | null) ?? null }
        : {}),
      ...(body['actionUrl'] !== undefined
        ? { actionUrl: (body['actionUrl'] as string | null) ?? null }
        : {}),
      status: nextStatus,
      isPinned: nextPinned,
      pinnedAt: nextPinned ? (existing.pinnedAt ?? now) : null,
      /*
       * ⚠️ A `PATCH` can publish, and when it does the timestamp is stamped
       * here — an edit form is not a safe surface by virtue of being an edit.
       */
      publishedAt:
        nextStatus === 'PUBLISHED'
          ? (existing.publishedAt ?? now)
          : existing.publishedAt,
      updatedAt: now,
    }

    store = [...store.slice(0, index), updated, ...store.slice(index + 1)]
    return HttpResponse.json({ success: true, data: updated })
  }),

  http.post(
    `${API_PREFIX}/admin/announcements/:id/pin`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const body = await readBody(request)
      /* ⚠️ Required here, unlike in `PATCH` where the same field is optional. */
      if (body['isPinned'] === undefined) {
        return errorResponse(400, VALIDATION, 'body/isPinned Required')
      }
      if (typeof body['isPinned'] !== 'boolean') {
        return errorResponse(
          400,
          VALIDATION,
          `body/isPinned Expected boolean, received ${typeof body['isPinned']}`,
        )
      }

      const index = store.findIndex((row) => row.id === params['id'])
      if (index < 0) {
        return errorResponse(404, NOT_FOUND, 'Announcement not found not found')
      }
      const existing = store[index]
      if (!existing) {
        return errorResponse(404, NOT_FOUND, 'Announcement not found not found')
      }

      const now = new Date().toISOString()
      const updated: MockAnnouncement = {
        ...existing,
        isPinned: body['isPinned'],
        pinnedAt: body['isPinned'] ? (existing.pinnedAt ?? now) : null,
        updatedAt: now,
      }

      store = [...store.slice(0, index), updated, ...store.slice(index + 1)]
      return HttpResponse.json({ success: true, data: updated })
    },
  ),

  http.delete(`${API_PREFIX}/admin/announcements/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const index = store.findIndex((row) => row.id === params['id'])
    if (index < 0) {
      return errorResponse(404, NOT_FOUND, 'Announcement not found not found')
    }

    /*
     * ⚠️ The record goes, and per `broadcast.md` §4 so does its media object in
     * RustFS. This is the ONLY path that ever deletes an uploaded file —
     * `/media/upload` has no delete route of its own (plan.md §3.4).
     */
    store = [...store.slice(0, index), ...store.slice(index + 1)]
    return HttpResponse.json({ success: true, message: 'Announcement deleted' })
  }),

  /**
   * `POST /api/v1/media/upload`.
   *
   * ⚠️ **It validates nothing, and the mock must not either.** A `text/plain`
   * file was accepted, stored and served back publicly, verified 2026-10-04 —
   * and a mock that enforced an allow-list would make
   * `isAllowedAnnouncementMedia` look like a server guarantee instead of the
   * client-side courtesy it is (plan.md §3.4, O1).
   *
   * It also accepts any field name; `file` is used because the doc says so.
   */
  http.post(`${API_PREFIX}/media/upload`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    if (!request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      return errorResponse(406, VALIDATION, 'the request is not multipart')
    }

    /*
     * ⚠️ **The raw body is parsed by hand, and `request.formData()` is
     * deliberately not used.** Under vitest's jsdom environment it throws for
     * *every* multipart request, on any part type: undici's
     * `multipartFormDataParser` asserts `webidl.is.File(value)` against a brand
     * it only sets on its own `File`, but constructs the value with the
     * **global** `File` — which jsdom has shadowed. The assertion can therefore
     * never hold, and the request fails with a 500 before a handler sees it.
     *
     * Verified 2026-10-04 by posting a jsdom `File`, a `node:buffer` `File`, a
     * named jsdom `Blob` and a named `node:buffer` `Blob`: all four failed
     * identically. `handlers/settings.ts` has the same `formData()` call for
     * `POST /admin/settings/logo` and 500s the same way — which is why
     * `uploadBrandLogo` has never had a test (plan.md O11).
     *
     * A regex over the body is cruder but it works in both environments, and a
     * mock that cannot be driven from a test is no mock at all.
     */
    const raw = await request.text()
    const filename = /filename="([^"]*)"/.exec(raw)?.[1]
    const mimetype = /Content-Type:\s*([^\r\n;]+)/i.exec(raw)?.[1]?.trim()

    if (!filename) {
      /* Multipart, but with no file part — the live route needs one. */
      return errorResponse(406, VALIDATION, 'the request is not multipart')
    }

    /*
     * The name first, then the type. ⚠️ Under jsdom the name is always the
     * literal `blob` (see above), so the mimetype is the only thing left to
     * derive a realistic extension from — and the live service's keys do carry
     * one, which B3's UI shows beside an attachment.
     */
    const fromName = filename.includes('.') ? filename.split('.').pop() : undefined
    const fromType = mimetype?.split('/')[1]?.replace('svg+xml', 'svg').split('+')[0]
    const extension = fromName ?? fromType ?? 'bin'
    const key = `uploads/mock-${String(uploadCount++)}.${extension}`

    return HttpResponse.json({
      success: true,
      data: {
        /* The real host. The doc's `localhost:9100` is local-only. */
        url: `https://media.callschat.com/calls-chat-media/${key}`,
        key,
        filename,
        /*
         * ⚠️ Echoed from the request, never inspected. The live route stored a
         * `text/plain` file without complaint, and a mock that second-guessed
         * the type would make `isAllowedAnnouncementMedia` look like a server
         * guarantee instead of the client-side courtesy it is.
         */
        mimetype: mimetype ?? 'application/octet-stream',
      },
    })
  }),
]
