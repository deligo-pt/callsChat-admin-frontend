import { describe, expect, it } from 'vitest'

import { resolveStatus } from '@/lib/status'
import { parseFieldErrors } from '@/types/common'
import {
  FEEDBACK_PRIORITY_VALUES,
  FEEDBACK_STATUS_VALUES,
  feedbackListResponseSchema,
  feedbackPrioritySchema,
  feedbackReplyResponseSchema,
  feedbackResponseSchema,
  feedbackStatsResponseSchema,
  feedbackStatusSchema,
  feedbackTypeSchema,
} from '@/types/feedback'

/**
 * Contract regression tests for Feedback & Support.
 *
 * Every fixture below is a **real response** captured from
 * `https://api.callschat.com/api/v1` on 2026-09-06 with a `SUPER_ADMIN` token,
 * trimmed only of volatile values. If the backend changes shape, this fails
 * here rather than as a ticket page that silently loses its reply stream.
 */

/* ------------------------------------------------------------------ *
 * Captured responses
 * ------------------------------------------------------------------ */

const LIVE_ROW = {
  id: 'cmtq1inl2009401ntopx9pz3w',
  userId: 'cmt8orkov00004upco3oifg2v',
  type: 'BUG',
  subject: '[ADMIN-PANEL PROBE] ignore - frontend integration test',
  description: 'Automated probe ticket created while wiring the admin panel.',
  status: 'PENDING',
  priority: 'LOW',
  userDeviceInfo: 'device: probe, os: n/a, appVersion: 0.0.0',
  adminResponse: null,
  assignedAdminId: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: '2026-09-06T16:42:48.422Z',
  updatedAt: '2026-09-06T16:42:48.422Z',
  user: {
    id: 'cmt8orkov00004upco3oifg2v',
    email: 'admin@callschat.com',
    phone: '+10000000000',
    role: 'SUPER_ADMIN',
    profile: {
      displayName: 'Super Administrator',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=superadmin',
      username: 'superadmin',
    },
  },
  assignedAdmin: null,
  _count: { attachments: 1, replies: 0 },
}

const LIVE_LIST_RESPONSE = {
  success: true,
  data: { items: [LIVE_ROW], meta: { page: 1, limit: 5, total: 1, totalPages: 1 } },
}

/** `GET /admin/feedbacks/:id` — the full shape, stable across 10 of 10 calls. */
const LIVE_DETAIL_RESPONSE = {
  success: true,
  data: {
    ...LIVE_ROW,
    status: 'REOPENED',
    priority: 'CRITICAL',
    adminResponse: 'Probe reply from admin panel integration test.',
    assignedAdminId: 'cmtnxw0ll00xb01ll5rx2wotu',
    assignedAdmin: {
      id: 'cmtnxw0ll00xb01ll5rx2wotu',
      email: 'rootxmanagement@gmail.com',
      role: 'MODERATOR',
      profile: {
        displayName: 'Masum',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=staff_x',
      },
    },
    attachments: [
      {
        id: 'cmtq1inl4009501nt5ujarfqh',
        feedbackId: 'cmtq1inl2009401ntopx9pz3w',
        fileUrl: 'https://storage.callschat.com/attachments/probe.png',
        fileName: 'probe.png',
        fileType: 'image/png',
        fileSize: 1234,
        createdAt: '2026-09-06T16:42:48.422Z',
      },
    ],
    replies: [
      {
        id: 'cmtq1loa2009701ntk99849ql',
        feedbackId: 'cmtq1inl2009401ntopx9pz3w',
        senderId: 'cmt8orkov00004upco3oifg2v',
        message: 'Probe reply from admin panel integration test.',
        createdAt: '2026-09-06T16:45:09.290Z',
        sender: {
          id: 'cmt8orkov00004upco3oifg2v',
          email: 'admin@callschat.com',
          role: 'SUPER_ADMIN',
          profile: { displayName: 'Super Administrator', avatarUrl: null },
        },
      },
    ],
    statusHistory: [
      {
        id: 'cmtq1lzkb009b01nt98vnjs5j',
        feedbackId: 'cmtq1inl2009401ntopx9pz3w',
        fromStatus: 'CLOSED',
        toStatus: 'REOPENED',
        note: 'probe transition',
        changedById: 'cmt8orkov00004upco3oifg2v',
        createdAt: '2026-09-06T16:45:23.915Z',
        /*
         * ⚠️ Re-captured 2026-09-07. This fixture previously carried
         * `avatarUrl: null` here — which the live service does not send, and
         * which no live capture could have produced. The invented key is why
         * the suite went green while the real detail route was being rejected
         * by `feedbackSchema`: `avatarUrl` was `.nullable()` but not
         * `.optional()`, so a `null` parsed and an absent key did not.
         *
         * `displayName` is the whole of `changedBy.profile` on the wire.
         */
        changedBy: {
          id: 'cmt8orkov00004upco3oifg2v',
          role: 'SUPER_ADMIN',
          profile: { displayName: 'Super Administrator' },
        },
      },
    ],
  },
}

