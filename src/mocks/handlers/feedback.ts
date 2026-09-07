import { http, HttpResponse } from 'msw'

import {
  FEEDBACK_PRIORITY_VALUES,
  FEEDBACK_STATUS_VALUES,
  FEEDBACK_TYPE_VALUES,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
} from '@/types/feedback'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

/**
 * Mock Feedback & Support backend.
 *
 * Every rejection below was observed on the live API on 2026-09-06 and is
 * reproduced verbatim, message included. The rule from `staff.ts` applies with
 * full force: **a mock laxer than the service tests nothing.**
 *
 * Most of the traps in feedback_management_plan.md §3 are invisible from a
 * success response — they are shapes, silent overwrites and ignored filters. A
 * permissive mock answers 200 to all of them, the suite goes green, and the
 * defect ships. So this handler is deliberately as hostile as the real service,
 * **including its bugs**:
 *
 *   - `PATCH /:id/status` alternates between the FULL and the PARTIAL response
 *     shape, exactly as two backend builds behind one nginx do (§3.2)
 *   - `POST /:id/reply` silently overwrites `adminResponse` (§3.3)
 *   - a same-status transition is ACCEPTED and writes a junk history row (§3.4)
 *   - `PATCH /:id` also accepts `status` and `assignedAdminId` (§3.5)
 *   - `assignedAdminId=null` matches the literal string, so nothing is
 *     unassignable-filterable (§3.6)
 *   - `fromDate=notadate` is accepted and the filter silently dropped (§3.7)
 *   - `total: 0` still reports `totalPages: 1`, and `page` is echoed beyond
 *     range rather than clamped (§3.8)
 *   - attachments carry whatever string the user submitted, `javascript:`
 *     included (§3.9)
 *   - there is no DELETE route at all (§3.10)
 *   - the 404 message really is doubled: "…not found. not found"
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const

/* ------------------------------------------------------------------ *
 * Acting-role switch
 * ------------------------------------------------------------------ */

/**
 * Which role the mock treats the caller as.
 *
 * Defaults to `SUPER_ADMIN` because — per §3.1 — that is the only role for
 * which this module does anything at all. `FEEDBACK_MANAGEMENT` cannot be
 * granted, so `ADMIN` here means "an admin with no path to the permission",
 * which is every admin.
 */
type ActingRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR'

let actingRole: ActingRole = 'SUPER_ADMIN'

export const mockFeedbackActingRole = {
  get: (): ActingRole => actingRole,
  set: (role: ActingRole): void => {
    actingRole = role
  },
}

declare global {
  var __mockFeedbackActingRole: typeof mockFeedbackActingRole | undefined
}

globalThis.__mockFeedbackActingRole = mockFeedbackActingRole

/**
 * The module-gated 403.
 *
 * Distinct wording from the staff module's role-gated one, and the difference
 * matters to the UI: this message names a permission, which reads as something
 * a Super Admin could grant — while in fact they cannot (§3.1).
 */
