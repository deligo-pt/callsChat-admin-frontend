import { describe, expect, it } from 'vitest'

import {
  announcementListResponseSchema,
  announcementSchema,
  announcementStatsResponseSchema,
  announcementStatsSchema,
  ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH,
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_MEDIA_TYPE_VALUES,
  ANNOUNCEMENT_PRIORITY_VALUES,
  ANNOUNCEMENT_STATUS_VALUES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MIN_LENGTH,
  announcementMediaTypeFor,
  isAllowedAnnouncementMedia,
  mediaUploadResponseSchema,
} from '@/types/announcement'

/**
 * The contract, against what the live service actually said on **2026-10-04**
 * (plan.md §2).
 *
 * ⚠️ **This file is split in two on purpose, and the split matters more here
 * than in any other module.** Two kinds of fact live below:
 *
 * - **Measured.** The enums, the limits, the stats object, the list envelope
 *   and the media-upload response are quoted from the service's own validation
 *   rejections and responses. Those assertions are strict, and a change to any
 *   of them should fail loudly.
 * - **Inferred.** The *row* has never been observed — the live table holds zero
 *   announcements and creating a disposable draft was refused as a
 *   shared-resource write. So the row tests assert **tolerance**, not shape:
 *   they prove the schema survives a payload missing any given field, because
 *   the one thing we know is that we do not know what comes back.
 *
 * Every other contract test in this repo asserts against a captured live
 * payload. This one cannot, and says so rather than pretending otherwise.
 * plan.md O5 is what closes the gap.
 */

/** `GET /admin/announcements?page=1&limit=20`, verbatim, on the empty table. */
const LIVE_EMPTY_LIST = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
}

/** `GET /admin/announcements/stats`, verbatim. */
const LIVE_STATS = {
  success: true,
  data: {
    totalPublished: 0,
    totalDrafts: 0,
    totalImpressions: 0,
    totalPinned: 0,
    totalReadReceipts: 0,
  },
}

/** `POST /api/v1/media/upload`, verbatim — including the `.txt` it should not have taken. */
const LIVE_UPLOAD = {
  success: true,
  data: {
    url: 'https://media.callschat.com/calls-chat-media/uploads/bd3cddf5-d82c-495b-8247-3204f5e75d2a.txt',
    key: 'uploads/bd3cddf5-d82c-495b-8247-3204f5e75d2a.txt',
    filename: 'probe.txt',
    mimetype: 'text/plain',
  },
}

/**
 * A row as `broadcast.md` §3.1 describes it.
 *
 * ⚠️ **Not a captured payload.** §3.1 documents the *client feed* response, and
 * the admin list's projection is unknown. Used only to prove the schema accepts
 * the documented shape, never to prove the service sends it.
 */
const DOC_ROW = {
  id: 'cm8xyz1230001',
  title: 'Important Security Update',
  content: 'Please verify your active login sessions under Settings > Security.',
  priority: 'URGENT',
  status: 'PUBLISHED',
  targetAudience: 'ALL',
  isPinned: true,
  pinnedAt: '2026-10-04T08:15:00.000Z',
  mediaUrl: 'https://media.callschat.com/calls-chat-media/uploads/abc.webp',
  mediaKey: 'uploads/abc.webp',
  mediaType: 'IMAGE',
  mediaThumbnailUrl: null,
  mediaDuration: null,
  mediaSize: 245_100,
  actionText: 'Check Sessions',
  actionUrl: '/settings/sessions',
  isEncrypted: false,
  encryptedPayload: null,
  authorId: 'cmtyadmin001',
  author: {
    id: 'cmtyadmin001',
    profile: { displayName: 'CallsChat Security Team', avatarUrl: 'https://x/y.png' },
  },
  viewsCount: 1420,
  isRead: false,
  publishedAt: '2026-10-04T08:15:00.000Z',
  createdAt: '2026-10-04T08:10:00.000Z',
  updatedAt: '2026-10-04T08:15:00.000Z',
}