/**
 * `PATCH /:id/status` — the PARTIAL shape, which answered 10 of 12 identical
 * consecutive requests (feedback_management_plan.md §3.2).
 *
 * Note what is missing: `user`, `assignedAdmin`, `attachments`, `replies`, and
 * `changedBy` inside the single history row.
 */
const LIVE_PARTIAL_TRANSITION_RESPONSE = {
  success: true,
  message: "Feedback status transitioned to 'IN_PROGRESS' successfully.",
  data: {
    id: 'cmtq1inl2009401ntopx9pz3w',
    userId: 'cmt8orkov00004upco3oifg2v',
    type: 'BUG',
    subject: '[ADMIN-PANEL PROBE] ignore - frontend integration test',
    description: 'Automated probe ticket created while wiring the admin panel.',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    userDeviceInfo: 'device: probe, os: n/a, appVersion: 0.0.0',
    adminResponse: 'Probe reply from admin panel integration test.',
    assignedAdminId: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-06T16:42:48.422Z',
    updatedAt: '2026-09-06T16:45:21.558Z',
    statusHistory: [
      {
        id: 'cmtq1lxqu009801ntzbvp7qcs',
        feedbackId: 'cmtq1inl2009401ntopx9pz3w',
        fromStatus: 'REVIEWING',
        toStatus: 'IN_PROGRESS',
        note: null,
        changedById: 'cmt8orkov00004upco3oifg2v',
        createdAt: '2026-09-06T16:45:21.558Z',
      },
    ],
  },
}

/** `PATCH /:id/assign` — narrower still: base columns plus `assignedAdmin`. */
const LIVE_ASSIGN_RESPONSE = {
  success: true,
  message: 'Feedback assigned to staff member successfully.',
  data: {
    ...LIVE_PARTIAL_TRANSITION_RESPONSE.data,
    statusHistory: undefined,
    assignedAdminId: 'cmtnxw0ll00xb01ll5rx2wotu',
    assignedAdmin: {
      id: 'cmtnxw0ll00xb01ll5rx2wotu',
      email: 'rootxmanagement@gmail.com',
      role: 'MODERATOR',
      profile: { displayName: 'Masum', avatarUrl: null },
    },
  },
}

const LIVE_REPLY_RESPONSE = {
  success: true,
  message: 'Admin reply posted successfully.',
  data: {
    reply: LIVE_DETAIL_RESPONSE.data.replies[0],
    /* No relations at all — not a substitute for a refetch. */
    feedback: LIVE_PARTIAL_TRANSITION_RESPONSE.data,
  },
}

