import { beforeEach, describe, expect, it } from 'vitest'

import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import { mockFeedbackActingRole, resetMockFeedback } from '@/mocks/handlers/feedback'
import { feedbackSchema } from '@/types/feedback'

import {
  assignFeedback,
  fetchFeedbackList,
  fetchFeedbackStats,
  fetchFeedbackTicket,
  replyToFeedback,
  transitionFeedbackStatus,
  updateFeedbackPriority,
} from './api'

/**
 * Mock-fidelity tests.
 *
 * These do not test the mock for its own sake — they test that the mock is as
 * **hostile** as the live service, because most of the traps in
 * feedback_management_plan.md §3 are invisible from a success response. A
 * permissive mock answers 200 to a silently-overwritten field, to an ignored
 * date filter and to a shape-shifting mutation; the suite goes green and the
 * defect ships.
 *
 * Every expectation below was verified against the real API on 2026-09-06. If
 * one fails, either the mock drifted or the backend was fixed — and the second
 * is worth checking before deleting the test.
 */

beforeEach(() => {
  resetMockFeedback()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

const ALL = { page: 1, limit: 100 }

describe('§3.2 — the transition response has two shapes', () => {
  it('answers FULL once and PARTIAL thereafter, and both parse', () => {
    /*
     * Live, 2 of 12 identical consecutive requests answered with the full
     * record and 10 with a 15-key partial. The mock alternates deterministically
     * so this can be asserted without racing, but the point is the same: a
     * caller that renders this response works on some requests and loses half
     * the page on others.
     */
    return (async () => {
      const first = await transitionFeedbackStatus('fb_pending', {
        status: 'REVIEWING',
      })
      expect(first.user).toBeDefined()
      expect(first.attachments).toBeDefined()

      const second = await transitionFeedbackStatus('fb_pending', {
        status: 'IN_PROGRESS',
      })
      expect(second.user).toBeUndefined()
      expect(second.attachments).toBeUndefined()
      expect(second.replies).toBeUndefined()
      expect(second.statusHistory).toHaveLength(1)

      /* Both must satisfy the contract, or a successful write throws at random. */
      expect(() => feedbackSchema.parse(first)).not.toThrow()
      expect(() => feedbackSchema.parse(second)).not.toThrow()
    })()
  })

  it('is contradicted by the detail route, which is stable', async () => {
    const reads = await Promise.all(
      Array.from({ length: 5 }, () => fetchFeedbackTicket('fb_in_progress')),
    )
    for (const ticket of reads) {
      expect(ticket.user).toBeDefined()
      expect(ticket.replies).toBeDefined()
      expect(ticket.statusHistory).toBeDefined()
    }
  })
})

describe('§3.3 — a reply silently overwrites adminResponse', () => {
  it('destroys a value set through the general PATCH', async () => {
    const before = await fetchFeedbackTicket('fb_in_progress')
    expect(before.adminResponse).toBe(
      'Escalated to the mobile team — tracked internally as MOB-412.',
    )

    await replyToFeedback('fb_in_progress', { message: 'Update: shipping in 2.4.0.' })

    const after = await fetchFeedbackTicket('fb_in_progress')
    /*
     * Two separately documented fields, one of which destroys the other with
     * no warning. This is why the panel has exactly one writer for it — the
     * reply composer — and never offers an "admin response" editor.
     */
    expect(after.adminResponse).toBe('Update: shipping in 2.4.0.')
  })
})

describe('§3.4 — a same-status transition is accepted', () => {
  it('succeeds and appends a junk X -> X history row', async () => {
    /*
     * The mock must NOT refuse this. The panel's defence is `transitionsFor`,
     * which never offers the current status — a defence worth nothing if the
     * mock makes the move impossible anyway.
     */
    const ticket = await fetchFeedbackTicket('fb_hostile')
    expect(ticket.status).toBe('REVIEWING')

    await transitionFeedbackStatus('fb_hostile', { status: 'REVIEWING' })

    const after = await fetchFeedbackTicket('fb_hostile')
    expect(after.status).toBe('REVIEWING')
    expect(after.statusHistory?.[0]?.fromStatus).toBe('REVIEWING')
    expect(after.statusHistory?.[0]?.toStatus).toBe('REVIEWING')
  })

  it('rejects an illegal move with the successor list in the message', async () => {
    await expect(
      transitionFeedbackStatus('fb_closed', { status: 'PENDING' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          "Invalid status transition from 'CLOSED' to 'PENDING'. Allowed transitions: REOPENED.",
    )
  })
})

describe('§3.5 — timestamps follow the lifecycle', () => {
  it('stamps resolvedAt, then closedAt, then clears both on reopen', async () => {
    await transitionFeedbackStatus('fb_in_progress', { status: 'RESOLVED' })
    const resolved = await fetchFeedbackTicket('fb_in_progress')
    expect(resolved.resolvedAt).not.toBeNull()
    expect(resolved.closedAt).toBeNull()

    await transitionFeedbackStatus('fb_in_progress', { status: 'CLOSED' })
    const closed = await fetchFeedbackTicket('fb_in_progress')
    /* CLOSED keeps the earlier resolvedAt rather than clearing it. */
    expect(closed.resolvedAt).not.toBeNull()
    expect(closed.closedAt).not.toBeNull()

    await transitionFeedbackStatus('fb_in_progress', { status: 'REOPENED' })
    const reopened = await fetchFeedbackTicket('fb_in_progress')
    expect(reopened.resolvedAt).toBeNull()
    expect(reopened.closedAt).toBeNull()
  })
})

describe('§3.6 — assignment', () => {
  it('refuses a suspended staff member with the API’s own message', async () => {
    await expect(
      assignFeedback('fb_pending', { adminId: 'stf_priya' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.message ===
          'Cannot assign feedback to an inactive or suspended staff member.',
    )
  })

  it('refuses an id that is not staff at all, with a 404', async () => {
    await expect(
      assignFeedback('fb_pending', { adminId: 'usr_dana' }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.status === 404)
  })

  it('unassigns with an explicit null', async () => {
    await assignFeedback('fb_in_progress', { adminId: null })
    const ticket = await fetchFeedbackTicket('fb_in_progress')
    expect(ticket.assignedAdminId).toBeNull()
  })

  it('cannot express "unassigned" as a FILTER', async () => {
    /*
     * `assignedAdminId=null` compares the literal string, so it matches
     * nothing — while omitting the parameter returns everything. The queue's
     * most useful view simply cannot be requested, which is why the panel
     * offers an Unassigned badge in the list instead of a filter.
     */
    const filtered = await fetchFeedbackList({ ...ALL, assignedAdminId: 'null' })
    expect(filtered.items).toHaveLength(0)

    const unfiltered = await fetchFeedbackList(ALL)
    expect(unfiltered.items.length).toBeGreaterThan(0)
    expect(unfiltered.items.some((item) => item.assignedAdminId === null)).toBe(true)
  })
})

describe('§3.7 — date filters are not validated', () => {
  it('accepts garbage and silently drops the filter', async () => {
    const all = await fetchFeedbackList(ALL)
    const garbage = await fetchFeedbackList({ ...ALL, fromDate: 'notadate' })
    /*
     * A 200 is never proof a filter was applied. `listParams.ts` re-validates
     * before a value reaches the request precisely because the server will not.
     */
    expect(garbage.items).toHaveLength(all.items.length)
  })

  it('does filter when the date actually parses', async () => {
    const future = await fetchFeedbackList({ ...ALL, fromDate: '2027-01-01' })
    expect(future.items).toHaveLength(0)
  })

  it('rejects the parameters it DOES validate', async () => {
    await expect(fetchFeedbackList({ ...ALL, status: 'NOPE' })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.status === 400,
    )
    await expect(fetchFeedbackList({ ...ALL, sortBy: 'hacker' })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.status === 400,
    )
    await expect(fetchFeedbackList({ page: 1, limit: 500 })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.status === 400,
    )
  })
})

describe('§3.8 — pagination meta lies at the edges', () => {
  it('reports totalPages 1 for an empty result', async () => {
    const empty = await fetchFeedbackList({ ...ALL, search: 'zzzznomatch' })
    expect(empty.items).toHaveLength(0)
    expect(empty.meta.total).toBe(0)
    /* Should be 0. It is not — the panel chooses its empty state from
     * `items.length`, never from `totalPages`. */
    expect(empty.meta.totalPages).toBe(1)
  })

  it('echoes a page beyond the last rather than clamping', async () => {
    const beyond = await fetchFeedbackList({ page: 99, limit: 20 })
    expect(beyond.items).toHaveLength(0)
    expect(beyond.meta.page).toBe(99)
    expect(beyond.meta.totalPages).toBe(1)
  })
})

describe('§3.9 — hostile attachment metadata survives the round trip', () => {
  it('delivers the javascript: URL unchanged, for the UI to defuse', async () => {
    const ticket = await fetchFeedbackTicket('fb_hostile')
    const urls = ticket.attachments?.map((attachment) => attachment.fileUrl) ?? []
    expect(urls).toContain('javascript:alert(document.domain)')
    expect(ticket.attachments?.[0]?.fileName).toBe('<img src=x onerror=alert(1)>.png')
  })
})

describe('§3.10 — nothing can be deleted, and history is unbounded', () => {
  it('returns all fifteen history rows inline, newest first', async () => {
    const ticket = await fetchFeedbackTicket('fb_churned')
    expect(ticket.statusHistory).toHaveLength(15)
    expect(ticket.statusHistory?.[0]?.toStatus).toBe('REOPENED')
  })
})

describe('search and sort behave as the live service does', () => {
  it('searches case-insensitively across subject, description and reporter email', async () => {
    const bySubject = await fetchFeedbackList({ ...ALL, search: 'AUDIO' })
    expect(bySubject.items.map((item) => item.id)).toContain('fb_pending')

    const byEmail = await fetchFeedbackList({ ...ALL, search: 'dana.mercer@' })
    expect(byEmail.items.map((item) => item.id)).toContain('fb_in_progress')
  })

  it('sorts priority by ENUM order, so asc means least urgent first', async () => {
    const ascending = await fetchFeedbackList({
      ...ALL,
      sortBy: 'priority',
      sortOrder: 'asc',
    })
    expect(ascending.items[0]?.priority).toBe('LOW')

    const descending = await fetchFeedbackList({
      ...ALL,
      sortBy: 'priority',
      sortOrder: 'desc',
    })
    expect(descending.items[0]?.priority).toBe('CRITICAL')
  })
})

describe('the module 403', () => {
  it('names a permission nobody can actually be granted', async () => {
    /*
     * §3.1. The message reads like something a Super Admin could fix in
     * `/staff`, and they cannot — the key is absent from the enum every write
     * route validates against. The panel therefore hides the module from
     * everyone but a Super Admin rather than showing this message.
     */
    mockFeedbackActingRole.set('ADMIN')
    await expect(fetchFeedbackList(ALL)).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.status === 403 &&
        error.message.includes('FEEDBACK_MANAGEMENT'),
    )
  })
})

describe('stats', () => {
  it('are global, and move when a ticket moves', async () => {
    const before = await fetchFeedbackStats()
    expect(before.total).toBe(5)
    expect(before.pending).toBe(1)

    await transitionFeedbackStatus('fb_pending', { status: 'REVIEWING' })

    const after = await fetchFeedbackStats()
    expect(after.total).toBe(5)
    expect(after.pending).toBe(0)
    expect(after.reviewing).toBe(before.reviewing + 1)
  })
})

describe('priority is the only thing the general PATCH is used for', () => {
  it('changes priority without touching anything else', async () => {
    await updateFeedbackPriority('fb_pending', { priority: 'CRITICAL' })
    const ticket = await fetchFeedbackTicket('fb_pending')
    expect(ticket.priority).toBe('CRITICAL')
    expect(ticket.status).toBe('PENDING')
    expect(ticket.adminResponse).toBeNull()
  })

  it('rejects a priority outside the enum', async () => {
    await expect(
      // @ts-expect-error — deliberately outside the union, as a hand-built request would be
      updateFeedbackPriority('fb_pending', { priority: 'URGENT' }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.status === 400)
  })
})

describe('replies', () => {
  it('refuses an empty message with the API’s own wording', async () => {
    await expect(replyToFeedback('fb_pending', { message: '   ' })).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.message === 'body/message Message is required',
    )
  })

  it('appends to the stream in chronological order', async () => {
    await replyToFeedback('fb_pending', { message: 'First reply.' })
    await replyToFeedback('fb_pending', { message: 'Second reply.' })
    const ticket = await fetchFeedbackTicket('fb_pending')
    expect(ticket.replies?.map((reply) => reply.message)).toEqual([
      'First reply.',
      'Second reply.',
    ])
  })
})

describe('a missing ticket', () => {
  it('404s with the doubled suffix, verbatim', async () => {
    await expect(fetchFeedbackTicket('fb_nope')).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) &&
        error.status === 404 &&
        error.message === 'Feedback ticket not found. not found',
    )
  })
})
