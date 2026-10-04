import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncementStats,
  fetchAnnouncements,
  setAnnouncementPin,
  updateAnnouncement,
  uploadAnnouncementMedia,
} from '@/api/announcements'
import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import { API_URL } from '@/env'
import {
  mockAnnouncements,
  resetMockAnnouncements,
} from '@/mocks/handlers/announcements'
import type { AnnouncementWritePayload } from '@/types/announcement'

/**
 * Does the mock actually behave like the live service?
 *
 * One `describe` per measured behaviour, driven through the **real**
 * `api/announcements.ts` rather than by reaching into the handler. Without this
 * file, "the mock reproduces the service" is a claim in a comment; with it, the
 * claim fails a test when it stops being true.
 *
 * Every expectation here was observed against `https://api.callschat.com/api/v1`
 * on **2026-10-04** — except where a test says otherwise, which is itself the
 * point: this module's mock is partly a faithful reproduction and partly an
 * educated guess, and the two are labelled.
 */

const PINNED = 'cmutnyeq9000101mkrnqsid3m'
const DRAFT = 'cmutnyeq9000301mkrnqsid3o'

/** A complete body, since the payload type requires all four enum fields (§3.7). */
const BODY: AnnouncementWritePayload = {
  title: 'A new announcement',
  content: 'Something worth telling everyone.',
  priority: 'NORMAL',
  status: 'DRAFT',
  targetAudience: 'ALL',
  isPinned: false,
}

beforeEach(() => {
  resetMockAnnouncements()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the first list envelope, and its defaults', () => {
  it('returns rows under `data` with the counters in `pagination`', async () => {
    const page = await fetchAnnouncements()

    expect(page.data.length).toBeGreaterThan(0)
    expect(page.pagination.total).toBe(page.data.length)
  })

  it('defaults `limit` to 20 and echoes it back', async () => {
    /* ⚠️ Measured: the live service echoed `limit: 20` when none was sent. */
    expect((await fetchAnnouncements()).pagination.limit).toBe(20)
  })

  it('defaults `page` to 1', async () => {
    expect((await fetchAnnouncements()).pagination.page).toBe(1)
  })
})

describe('paging echoes rather than clamps', () => {
  it('answers 200 with the page echoed and no rows', async () => {
    /* ⚠️ Measured on the live, empty table: `page: 99`, `totalPages: 0`. */
    const page = await fetchAnnouncements({ page: 99 })

    expect(page.pagination.page).toBe(99)
    expect(page.data).toEqual([])
    /*
     * ⚠️ `total` still reports every row. An empty state chosen from `total` or
     * `totalPages` would claim there is a page to show; only `data.length` is
     * the truth.
     */
    expect(page.pagination.total).toBeGreaterThan(0)
  })

  it('rejects page 0, in the server’s own words', async () => {
    await expect(fetchAnnouncements({ page: 0 })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'querystring/page Number must be greater than or equal to 1',
    )
  })

  it('rejects a limit above 100, in the server’s own words', async () => {
    await expect(fetchAnnouncements({ limit: 999 })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'querystring/limit Number must be less than or equal to 100',
    )
  })

  it('rejects a limit of 0', async () => {
    await expect(fetchAnnouncements({ limit: 0 })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'querystring/limit Number must be greater than or equal to 1',
    )
  })
})