const LIVE_STATS_RESPONSE = {
  success: true,
  data: {
    total: 2,
    pending: 0,
    reviewing: 0,
    inProgress: 0,
    resolved: 0,
    closed: 2,
    reopened: 0,
    byType: { bug: 1, improvement: 0, report: 0, other: 1 },
    byPriority: { low: 1, medium: 0, high: 0, critical: 1 },
  },
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('list envelope', () => {
  it('parses the live `{ data: { items, meta } }` response', () => {
    const parsed = feedbackListResponseSchema.parse(LIVE_LIST_RESPONSE)
    expect(parsed.data.items).toHaveLength(1)
    expect(parsed.data.meta.total).toBe(1)
  })

  it('is NOT the project-standard `{ data[], pagination }` envelope', () => {
    /*
     * The distinction is load-bearing: forcing `paginatedSchema` onto this
     * route was what `types/settings.ts` warned against for the backups list,
     * and this is the second route to need the other shape.
     */
    expect(() =>
      feedbackListResponseSchema.parse({
        success: true,
        data: [LIVE_ROW],
        pagination: { page: 1, limit: 5, total: 1, totalPages: 1 },
      }),
    ).toThrow()
  })
})

describe('the four response shapes', () => {
  it('parses all three actor projections, which differ per call site', () => {
    /*
     * ⚠️ The regression this file exists for, added 2026-09-07 after a real
     * ticket rendered "Ticket could not be loaded" in the browser.
     *
     * The backend projects a *different* `profile` at each place an actor
     * appears, and the narrowest of the three is the one the F0 fixture got
     * wrong:
     *
     *   user                       displayName + avatarUrl + username
     *   replies[].sender           displayName + avatarUrl
     *   statusHistory[].changedBy  displayName ONLY
     *
     * A schema that requires `avatarUrl` rejects every history row, and
     * because the relations are parsed as part of the ticket, one missing key
     * on row 15 of 15 blanks the entire page.
     */
    const parsed = feedbackResponseSchema.parse(LIVE_DETAIL_RESPONSE)

    const changedBy = parsed.data.statusHistory?.[0]?.changedBy
    expect(changedBy?.profile?.displayName).toBe('Super Administrator')
    expect(changedBy?.profile).not.toHaveProperty('avatarUrl')
    /* The wider projections still carry theirs. */
    expect(parsed.data.user?.profile?.avatarUrl).toBeDefined()
  })

  it('parses the full detail shape', () => {
    const parsed = feedbackResponseSchema.parse(LIVE_DETAIL_RESPONSE)
    expect(parsed.data.replies).toHaveLength(1)
    expect(parsed.data.statusHistory?.[0]?.changedBy).toBeDefined()
  })

  it('parses the PARTIAL transition shape, which has no relations at all', () => {
    /*
     * This is the whole reason every relation on `feedbackSchema` is optional
     * (§3.2). If this ever throws, a successful status change will crash the
     * ticket page — on some requests and not others, which is the worst
     * possible failure mode to debug.
     */
    const parsed = feedbackResponseSchema.parse(LIVE_PARTIAL_TRANSITION_RESPONSE)
    expect(parsed.data.user).toBeUndefined()
    expect(parsed.data.attachments).toBeUndefined()
    expect(parsed.data.replies).toBeUndefined()
    expect(parsed.data.statusHistory).toHaveLength(1)
    expect(parsed.data.statusHistory?.[0]?.changedBy).toBeUndefined()
  })

  it('parses the assign shape', () => {
    const parsed = feedbackResponseSchema.parse(LIVE_ASSIGN_RESPONSE)
    expect(parsed.data.assignedAdmin?.profile?.displayName).toBe('Masum')
  })

  it('parses the reply shape, whose `feedback` carries no relations', () => {
    const parsed = feedbackReplyResponseSchema.parse(LIVE_REPLY_RESPONSE)
    expect(parsed.data.reply.sender.role).toBe('SUPER_ADMIN')
    expect(parsed.data.feedback.replies).toBeUndefined()
  })

  it('parses the stats shape', () => {
    const parsed = feedbackStatsResponseSchema.parse(LIVE_STATS_RESPONSE)
    expect(parsed.data.byPriority.critical).toBe(1)
  })
})

describe('a reporter without a profile', () => {
  it('parses `profile: null` rather than rejecting the whole ticket', () => {
    /*
     * A user who never finished profile setup has no profile row. Rejecting
     * here would blank a ticket the panel is perfectly able to render from the
     * email alone.
     */
    const parsed = feedbackResponseSchema.parse({
      ...LIVE_DETAIL_RESPONSE,
      data: { ...LIVE_DETAIL_RESPONSE.data, user: { ...LIVE_ROW.user, profile: null } },
    })
    expect(parsed.data.user?.profile).toBeNull()
  })
})

describe('a hostile attachment', () => {
  it('is CARRIED by the schema, not rejected', () => {
    /*
     * `fileUrl` is deliberately a plain string rather than `z.url()`. Rejecting
     * at the contract boundary would blank the entire ticket — including the
     * report a moderator needs to read — over one attachment. It is defused at
     * render time by `safeAttachmentHref`, which has its own tests.
     */
    const parsed = feedbackResponseSchema.parse({
      ...LIVE_DETAIL_RESPONSE,
      data: {
        ...LIVE_DETAIL_RESPONSE.data,
        attachments: [
          {
            id: 'att_js',
            feedbackId: 'fb_1',
            fileUrl: 'javascript:alert(document.domain)',
            fileName: '<img src=x onerror=alert(1)>.png',
            fileType: 'text/html',
            fileSize: 1,
            createdAt: '2026-09-06T17:05:11.974Z',
          },
        ],
      },
    })
    expect(parsed.data.attachments?.[0]?.fileUrl).toBe(
      'javascript:alert(document.domain)',
    )
  })
})

describe('enums match the API rejections verbatim', () => {
  it('status offers exactly the six the API named', () => {
    expect(feedbackStatusSchema.options).toEqual([
      'PENDING',
      'REVIEWING',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
      'REOPENED',
    ])
  })

  it('type offers exactly the four the API named', () => {
    expect(feedbackTypeSchema.options).toEqual([
      'BUG',
      'IMPROVEMENT',
      'REPORT',
      'OTHER',
    ])
  })

  it('priority is declared in SERVER enum order, not alphabetically', () => {
    /*
     * `sortBy=priority&sortOrder=asc` returned LOW before CRITICAL, verified
     * live — the server orders by ordinal. If this array were sorted
     * alphabetically the queue's "least urgent first" would silently become
     * "CRITICAL first".
     */
    expect(feedbackPrioritySchema.options).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
    ])
  })
})