function requireFeedbackPermission(): Response | null {
  if (actingRole === 'SUPER_ADMIN') return null
  return errorResponse(
    403,
    'FORBIDDEN',
    "Access Denied: Missing required module permission 'FEEDBACK_MANAGEMENT'",
  )
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const STATE_KEY = 'callschat.mock.feedback'

interface MockActor {
  id: string
  email: string
  phone?: string | null
  role: string
  profile: {
    displayName: string
    username?: string
    /**
     * ⚠️ Optional, because the live service omits it on `changedBy`.
     *
     * The backend selects a different, narrower projection at each of the
     * three places an actor appears: `user` carries `displayName`,
     * `avatarUrl` and `username`; `replies[].sender` carries the first two;
     * `statusHistory[].changedBy` carries **only `displayName`**. Verified on
     * a real ticket 2026-09-07 — see `HISTORY_ACTOR` below.
     */
    avatarUrl?: string | null
  } | null
}

interface MockAttachment {
  id: string
  feedbackId: string
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
  createdAt: string
}

interface MockReply {
  id: string
  feedbackId: string
  senderId: string
  message: string
  createdAt: string
  sender: MockActor
}

/**
 * The actor shape a history row actually carries: **no `avatarUrl`, and no
 * `email`** (feedback_management_plan.md §2.2).
 *
 * Typed separately from `MockActor` rather than reusing it, because reusing it
 * is exactly the mistake that hid the defect: the mock handed `changedBy` a
 * full actor with `avatarUrl: null`, every test passed against a shape the API
 * has never sent, and the first real ticket with an expanded history failed
 * contract validation and rendered an error page instead.
 */
type MockHistoryActor = Omit<MockActor, 'email' | 'profile'> & {
  profile: { displayName: string } | null
}

interface MockHistory {
  id: string
  feedbackId: string
  fromStatus: FeedbackStatus
  toStatus: FeedbackStatus
  note: string | null
  changedById: string
  createdAt: string
  changedBy: MockHistoryActor
}

interface MockTicket {
  id: string
  userId: string
  type: FeedbackType
  subject: string
  description: string
  status: FeedbackStatus
  priority: FeedbackPriority
  userDeviceInfo: string | null
  adminResponse: string | null
  assignedAdminId: string | null
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  user: MockActor
  attachments: MockAttachment[]
  replies: MockReply[]
  statusHistory: MockHistory[]
}

const SUPER_ADMIN: MockActor = {
  id: 'cmt8orkov00004upco3oifg2v',
  email: 'admin@callschat.com',
  role: 'SUPER_ADMIN',
  profile: { displayName: 'Super Administrator', avatarUrl: null },
}

/**
 * The same person as `SUPER_ADMIN`, in the shape a **history row** carries.
 *
 * `displayName` and nothing else — no `email`, no `avatarUrl`. This is the
 * live projection, captured 2026-09-07 from a ticket with fifteen expanded
 * history rows, and the mock must send it verbatim or the suite goes on
 * passing against a fiction.
 */
const HISTORY_ACTOR: MockHistoryActor = {
  id: SUPER_ADMIN.id,
  role: SUPER_ADMIN.role,
  profile: { displayName: 'Super Administrator' },
}

/**
 * Staff who can be assigned.
 *
 * Ids match the seed in `staff.ts` so the assignment picker and the staff
 * directory agree — `useAssignableStaff` reads the staff list, and a ticket
 * assigned to an id that directory has never heard of would render as a blank
 * name rather than exercising anything.
 */
const ASSIGNABLE: Readonly<Record<string, MockActor>> = {
  stf_sarah: {
    id: 'stf_sarah',
    email: 'sarah.connor@callschat.com',
    role: 'MODERATOR',
    profile: { displayName: 'Sarah Connor', avatarUrl: null },
  },
  stf_marcus: {
    id: 'stf_marcus',
    email: 'marcus.webb@callschat.com',
    role: 'ADMIN',
    profile: { displayName: 'Marcus Webb', avatarUrl: null },
  },
  /* SUSPENDED in the staff seed — assigning to them must be refused. */
  stf_priya: {
    id: 'stf_priya',
    email: 'priya.raman@callschat.com',
    role: 'MODERATOR',
    profile: { displayName: 'Priya Raman', avatarUrl: null },
  },
}

/** Which of the above the API will actually accept, per the staff seed. */
const ACTIVE_STAFF = new Set(['stf_sarah', 'stf_marcus'])

function reporter(
  id: string,
  email: string,
  displayName: string | null,
  username?: string,
): MockActor {
  return {
    id,
    email,
    phone: null,
    role: 'USER',
    profile:
      displayName === null
        ? null
        : { displayName, avatarUrl: null, ...(username ? { username } : {}) },
  }
}

/**
 * A 420-character run with no spaces in it.
 *
 * Real bug reports contain pasted stack traces and base64 blobs, and a flex
 * item does not shrink below its min-content width — which for an unbroken run
 * is the whole string. Without one of these in the seed, the 360px overflow
 * that A1 spent a phase on would never be exercised here
 * (feedback_management_plan.md §6).
 */
const UNBROKEN_TOKEN = `at_WebRTCPeerConnection.onIceCandidateError(${'x'.repeat(180)})::${'y'.repeat(180)}`

const SEED: MockTicket[] = [
  {
    id: 'fb_pending',
    userId: 'usr_sarah_reporter',
    type: 'BUG',
    subject: 'Audio cuts out during group call',
    description:
      'During calls with 3 or more participants, audio cuts out after about two minutes on Wi-Fi. It recovers if I switch to cellular.',
    status: 'PENDING',
    priority: 'HIGH',
    userDeviceInfo:
      'device: Xiaomi 2201117TG, os: Android 13, appVersion: 2.3.0, buildNumber: 41',
    adminResponse: null,
    assignedAdminId: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    user: reporter(
      'usr_sarah_reporter',
      'jamie.okafor@example.com',
      'Jamie Okafor',
      'jamieo',
    ),
    attachments: [
      {
        id: 'att_ok',
        feedbackId: 'fb_pending',
        fileUrl: 'https://media.callschat.com/attachments/screenshot-1.png',
        fileName: 'screenshot-1.png',
        fileType: 'image/png',
        fileSize: 245_000,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    ],
    /* No replies. The reporter has not heard back — the queue's whole point. */
    replies: [],
    statusHistory: [],
  },
  {
    /*
     * The hostile ticket. Everything a user can control is set to the worst
     * value that was actually accepted by the live API on 2026-09-06.
     */
    id: 'fb_hostile',
    userId: 'usr_hostile',
    type: 'OTHER',
    subject: 'Payment failed <script>alert(1)</script>',
    description: `Crash log follows, please advise:\n${UNBROKEN_TOKEN}`,
    status: 'REVIEWING',
    priority: 'CRITICAL',
    userDeviceInfo: null,
    adminResponse: null,
    assignedAdminId: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-05T11:30:00.000Z',
    updatedAt: '2026-09-06T09:12:00.000Z',
    /* `profile: null` — a reporter who never finished profile setup. */
    user: reporter('usr_hostile', 'no.profile@example.com', null),
    attachments: [
      {
        id: 'att_js',
        feedbackId: 'fb_hostile',
        fileUrl: 'javascript:alert(document.domain)',
        fileName: '<img src=x onerror=alert(1)>.png',
        fileType: 'text/html',
        fileSize: 1,
        createdAt: '2026-09-05T11:30:00.000Z',
      },
      {
        id: 'att_data',
        feedbackId: 'fb_hostile',
        fileUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        fileName: 'receipt.pdf',
        fileType: 'application/pdf',
        fileSize: 2_048,
        createdAt: '2026-09-05T11:30:00.000Z',
      },
      {
        id: 'att_relative',
        feedbackId: 'fb_hostile',
        fileUrl: '/admin/settings',
        fileName: 'log.txt',
        fileType: 'text/plain',
        fileSize: 512,
        createdAt: '2026-09-05T11:30:00.000Z',
      },
    ],
    replies: [],
    statusHistory: [
      {
        id: 'hist_hostile_1',
        feedbackId: 'fb_hostile',
        fromStatus: 'PENDING',
        toStatus: 'REVIEWING',
        note: null,
        changedById: SUPER_ADMIN.id,
        createdAt: '2026-09-06T09:12:00.000Z',
        changedBy: HISTORY_ACTOR,
      },
    ],
  },
  {
    /*
     * `adminResponse` deliberately DIFFERS from the newest reply.
     *
     * That is the only case in which the panel shows the field at all — it
     * means someone set it out of band, before the reply stream existed or
     * through the general PATCH. When the two match, it is a duplicate of the
     * reply and is suppressed (§3.3).
     */
    id: 'fb_in_progress',
    userId: 'usr_dana',
    type: 'IMPROVEMENT',
    subject: 'Let me mute a group without leaving it',
    description:
      'Right now the only way to stop notifications from a busy group is to leave. A per-group mute toggle would be enough.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    userDeviceInfo: 'device: iPhone 14, os: iOS 18.2, appVersion: 2.3.1',
    adminResponse: 'Escalated to the mobile team — tracked internally as MOB-412.',
    assignedAdminId: 'stf_sarah',
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-02T08:00:00.000Z',
    updatedAt: '2026-09-04T14:22:00.000Z',
    user: reporter('usr_dana', 'dana.mercer@example.com', 'Dana Mercer', 'dmercer'),
    attachments: [],
    replies: [
      {
        id: 'rep_1',
        feedbackId: 'fb_in_progress',
        senderId: SUPER_ADMIN.id,
        message: 'Thanks — this is a reasonable ask and it is on the roadmap.',
        createdAt: '2026-09-03T09:00:00.000Z',
        sender: SUPER_ADMIN,
      },
      {
        id: 'rep_2',
        feedbackId: 'fb_in_progress',
        senderId: 'stf_sarah',
        message: 'Picking this up now. No ETA yet, but it is being worked on.',
        createdAt: '2026-09-04T14:22:00.000Z',
        sender: ASSIGNABLE['stf_sarah'] as MockActor,
      },
    ],
    statusHistory: [
      {
        id: 'hist_ip_2',
        feedbackId: 'fb_in_progress',
        fromStatus: 'REVIEWING',
        toStatus: 'IN_PROGRESS',
        note: 'Assigned to the mobile team for scoping.',
        changedById: SUPER_ADMIN.id,
        createdAt: '2026-09-04T14:20:00.000Z',
        changedBy: HISTORY_ACTOR,
      },
      {
        id: 'hist_ip_1',
        feedbackId: 'fb_in_progress',
        fromStatus: 'PENDING',
        toStatus: 'REVIEWING',
        note: 'Initial triage.',
        changedById: SUPER_ADMIN.id,
        createdAt: '2026-09-02T09:00:00.000Z',
        changedBy: HISTORY_ACTOR,
      },
    ],
  },
  {
    /*
     * Fifteen history rows, so the "newest five + disclosure" rule has
     * something to be tested against (§3.10). A real ticket bounced between
     * states accumulates exactly this and the API paginates none of it.
     */
    id: 'fb_churned',
    userId: 'usr_ravi',
    type: 'REPORT',
    subject: 'User @spamking is mass-messaging my club',
    description:
      'They joined three of my clubs today and posted the same link in all of them.',
    status: 'REOPENED',
    priority: 'HIGH',
    userDeviceInfo: 'device: Pixel 8, os: Android 15, appVersion: 2.3.1',
    adminResponse: null,
    assignedAdminId: 'stf_marcus',
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-08-28T07:00:00.000Z',
    updatedAt: '2026-09-06T08:00:00.000Z',
    user: reporter('usr_ravi', 'ravi.desai@example.com', 'Ravi Desai', 'ravid'),
    attachments: [],
    replies: [],
    statusHistory: [],
  },
  {
    id: 'fb_closed',
    userId: 'usr_lena',
    type: 'BUG',
    subject: 'Profile photo upload fails on 4G',
    description: 'Upload spins forever unless I am on Wi-Fi.',
    status: 'CLOSED',
    priority: 'LOW',
    userDeviceInfo: 'device: Galaxy A54, os: Android 14, appVersion: 2.2.9',
    adminResponse: 'Fixed in 2.3.0. Please update from the store.',
    assignedAdminId: null,
    resolvedAt: '2026-08-30T12:00:00.000Z',
    closedAt: '2026-09-01T09:00:00.000Z',
    createdAt: '2026-08-25T16:40:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    user: reporter('usr_lena', 'lena.fischer@example.com', 'Lena Fischer', 'lenaf'),
    attachments: [],
    replies: [
      {
        id: 'rep_closed',
        feedbackId: 'fb_closed',
        senderId: SUPER_ADMIN.id,
        /* Matches `adminResponse` — so the panel must NOT show it twice. */
        message: 'Fixed in 2.3.0. Please update from the store.',
        createdAt: '2026-08-30T12:00:00.000Z',
        sender: SUPER_ADMIN,
      },
    ],
    statusHistory: [
      {
        id: 'hist_closed',
        feedbackId: 'fb_closed',
        fromStatus: 'RESOLVED',
        toStatus: 'CLOSED',
        note: 'No response from reporter after the fix shipped.',
        changedById: SUPER_ADMIN.id,
        createdAt: '2026-09-01T09:00:00.000Z',
        changedBy: HISTORY_ACTOR,
      },
    ],
  },
]

/** Fill `fb_churned` out to fifteen history rows, newest first. */
function seedChurnedHistory(): void {
  const churned = SEED.find((ticket) => ticket.id === 'fb_churned')
  if (!churned || churned.statusHistory.length > 0) return

  const walk: readonly (readonly [FeedbackStatus, FeedbackStatus])[] = [
    ['PENDING', 'REVIEWING'],
    ['REVIEWING', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'REOPENED'],
    ['REOPENED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'RESOLVED'],
    ['RESOLVED', 'CLOSED'],
    ['CLOSED', 'REOPENED'],
    ['REOPENED', 'REVIEWING'],
    ['REVIEWING', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'CLOSED'],
    ['CLOSED', 'REOPENED'],
    ['REOPENED', 'RESOLVED'],
    ['RESOLVED', 'CLOSED'],
    ['CLOSED', 'REOPENED'],
  ]

  churned.statusHistory = walk
    .map(([fromStatus, toStatus], index) => ({
      id: `hist_churn_${index}`,
      feedbackId: 'fb_churned',
      fromStatus,
      toStatus,
      note: index % 3 === 0 ? `Automated bounce ${index}` : null,
      changedById: SUPER_ADMIN.id,
      createdAt: new Date(Date.UTC(2026, 7, 28, 7, index * 7)).toISOString(),
      changedBy: HISTORY_ACTOR,
    }))
    .reverse()
}

seedChurnedHistory()

function load(): MockTicket[] {
  try {
    const raw = globalThis.localStorage?.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as MockTicket[]) : structuredClone(SEED)
  } catch {
    return structuredClone(SEED)
  }
}

let tickets: MockTicket[] = load()

/**
 * The alternating-shape counter (§3.2).
 *
 * Module state, reset with the tickets, so a test can assert both shapes by
 * making two calls rather than by reaching into the handler.
 */
let transitionCallCount = 0

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(tickets))
  } catch {
    /* Private mode or blocked storage — in-memory only. */
  }
}