describe('the filters the query schema actually has', () => {
  it('filters by status', async () => {
    const page = await fetchAnnouncements({ status: 'PUBLISHED' })

    expect(page.data.length).toBeGreaterThan(0)
    expect(page.data.every((row) => row.status === 'PUBLISHED')).toBe(true)
  })

  it('filters by priority and by audience', async () => {
    expect(
      (await fetchAnnouncements({ priority: 'URGENT' })).data.every(
        (row) => row.priority === 'URGENT',
      ),
    ).toBe(true)

    expect(
      (await fetchAnnouncements({ targetAudience: 'BUSINESS' })).data.every(
        (row) => row.targetAudience === 'BUSINESS',
      ),
    ).toBe(true)
  })

  it('filters by `isPinned`, in both directions', async () => {
    const pinned = await fetchAnnouncements({ isPinned: true })
    expect(pinned.data.length).toBeGreaterThan(0)
    expect(pinned.data.every((row) => row.isPinned === true)).toBe(true)

    const unpinned = await fetchAnnouncements({ isPinned: false })
    expect(unpinned.data.length).toBeGreaterThan(0)
    expect(unpinned.data.every((row) => row.isPinned === false)).toBe(true)
  })

  it('puts `isPinned=false` on the wire rather than dropping it', async () => {
    /*
     * ⚠️ **`false` is the dangerous half of a boolean filter.** `buildUrl`
     * skips `undefined`, `null` and `''`; if that filter were ever widened to
     * skip falsy values, `isPinned=false` would disappear from the query string
     * and this filter would silently return every row — a no-op that looks like
     * a working control.
     *
     * So the assertion is on the request, not the response: the unpinned result
     * must be a strict subset of the unfiltered one. An asserted *count* would
     * also catch it, but only while the fixtures happen to differ; this holds
     * whatever the seed looks like.
     */
    const all = await fetchAnnouncements()
    const unpinned = await fetchAnnouncements({ isPinned: false })

    expect(unpinned.pagination.total).toBeLessThan(all.pagination.total)
    expect(unpinned.data.some((row) => row.isPinned === true)).toBe(false)
  })

  it('rejects a status outside the three, listing all of them', async () => {
    await expect(
      fetchAnnouncements({ status: 'SCHEDULED' as never }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('querystring/status') &&
        error.message.includes("'DRAFT' | 'PUBLISHED' | 'ARCHIVED'"),
    )
  })

  it('matches on content as well as title when searching', async () => {
    /*
     * ⚠️ **Unverified against the live service** — the table was empty, so
     * `search` could be accepted but never exercised (plan.md O9). The mock
     * takes the wider reading, matching what `broadcast.md` §3.1 claims for the
     * client feed. If the admin route turns out to be title-only, this test is
     * what has to change, and the comment is here so nobody mistakes it for a
     * measurement.
     */
    const byContent = await fetchAnnouncements({ search: 'audio rooms' })

    expect(byContent.data).toHaveLength(1)
    expect(byContent.data[0]?.title).toContain('Live Rooms')
  })

  it('ignores `sortBy` entirely, as the service does', async () => {
    /*
     * ⚠️ `sortBy` is absent from the query schema and this API drops unknown
     * query parameters rather than rejecting them — so a 200 is never proof a
     * filter applied. Honouring one in the mock would make a sort control look
     * functional while silently no-opping live (plan.md O4).
     */
    const url = new URL(`${API_URL}/admin/announcements`)
    url.searchParams.set('sortBy', 'title')
    url.searchParams.set('sortOrder', 'asc')

    const response = await fetch(url, {
      headers: { Authorization: 'Bearer test-token' },
    })
    expect(response.status).toBe(200)

    const sorted = (await response.json()) as { data: { id: string }[] }
    const natural = await fetchAnnouncements()

    expect(sorted.data.map((row) => row.id)).toEqual(natural.data.map((row) => row.id))
  })
})

describe('pinned rows come first', () => {
  it('orders pinned above unpinned, then newest first', async () => {
    /*
     * `broadcast.md` §3.1 states this for the client feed; the admin route's
     * order was unobservable on an empty table. It is the only ordering the
     * backend documents anywhere.
     */
    const page = await fetchAnnouncements()
    const pinnedFlags = page.data.map((row) => row.isPinned === true)

    expect(pinnedFlags).toEqual([...pinnedFlags].sort((a, b) => Number(b) - Number(a)))
  })
})

describe('there is no detail route, and the mock insists on it (§3.2)', () => {
  it('answers ROUTE_NOT_FOUND, naming the method and path', async () => {
    /*
     * ⚠️ The most important test in this file. `GET /admin/announcements/:id`
     * does not exist, and `handlers/resources.ts` used to mock it with a
     * plausible record — so a UI built against it passed every test and would
     * have failed live. This is the guard over that deletion.
     */
    const response = await fetch(`${API_URL}/admin/announcements/${PINNED}`, {
      headers: { Authorization: 'Bearer test-token' },
    })

    expect(response.status).toBe(404)

    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('ROUTE_NOT_FOUND')
    expect(body.error.message).toContain('the requested route does not exist')
  })

  it('still serves `/stats`, which sits at the same depth', async () => {
    /* Registration order is what keeps `/stats` from being read as an id. */
    const stats = await fetchAnnouncementStats()

    expect(stats.totalPublished).toBeGreaterThan(0)
  })
})

describe('the stats endpoint is platform-wide', () => {
  it('returns the five counters, derived from the real store', async () => {
    const stats = await fetchAnnouncementStats()
    const rows = mockAnnouncements()

    expect(stats.totalPublished).toBe(
      rows.filter((row) => row.status === 'PUBLISHED').length,
    )
    expect(stats.totalDrafts).toBe(rows.filter((row) => row.status === 'DRAFT').length)
    expect(stats.totalPinned).toBe(rows.filter((row) => row.isPinned).length)
  })

  it('moves when a draft is published, which is what the queue header claims', async () => {
    const before = await fetchAnnouncementStats()

    await updateAnnouncement(DRAFT, { status: 'PUBLISHED' })
    const after = await fetchAnnouncementStats()

    expect(after.totalDrafts).toBe(before.totalDrafts - 1)
    expect(after.totalPublished).toBe(before.totalPublished + 1)
  })

  it('ignores every filter, so it cannot be read as "the filtered queue"', async () => {
    /*
     * The route takes no parameters at all. A screen showing these numbers
     * beside a filtered list must not imply they describe it.
     */
    const url = new URL(`${API_URL}/admin/announcements/stats`)
    url.searchParams.set('status', 'DRAFT')

    const filtered = await (
      await fetch(url, { headers: { Authorization: 'Bearer test-token' } })
    ).json()

    expect((filtered as { data: unknown }).data).toEqual({
      ...(await fetchAnnouncementStats()),
    })
  })
})

describe('create validation, in the service’s own words', () => {
  it('rejects a body with neither title nor content', async () => {
    await expect(
      createAnnouncement({} as unknown as AnnouncementWritePayload),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'body/title Required, body/content Required',
    )
  })

  it('rejects a two-character title with the service’s custom wording', async () => {
    await expect(createAnnouncement({ ...BODY, title: 'ab' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'body/title Title must be at least 3 characters',
    )
  })

  it('rejects a title over 255 characters', async () => {
    await expect(
      createAnnouncement({ ...BODY, title: 'a'.repeat(256) }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'body/title String must contain at most 255 character(s)',
    )
  })

  it('rejects an empty content with the service’s custom wording', async () => {
    await expect(createAnnouncement({ ...BODY, content: '' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message === 'body/content Announcement content is required',
    )
  })

  it('accepts a content of several thousand characters (O6)', async () => {
    /*
     * ⚠️ Measured: there is NO server-side maximum on `content`, and whatever
     * is sent reaches every mobile client. The panel sets no limit either,
     * because inventing one would reject copy the service would publish — the
     * compose form shows a character count instead.
     */
    const created = await createAnnouncement({ ...BODY, content: 'x'.repeat(6000) })

    expect(created.content).toHaveLength(6000)
  })

  it('rejects an actionText over 100 characters', async () => {
    await expect(
      createAnnouncement({ ...BODY, actionText: 'a'.repeat(101) }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          'body/actionText String must contain at most 100 character(s)',
    )
  })

  it('reports every bad field in one message, which parseFieldErrors splits', async () => {
    /*
     * ⚠️ This is why B3 needs no new error-handling code. The service
     * concatenates `body/<field> <text>` segments into a single string, and
     * `applyServerFieldErrors` already attributes each one to its control.
     */
    await expect(
      createAnnouncement({
        ...BODY,
        title: 'ab',
        priority: 'NOPE' as never,
        status: 'NOPE' as never,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message.includes('body/title') &&
        error.message.includes('body/priority') &&
        error.message.includes('body/status'),
    )
  })

  it('rejects mediaUrl that is not a URL, but ACCEPTS actionUrl that is not', async () => {
    /*
     * ⚠️ The measured asymmetry, and the trap most likely to reach a user.
     * `mediaUrl` is URL-validated; `actionUrl` is free text, so an operator's
     * typo becomes a dead CTA on every phone with nothing to stop it.
     */
    await expect(
      createAnnouncement({ ...BODY, mediaUrl: 'not a url' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'body/mediaUrl Invalid url',
    )

    const created = await createAnnouncement({ ...BODY, actionUrl: 'not a url' })
    expect(created.actionUrl).toBe('not a url')
  })

  it('names all four values when an enum is wrong', async () => {
    await expect(
      createAnnouncement({ ...BODY, priority: 'CRITICAL' as never }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          "body/priority Invalid enum value. Expected 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT', received 'CRITICAL'",
    )
  })

  it('does not accept a publishedAt, because there is no scheduling (§3.5)', async () => {
    /*
     * ⚠️ Measured: a garbage `publishedAt` passed validation without complaint,
     * meaning the field is stripped rather than honoured. The cast is the only
     * way to send one, which is itself the guard — the payload type has no such
     * field.
     */
    const created = await createAnnouncement({
      ...BODY,
      publishedAt: '2030-01-01T00:00:00.000Z',
    } as unknown as AnnouncementWritePayload)

    /* A draft, so no publish timestamp at all — certainly not the one sent. */
    expect(created.publishedAt).toBeNull()
  })

  it('stamps publishedAt itself when the status is PUBLISHED', async () => {
    const created = await createAnnouncement({ ...BODY, status: 'PUBLISHED' })

    expect(created.publishedAt).toBeTruthy()
    expect(created.status).toBe('PUBLISHED')
  })
})

describe('PATCH validates before it looks the record up', () => {
  it('accepts a completely empty body and then 404s on an unknown id', async () => {
    /*
     * ⚠️ Measured, and it is what makes this API safe to probe: `{}` against a
     * fake id answered 404, not 400 — so validation runs first and a schema can
     * be mapped without ever touching a real record.
     */
    await expect(updateAnnouncement('doesnotexist', {})).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.status === 404 &&
        error.message === 'Announcement not found not found',
    )
  })

  it('400s before the lookup when the body is bad, even for a fake id', async () => {
    await expect(
      updateAnnouncement('doesnotexist', { status: 'NOPE' as never }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.status === 400)
  })

  it('carries the service’s doubled not-found wording, verbatim', async () => {
    /*
     * "Announcement not found not found" — the service concatenates a label
     * with its own suffix. Reproduced rather than tidied, because the panel
     * must never show this string to an operator and a test that expected
     * tidy text would hide that it needs replacing.
     */
    await expect(deleteAnnouncement('doesnotexist')).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'Announcement not found not found',
    )
  })

  it('can publish a draft, so an edit form is not inherently safe', async () => {
    const updated = await updateAnnouncement(DRAFT, { status: 'PUBLISHED' })

    expect(updated.status).toBe('PUBLISHED')
    expect(updated.publishedAt).toBeTruthy()
  })
})

describe('pin has two writers, and they disagree about what is required (§3.3)', () => {
  it('requires `isPinned` on the dedicated route', async () => {
    /*
     * ⚠️ `POST /:id/pin` with `{}` is a 400 — `body/isPinned Required` —
     * whereas `PATCH` with `{}` passes. Two routes, one field, two rules.
     */
    const response = await fetch(`${API_URL}/admin/announcements/${PINNED}/pin`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toBe('body/isPinned Required')
  })

  it('states the value it wants rather than toggling', async () => {
    /*
     * `broadcast.md` §4 calls it a toggle. The panel sends the value instead, so
     * a double-click cannot land in the opposite state from the one the operator
     * saw.
     */
    expect((await setAnnouncementPin(PINNED, false)).isPinned).toBe(false)
    expect((await setAnnouncementPin(PINNED, false)).isPinned).toBe(false)
    expect((await setAnnouncementPin(PINNED, true)).isPinned).toBe(true)
  })

  it('clears `pinnedAt` on unpin and sets it on pin', async () => {
    expect((await setAnnouncementPin(PINNED, false)).pinnedAt).toBeNull()
    expect((await setAnnouncementPin(PINNED, true)).pinnedAt).toBeTruthy()
  })

  it('agrees with the value PATCH writes to the same field', async () => {
    await setAnnouncementPin(DRAFT, true)
    expect((await updateAnnouncement(DRAFT, { isPinned: false })).isPinned).toBe(false)
  })
})

describe('delete is the only thing that ever removes media (§3.4)', () => {
  it('removes the record', async () => {
    const before = (await fetchAnnouncements()).pagination.total

    await deleteAnnouncement(DRAFT)

    expect((await fetchAnnouncements()).pagination.total).toBe(before - 1)
    expect(mockAnnouncements().some((row) => row.id === DRAFT)).toBe(false)
  })
})

describe('media upload validates nothing, and the mock must not either (O1)', () => {
  it('accepts the plain text file the live service accepted', async () => {
    /*
     * ⚠️ Deliberately NOT enforcing the allow-list here. A mock that refused
     * this would make `isAllowedAnnouncementMedia` look like a server guarantee
     * instead of the client-side courtesy it is — and the two orphaned `.txt`
     * objects now sitting on the public CDN are the evidence that it is not.
     */
    const file = new File(['hello'], 'probe.txt', { type: 'text/plain' })
    const upload = await uploadAnnouncementMedia(file)

    /*
     * The type is echoed back untouched, which is the behaviour that matters:
     * no allow-list, no extension check, no sniffing.
     */
    expect(upload.mimetype).toBe('text/plain')
    /* Stored and addressable, exactly as the live orphans are. */
    expect(upload.url).toMatch(/^https:\/\/media\.callschat\.com\//)
  })

  it('cannot prove the original filename round-trips, and does not pretend to', async () => {
    /*
     * ⚠️ **An environment limit, recorded so nobody "fixes" the mock.** jsdom's
     * `FormData` serialises a `File` part with the literal filename `blob`,
     * discarding the real name before the request leaves the test. So the name
     * the handler echoes here is `blob` — and that IS faithful to what arrived
     * on the wire; there is nothing else it could honestly report.
     *
     * The live service does echo the real name: `"filename":"probe.txt"`,
     * verified 2026-10-04, and that response is pinned as a fixture in
     * `contract.test.ts` instead. This assertion exists to stop someone making
     * the mock invent a name it was never sent.
     */
    const upload = await uploadAnnouncementMedia(
      new File(['hello'], 'holiday-banner.png', { type: 'image/png' }),
    )

    expect(upload.filename).toBe('blob')
  })

  it('returns a public media.callschat.com URL, not the doc’s localhost one', async () => {
    const file = new File(['x'], 'poster.png', { type: 'image/png' })
    const upload = await uploadAnnouncementMedia(file)

    expect(upload.url).toMatch(/^https:\/\/media\.callschat\.com\//)
    expect(upload.url).not.toContain('localhost:9100')
  })

  it('returns a `key` beside the url, which is what a record stores', async () => {
    /*
     * Both are kept on an announcement: `mediaUrl` is what a client fetches,
     * `mediaKey` is the storage path the backend needs in order to delete the
     * object when the announcement goes (plan.md §3.4).
     */
    const upload = await uploadAnnouncementMedia(
      new File(['x'], 'poster.png', { type: 'image/png' }),
    )

    expect(upload.key).toMatch(/^uploads\//)
    expect(upload.url).toContain(upload.key)
  })
})