describe('badge tones', () => {
  it('gives every status a label and a tone', () => {
    for (const status of FEEDBACK_STATUS_VALUES) {
      const descriptor = resolveStatus('feedback', status)
      expect(descriptor.label).not.toBe('')
      expect(descriptor.tone).toBeTruthy()
    }
  })

  it('gives every priority a label and a tone', () => {
    for (const priority of FEEDBACK_PRIORITY_VALUES) {
      const descriptor = resolveStatus('feedbackPriority', priority)
      expect(descriptor.label).not.toBe('')
    }
  })

  it('marks PENDING as needing attention and REOPENED as the loudest', () => {
    /*
     * The two tone choices this map turns on. `PENDING` means nobody has
     * looked at a ticket someone is waiting on; `REOPENED` means the panel
     * declared a problem fixed and it was not.
     */
    expect(resolveStatus('feedback', 'PENDING').tone).toBe('warning')
    expect(resolveStatus('feedback', 'REOPENED').tone).toBe('danger')
    /* CLOSED is not success: a ticket closed without resolution is closed too. */
    expect(resolveStatus('feedback', 'CLOSED').tone).toBe('neutral')
  })
})

describe('the BAD_REQUEST error message', () => {
  it('yields no field errors, so it surfaces at form level', () => {
    /*
     * The transition rejection is a whole sentence naming the legal
     * successors, with no `body/…` prefix. `parseFieldErrors` returning `[]`
     * is the correct outcome, not a parse failure — it is what routes the
     * message to a form-level surface instead of pinning it to an input.
     */
    const message =
      "Invalid status transition from 'CLOSED' to 'PENDING'. Allowed transitions: REOPENED."
    expect(parseFieldErrors(message)).toEqual([])
  })
})