describe('the vocabularies, quoted from the service’s rejections (§2.2)', () => {
  it('carries the four priorities, in the order the service lists them', () => {
    expect(ANNOUNCEMENT_PRIORITY_VALUES).toEqual(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  })

  it('carries three statuses, and no scheduled state (§3.5)', () => {
    /*
     * ⚠️ The whole point of this assertion. `publishedAt` is not in the write
     * schema, so there is nothing to schedule — an announcement is a draft or it
     * is live now. A fourth value appearing here would mean the backend grew
     * scheduling and the compose form is lying by omission.
     */
    expect(ANNOUNCEMENT_STATUS_VALUES).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  })

  it('carries three audiences, which segment by account mode only', () => {
    expect(ANNOUNCEMENT_AUDIENCE_VALUES).toEqual(['ALL', 'PERSONAL', 'BUSINESS'])
  })

  it('carries two media types', () => {
    expect(ANNOUNCEMENT_MEDIA_TYPE_VALUES).toEqual(['IMAGE', 'VIDEO'])
  })

  it('rejects the seven-value status enum that used to live in types/ops.ts', () => {
    /*
     * ⚠️ This is the guard over §3.1's demolition. `SCHEDULED`, `QUEUED`,
     * `SENT_TO_PROVIDER`, `DELIVERED`, `FAILED` and `EXPIRED` were in this
     * codebase for six weeks, describing an API that did not exist. If any of
     * them ever parses as a *write* value again, the fiction has come back.
     */
    for (const invented of [
      'SCHEDULED',
      'QUEUED',
      'SENT_TO_PROVIDER',
      'DELIVERED',
      'FAILED',
      'EXPIRED',
    ]) {
      expect((ANNOUNCEMENT_STATUS_VALUES as readonly string[]).includes(invented)).toBe(
        false,
      )
    }
  })

  it('rejects the four-value audience enum it shipped with', () => {
    for (const invented of ['ALL_USERS', 'HOSTS_ONLY', 'EXPLICIT_IDS', 'BY_STATUS']) {
      expect(
        (ANNOUNCEMENT_AUDIENCE_VALUES as readonly string[]).includes(invented),
      ).toBe(false)
    }
  })
})

describe('the field limits, quoted from the service (§2.2)', () => {
  it('matches "Title must be at least 3 characters"', () => {
    expect(ANNOUNCEMENT_TITLE_MIN_LENGTH).toBe(3)
  })

  it('matches "String must contain at most 255 character(s)"', () => {
    expect(ANNOUNCEMENT_TITLE_MAX_LENGTH).toBe(255)
  })

  it('matches actionText’s at-most-100', () => {
    expect(ANNOUNCEMENT_ACTION_TEXT_MAX_LENGTH).toBe(100)
  })
})

describe('the list envelope is the FIRST of three (§2.1)', () => {
  it('parses `{ success, data: [], pagination }`', () => {
    const parsed = announcementListResponseSchema.parse(LIVE_EMPTY_LIST)

    expect(parsed.data).toEqual([])
    expect(parsed.pagination.limit).toBe(20)
    expect(parsed.pagination.totalPages).toBe(0)
  })

  it('rejects the two OTHER envelope shapes this backend also ships', () => {
    /*
     * Three mutually incompatible list shapes exist on this one service, with
     * no rule to derive which a route uses. If either of these parses, the
     * schema has been loosened into something that cannot tell them apart —
     * and the queue would render zero rows from a response that had four.
     */
    expect(
      announcementListResponseSchema.safeParse({
        success: true,
        data: {
          items: [DOC_ROW],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      }).success,
    ).toBe(false)

    expect(
      announcementListResponseSchema.safeParse({
        success: true,
        data: { total: 1, page: 1, limit: 20, totalPages: 1, requests: [DOC_ROW] },
      }).success,
    ).toBe(false)
  })

  it('accepts an echoed out-of-range page rather than calling it a violation', () => {
    /*
     * ⚠️ Measured: `?page=99` answers 200 with `page: 99`, `totalPages: 0` and
     * no rows. A clamped schema would turn a navigable empty state into
     * "Something went wrong".
     */
    const parsed = announcementListResponseSchema.parse({
      success: true,
      data: [],
      pagination: { page: 99, limit: 20, total: 0, totalPages: 0 },
    })

    expect(parsed.pagination.page).toBe(99)
  })
})

describe('the stats object is measured, so it is strict (§2.1)', () => {
  it('parses the five counters verbatim', () => {
    expect(announcementStatsResponseSchema.parse(LIVE_STATS).data).toEqual({
      totalPublished: 0,
      totalDrafts: 0,
      totalImpressions: 0,
      totalPinned: 0,
      totalReadReceipts: 0,
    })
  })

  it('fails loudly if a counter goes missing', () => {
    /*
     * Deliberately NOT tolerant, unlike the row. These five keys came back from
     * the live service by name, so an absence is a real contract change and
     * should break rather than render a blank tile.
     */
    expect(
      announcementStatsSchema.safeParse({
        totalPublished: 0,
        totalDrafts: 0,
        totalImpressions: 0,
        totalPinned: 0,
      }).success,
    ).toBe(false)
  })

  it('rejects a float, because impressions are counted not measured', () => {
    expect(
      announcementStatsSchema.safeParse({ ...LIVE_STATS.data, totalImpressions: 1.5 })
        .success,
    ).toBe(false)
  })
})

describe('the row is INFERRED, so the schema asserts tolerance (§B1)', () => {
  it('parses the shape broadcast.md §3.1 documents', () => {
    const parsed = announcementSchema.parse(DOC_ROW)

    expect(parsed.title).toBe('Important Security Update')
    expect(parsed.author?.profile?.displayName).toBe('CallsChat Security Team')
    expect(parsed.viewsCount).toBe(1420)
  })

  it('needs only id, title and content — the three a record cannot lack', () => {
    /*
     * `title` and `content` are the two REQUIRED fields on the write route, so
     * no record can exist without them. Everything else is inference, and the
     * schema treats it that way.
     */
    const parsed = announcementSchema.parse({
      id: 'cm8xyz1230001',
      title: 'Bare minimum',
      content: 'Still a record.',
    })

    expect(parsed.status).toBeUndefined()
    expect(parsed.isPinned).toBeUndefined()
  })

  it('survives any single documented field being absent', () => {
    /*
     * ⚠️ The most valuable test in this file. The feedback ticket page was taken
     * out by a key that was `.nullable()` but not `.optional()`, which rejected
     * an entire response over one missing field. Since NOBODY has seen an
     * announcement row, every optional field here is a guess — so the guard is
     * that no single guess being wrong can blank the queue.
     */
    for (const key of Object.keys(DOC_ROW)) {
      if (key === 'id' || key === 'title' || key === 'content') continue

      const withoutKey = Object.fromEntries(
        Object.entries(DOC_ROW).filter(([name]) => name !== key),
      )

      expect(
        announcementSchema.safeParse(withoutKey).success,
        `a row with no \`${key}\` must still parse`,
      ).toBe(true)
    }
  })

  it('survives any single documented field being null', () => {
    for (const key of Object.keys(DOC_ROW)) {
      if (key === 'id' || key === 'title' || key === 'content') continue

      expect(
        announcementSchema.safeParse({ ...DOC_ROW, [key]: null }).success,
        `a row whose \`${key}\` is null must still parse`,
      ).toBe(true)
    }
  })

  it('tolerates a status, priority or audience it has never heard of', () => {
    /*
     * Read-tolerant, write-strict — the same asymmetry `errorCodeSchema` and
     * `verificationRejectionCodeSchema` use. A value added by a backend
     * migration must degrade to a humanised label, not blank the queue.
     */
    const parsed = announcementSchema.parse({
      ...DOC_ROW,
      status: 'SOMETHING_NEW',
      priority: 'CRITICAL',
      targetAudience: 'ENTERPRISE',
    })

    expect(parsed.status).toBe('SOMETHING_NEW')
    expect(parsed.priority).toBe('CRITICAL')
    expect(parsed.targetAudience).toBe('ENTERPRISE')
  })

  it('does NOT validate actionUrl, because the service does not either', () => {
    /*
     * ⚠️ Measured asymmetry: `"not a url"` was refused on `mediaUrl` and
     * accepted on `actionUrl`. A schema that rejected it would hide the record
     * whose CTA is broken on every phone — which is the one an operator needs
     * to find.
     */
    const parsed = announcementSchema.parse({ ...DOC_ROW, actionUrl: 'coming soon' })

    expect(parsed.actionUrl).toBe('coming soon')
  })

  it('does not validate a stored mediaUrl either', () => {
    expect(
      announcementSchema.safeParse({ ...DOC_ROW, mediaUrl: 'not a url' }).success,
    ).toBe(true)
  })

  it('tolerates an author with no profile, and no author at all', () => {
    expect(
      announcementSchema.parse({ ...DOC_ROW, author: { id: 'x', profile: null } })
        .author?.profile,
    ).toBeNull()

    expect(
      announcementSchema.parse({ ...DOC_ROW, author: null, authorId: null }).authorId,
    ).toBeNull()
  })
})

describe('the media upload response is measured, so it is strict (§2.5)', () => {
  it('parses the live response, including the .txt it should have refused', () => {
    /*
     * ⚠️ This fixture is evidence of plan.md O1: the service accepted a plain
     * text file, stored it, and served it back from a public host. The panel
     * validates because the server will not.
     */
    const parsed = mediaUploadResponseSchema.parse(LIVE_UPLOAD)

    expect(parsed.data.mimetype).toBe('text/plain')
    expect(parsed.data.url).toContain('media.callschat.com')
  })

  it('rejects the doc’s localhost URL shape only if it is not a URL', () => {
    /* `localhost:9100` IS a valid URL; what the doc gets wrong is the host. */
    expect(
      mediaUploadResponseSchema.safeParse({
        success: true,
        data: {
          url: 'http://localhost:9100/calls-chat-media/uploads/uuid.webp',
          key: 'uploads/uuid.webp',
          filename: 'screenshot.webp',
          mimetype: 'image/webp',
        },
      }).success,
    ).toBe(true)

    expect(
      mediaUploadResponseSchema.safeParse({
        success: true,
        data: { ...LIVE_UPLOAD.data, url: 'uploads/relative.png' },
      }).success,
    ).toBe(false)
  })
})

describe('the client-side media gate, which is ours and not the server’s (§3.4)', () => {
  it('maps the documented image and video types', () => {
    expect(announcementMediaTypeFor('image/png')).toBe('IMAGE')
    expect(announcementMediaTypeFor('image/webp')).toBe('IMAGE')
    expect(announcementMediaTypeFor('video/mp4')).toBe('VIDEO')
    expect(announcementMediaTypeFor('video/webm')).toBe('VIDEO')
  })

  it('refuses the text file the live service happily stored', () => {
    const verdict = isAllowedAnnouncementMedia({ type: 'text/plain', size: 5 })

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.reason).toBe('UNSUPPORTED_TYPE')
  })

  it('refuses a PDF, which no mobile renderer in broadcast.md §5.2 can show', () => {
    expect(isAllowedAnnouncementMedia({ type: 'application/pdf', size: 1000 }).ok).toBe(
      false,
    )
  })

  it('refuses an oversized image but allows the same size as a video', () => {
    const tenMegabytes = 10 * 1024 * 1024

    const asImage = isAllowedAnnouncementMedia({
      type: 'image/png',
      size: tenMegabytes,
    })
    expect(asImage.ok).toBe(false)
    expect(asImage.ok === false && asImage.reason).toBe('TOO_LARGE')

    expect(
      isAllowedAnnouncementMedia({ type: 'video/mp4', size: tenMegabytes }).ok,
    ).toBe(true)
  })

  it('returns the resolved mediaType so a caller cannot forget to send it', () => {
    /*
     * The server accepts media with no `mediaType`, and a mobile client then has
     * no idea whether to open a lightbox or a video player. Handing the value
     * back from the gate is what stops that being possible.
     */
    const verdict = isAllowedAnnouncementMedia({ type: 'video/webm', size: 1024 })

    expect(verdict.ok === true && verdict.mediaType).toBe('VIDEO')
  })
})