/**
 * Restore the seed tickets.
 *
 * `tickets` is loaded once at module import, so clearing `localStorage` from a
 * test does nothing — the in-memory copy survives. Mirrors `resetMockStaff`.
 */
export function resetMockFeedback(): void {
  tickets = structuredClone(SEED)
  actingRole = 'SUPER_ADMIN'
  transitionCallCount = 0
  try {
    globalThis.localStorage?.removeItem(STATE_KEY)
  } catch {
    /* Nothing to clear. */
  }
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

function assignedAdmin(ticket: MockTicket): MockActor | null {
  if (!ticket.assignedAdminId) return null
  return ASSIGNABLE[ticket.assignedAdminId] ?? null
}

/** The base columns — every shape contains exactly these. */
function toBase(ticket: MockTicket) {
  const {
    user: _user,
    attachments: _attachments,
    replies: _replies,
    statusHistory: _statusHistory,
    ...base
  } = ticket
  return base
}

/** List row: base + `user` + `assignedAdmin` + `_count`. */
function toRow(ticket: MockTicket) {
  return {
    ...toBase(ticket),
    user: ticket.user,
    assignedAdmin: assignedAdmin(ticket),
    _count: {
      attachments: ticket.attachments.length,
      replies: ticket.replies.length,
    },
  }
}

/** Detail: everything. The only shape stable enough to draw a screen from. */
function toFull(ticket: MockTicket) {
  return {
    ...toBase(ticket),
    user: ticket.user,
    assignedAdmin: assignedAdmin(ticket),
    attachments: ticket.attachments,
    replies: ticket.replies,
    statusHistory: ticket.statusHistory,
  }
}

/**
 * The transition endpoint's *other* shape (§3.2).
 *
 * Base columns plus the newest history row only, with no `changedBy` and none
 * of the four relations. Ten of twelve live calls answered like this; the other
 * two answered {@link toFull}. Anything that renders a mutation response will
 * therefore work on some requests and lose half the page on others — which is
 * precisely the failure this mock exists to produce in a test rather than in
 * production.
 */
function toPartial(ticket: MockTicket) {
  const newest = ticket.statusHistory[0]
  return {
    ...toBase(ticket),
    statusHistory: newest
      ? [
          {
            id: newest.id,
            feedbackId: newest.feedbackId,
            fromStatus: newest.fromStatus,
            toStatus: newest.toStatus,
            note: newest.note,
            changedById: newest.changedById,
            createdAt: newest.createdAt,
          },
        ]
      : [],
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

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

const NULL_BODY = errorResponse.bind(
  null,
  400,
  VALIDATION,
  'body/ Expected object, received null',
)

function validationFailure(issues: readonly string[]): Response {
  return errorResponse(400, VALIDATION, issues.join(', '))
}

/** Verbatim, doubled suffix and all. */
function notFound(): Response {
  return errorResponse(404, 'NOT_FOUND', 'Feedback ticket not found. not found')
}

function enumIssue(
  field: string,
  values: readonly string[],
  received: unknown,
): string {
  const expected = values.map((value) => `'${value}'`).join(' | ')
  return `${field} Invalid enum value. Expected ${expected}, received '${String(received)}'`
}

/** The live matrix (feedback_management_plan.md §2.5). */
const TRANSITIONS: Readonly<Record<FeedbackStatus, readonly FeedbackStatus[]>> = {
  PENDING: ['REVIEWING', 'IN_PROGRESS', 'CLOSED'],
  REVIEWING: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REOPENED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'REVIEWING', 'RESOLVED', 'CLOSED'],
}

/**
 * Apply a transition, or return the server's rejection.
 *
 * ⚠️ A **same-status move is accepted** and appends a `X → X` history row
 * (§3.4). That is not a bug in the mock. The live service does it, and the
 * panel's only defence is `transitionsFor`, which never offers the current
 * status — a defence that is worth nothing if the mock refuses the move the UI
 * is supposed to make unreachable.
 */
function applyTransition(
  ticket: MockTicket,
  next: FeedbackStatus,
  note: string | null,
): Response | null {
  const allowed = TRANSITIONS[ticket.status]
  if (next !== ticket.status && !allowed.includes(next)) {
    return errorResponse(
      400,
      'BAD_REQUEST',
      `Invalid status transition from '${ticket.status}' to '${next}'. Allowed transitions: ${allowed.join(', ')}.`,
    )
  }

  const now = new Date().toISOString()
  ticket.statusHistory.unshift({
    id: `hist_${Math.random().toString(36).slice(2, 10)}`,
    feedbackId: ticket.id,
    fromStatus: ticket.status,
    toStatus: next,
    note,
    changedById: SUPER_ADMIN.id,
    createdAt: now,
    changedBy: HISTORY_ACTOR,
  })

  ticket.status = next
  ticket.updatedAt = now

  /* Verified timestamp effects: RESOLVED stamps, CLOSED stamps and keeps the
   * earlier resolvedAt, REOPENED clears both. */
  if (next === 'RESOLVED') ticket.resolvedAt = now
  if (next === 'CLOSED') ticket.closedAt = now
  if (next === 'REOPENED') {
    ticket.resolvedAt = null
    ticket.closedAt = null
  }

  return null
}

/**
 * The assignment check, shared by `/assign` and the general `PATCH` (§3.5).
 *
 * Both routes enforce it identically on the live service — there is no bypass —
 * so both call this.
 */
function validateAssignee(adminId: string): Response | null {
  if (!(adminId in ASSIGNABLE)) {
    return errorResponse(
      404,
      'NOT_FOUND',
      'Target administrative staff member not found. not found',
    )
  }
  if (!ACTIVE_STAFF.has(adminId)) {
    return errorResponse(
      400,
      'BAD_REQUEST',
      'Cannot assign feedback to an inactive or suspended staff member.',
    )
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const feedbackHandlers = [
  /**
   * `GET /admin/feedbacks/stats`.
   *
   * Registered BEFORE the `:id` route below, or `stats` is read as a ticket id
   * and every dashboard call 404s.
   */
  http.get(`${API_PREFIX}/admin/feedbacks/stats`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireFeedbackPermission()
    if (guard) return guard

    const count = (status: FeedbackStatus) =>
      tickets.filter((ticket) => ticket.status === status).length
    const byType = (type: FeedbackType) =>
      tickets.filter((ticket) => ticket.type === type).length
    const byPriority = (priority: FeedbackPriority) =>
      tickets.filter((ticket) => ticket.priority === priority).length

    return HttpResponse.json({
      success: true,
      data: {
        total: tickets.length,
        pending: count('PENDING'),
        reviewing: count('REVIEWING'),
        inProgress: count('IN_PROGRESS'),
        resolved: count('RESOLVED'),
        closed: count('CLOSED'),
        reopened: count('REOPENED'),
        byType: {
          bug: byType('BUG'),
          improvement: byType('IMPROVEMENT'),
          report: byType('REPORT'),
          other: byType('OTHER'),
        },
        byPriority: {
          low: byPriority('LOW'),
          medium: byPriority('MEDIUM'),
          high: byPriority('HIGH'),
          critical: byPriority('CRITICAL'),
        },
      },
    })
  }),

  /** `GET /admin/feedbacks` — the `{ data: { items, meta } }` envelope. */
  http.get(`${API_PREFIX}/admin/feedbacks`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireFeedbackPermission()
    if (guard) return guard

    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const status = url.searchParams.get('status')
    const type = url.searchParams.get('type')
    const priority = url.searchParams.get('priority')
    const sortBy = url.searchParams.get('sortBy')
    const sortOrder = url.searchParams.get('sortOrder')
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
    const assignedAdminId = url.searchParams.get('assignedAdminId')
    const fromDate = url.searchParams.get('fromDate')
    const toDate = url.searchParams.get('toDate')

    const issues: string[] = []
    if (!Number.isInteger(limit) || limit > 100) {
      issues.push('querystring/limit Number must be less than or equal to 100')
    }
    if (status && !(FEEDBACK_STATUS_VALUES as readonly string[]).includes(status)) {
      issues.push(enumIssue('querystring/status', FEEDBACK_STATUS_VALUES, status))
    }
    if (type && !(FEEDBACK_TYPE_VALUES as readonly string[]).includes(type)) {
      issues.push(enumIssue('querystring/type', FEEDBACK_TYPE_VALUES, type))
    }
    if (
      priority &&
      !(FEEDBACK_PRIORITY_VALUES as readonly string[]).includes(priority)
    ) {
      issues.push(enumIssue('querystring/priority', FEEDBACK_PRIORITY_VALUES, priority))
    }
    const sortFields = ['createdAt', 'updatedAt', 'priority', 'status']
    if (sortBy && !sortFields.includes(sortBy)) {
      issues.push(enumIssue('querystring/sortBy', sortFields, sortBy))
    }
    if (sortOrder && sortOrder !== 'asc' && sortOrder !== 'desc') {
      issues.push(enumIssue('querystring/sortOrder', ['asc', 'desc'], sortOrder))
    }
    /*
     * ⚠️ `fromDate` and `toDate` are NOT validated, on purpose. The live
     * service answers 200 to `fromDate=notadate` and drops the filter (§3.7).
     * Rejecting it here would hide the defect from anyone testing against the
     * mock and would make `listParams`' own re-validation look unnecessary.
     */
    if (issues.length > 0) return validationFailure(issues)

    let rows = [...tickets]
    if (status) rows = rows.filter((ticket) => ticket.status === status)
    if (type) rows = rows.filter((ticket) => ticket.type === type)
    if (priority) rows = rows.filter((ticket) => ticket.priority === priority)
    if (assignedAdminId) {
      /* Literal comparison — so `null` matches nothing, exactly as live (§3.6). */
      rows = rows.filter((ticket) => ticket.assignedAdminId === assignedAdminId)
    }
    if (search) {
      rows = rows.filter((ticket) =>
        [ticket.subject, ticket.description, ticket.user.email].some((field) =>
          field.toLowerCase().includes(search),
        ),
      )
    }
    /* A parseable date filters; an unparseable one is silently ignored. */
    const from = fromDate ? Date.parse(fromDate) : Number.NaN
    if (!Number.isNaN(from)) {
      rows = rows.filter((ticket) => Date.parse(ticket.createdAt) >= from)
    }
    const to = toDate ? Date.parse(toDate) : Number.NaN
    if (!Number.isNaN(to)) {
      rows = rows.filter((ticket) => Date.parse(ticket.createdAt) <= to)
    }

    if (sortBy) {
      /*
       * Enum fields sort by DECLARATION order, not alphabetically — verified
       * live, and the reason `priority` ascending means LOW → CRITICAL rather
       * than CRITICAL → MEDIUM.
       */
      const ordinal = (ticket: MockTicket): number | string => {
        if (sortBy === 'priority')
          return FEEDBACK_PRIORITY_VALUES.indexOf(ticket.priority)
        if (sortBy === 'status') return FEEDBACK_STATUS_VALUES.indexOf(ticket.status)
        return sortBy === 'updatedAt' ? ticket.updatedAt : ticket.createdAt
      }
      const direction = sortOrder === 'asc' ? 1 : -1
      rows.sort((a, b) => {
        const left = ordinal(a)
        const right = ordinal(b)
        if (typeof left === 'number' && typeof right === 'number') {
          return (left - right) * direction
        }
        return String(left).localeCompare(String(right)) * direction
      })
    }

    const total = rows.length
    const start = (page - 1) * limit
    return HttpResponse.json({
      success: true,
      data: {
        items: rows.slice(start, start + limit).map(toRow),
        meta: {
          /* ⚠️ `page` echoed, never clamped; `totalPages` never 0 (§3.8). */
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    })
  }),

  /** `GET /admin/feedbacks/:id` — the stable, complete shape. */
  http.get(`${API_PREFIX}/admin/feedbacks/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireFeedbackPermission()
    if (guard) return guard

    const ticket = tickets.find((entry) => entry.id === params['id'])
    if (!ticket) return notFound()

    return HttpResponse.json({ success: true, data: toFull(ticket) })
  }),

  /**
   * `PATCH /admin/feedbacks/:id`.
   *
   * Accepts `priority`, `adminResponse`, and — undocumented but real —
   * `status` and `assignedAdminId`, with the same validation as the dedicated
   * routes (§3.5). Anything else is silently dropped, including `subject`.
   */
  http.patch(`${API_PREFIX}/admin/feedbacks/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireFeedbackPermission()
    if (guard) return guard

    const ticket = tickets.find((entry) => entry.id === params['id'])
    if (!ticket) return notFound()

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const issues: string[] = []
    const priority = body['priority']
    const status = body['status']
    const adminResponse = body['adminResponse']

    if (
      priority !== undefined &&
      !(FEEDBACK_PRIORITY_VALUES as readonly string[]).includes(String(priority))
    ) {
      issues.push(enumIssue('body/priority', FEEDBACK_PRIORITY_VALUES, priority))
    }
    if (
      status !== undefined &&
      !(FEEDBACK_STATUS_VALUES as readonly string[]).includes(String(status))
    ) {
      issues.push(enumIssue('body/status', FEEDBACK_STATUS_VALUES, status))
    }
    if (adminResponse !== undefined && typeof adminResponse !== 'string') {
      issues.push(
        `body/adminResponse Expected string, received ${typeof adminResponse}`,
      )
    }
    if (issues.length > 0) return validationFailure(issues)

    if (body['assignedAdminId'] !== undefined) {
      const adminId = body['assignedAdminId']
      if (adminId !== null) {
        if (typeof adminId !== 'string') {
          return validationFailure([
            `body/assignedAdminId Expected string, received ${typeof adminId}`,
          ])
        }
        const rejection = validateAssignee(adminId)
        if (rejection) return rejection
      }
      ticket.assignedAdminId = adminId as string | null
    }

    if (status !== undefined) {
      const rejection = applyTransition(ticket, status as FeedbackStatus, null)
      if (rejection) return rejection
    }
    if (priority !== undefined) ticket.priority = priority as FeedbackPriority
    if (typeof adminResponse === 'string') ticket.adminResponse = adminResponse

    ticket.updatedAt = new Date().toISOString()
    persist()

    /* This route DOES answer with the full shape, consistently. Only
     * `/status` alternates. */
    return HttpResponse.json({
      success: true,
      message: 'Feedback updated successfully.',
      data: toFull(ticket),
    })
  }),

  /**
   * `PATCH /admin/feedbacks/:id/status`.
   *
   * ⚠️ Alternates its response shape (§3.2): the first call after a reset
   * answers FULL, every subsequent one answers PARTIAL. The live ratio was 2
   * full in 12, both on a freshly opened connection; alternating on the first
   * call is the deterministic version of that, so a test can assert both
   * without racing.
   */
  http.patch(
    `${API_PREFIX}/admin/feedbacks/:id/status`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const guard = requireFeedbackPermission()
      if (guard) return guard

      const ticket = tickets.find((entry) => entry.id === params['id'])
      if (!ticket) return notFound()

      const body = await readBody(request)
      if (!body) return NULL_BODY()

      const status = body['status']
      if (
        status === undefined ||
        !(FEEDBACK_STATUS_VALUES as readonly string[]).includes(String(status))
      ) {
        return validationFailure([
          status === undefined
            ? 'body/status Required'
            : enumIssue('body/status', FEEDBACK_STATUS_VALUES, status),
        ])
      }

      const note = typeof body['note'] === 'string' ? body['note'] : null
      const rejection = applyTransition(ticket, status as FeedbackStatus, note)
      if (rejection) return rejection

      persist()

      const useFullShape = transitionCallCount === 0
      transitionCallCount += 1

      return HttpResponse.json({
        success: true,
        message: `Feedback status transitioned to '${String(status)}' successfully.`,
        data: useFullShape ? toFull(ticket) : toPartial(ticket),
      })
    },
  ),

  /** `PATCH /admin/feedbacks/:id/assign`. */
  http.patch(
    `${API_PREFIX}/admin/feedbacks/:id/assign`,
    async ({ params, request }) => {
      const scenario = await applyScenario()
      if (scenario) return scenario

      const guard = requireFeedbackPermission()
      if (guard) return guard

      const ticket = tickets.find((entry) => entry.id === params['id'])
      if (!ticket) return notFound()

      const body = await readBody(request)
      if (!body) return NULL_BODY()

      /* ⚠️ Required even to unassign — omitting the key is a 400, not a no-op. */
      if (!('adminId' in body)) return validationFailure(['body/adminId Required'])

      const adminId = body['adminId']
      if (adminId !== null) {
        if (typeof adminId !== 'string') {
          return validationFailure([
            `body/adminId Expected string, received ${typeof adminId}`,
          ])
        }
        const rejection = validateAssignee(adminId)
        if (rejection) return rejection
      }

      ticket.assignedAdminId = adminId as string | null
      ticket.updatedAt = new Date().toISOString()
      persist()

      /* The assign route's own narrow shape: base + assignedAdmin, nothing else. */
      return HttpResponse.json({
        success: true,
        message: adminId
          ? 'Feedback assigned to staff member successfully.'
          : 'Feedback unassigned successfully.',
        data: { ...toBase(ticket), assignedAdmin: assignedAdmin(ticket) },
      })
    },
  ),

  /**
   * `POST /admin/feedbacks/:id/reply`.
   *
   * ⚠️ **Overwrites `adminResponse`** with the reply message (§3.3). The doc
   * documents both fields and never mentions that this one destroys the other.
   */
  http.post(`${API_PREFIX}/admin/feedbacks/:id/reply`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const guard = requireFeedbackPermission()
    if (guard) return guard

    const ticket = tickets.find((entry) => entry.id === params['id'])
    if (!ticket) return notFound()

    const body = await readBody(request)
    if (!body) return NULL_BODY()

    const message = body['message']
    if (typeof message !== 'string' || message.trim() === '') {
      return validationFailure(['body/message Message is required'])
    }

    const now = new Date().toISOString()
    const reply: MockReply = {
      id: `rep_${Math.random().toString(36).slice(2, 10)}`,
      feedbackId: ticket.id,
      senderId: SUPER_ADMIN.id,
      message,
      createdAt: now,
      sender: SUPER_ADMIN,
    }

    ticket.replies.push(reply)
    /* The silent overwrite. Reproduced exactly. */
    ticket.adminResponse = message
    ticket.updatedAt = now
    persist()

    return HttpResponse.json({
      success: true,
      message: 'Admin reply posted successfully.',
      /* `feedback` here carries NO relations — not a substitute for a refetch. */
      data: { reply, feedback: toBase(ticket) },
    })
  }),
]
