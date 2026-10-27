import { beforeEach, describe, expect, it } from 'vitest'

import {
  adjustWallet,
  approveTopUpRequest,
  createDiamondPackage,
  deleteDiamondPackage,
  fetchDiamondPackages,
  fetchTopUpRequests,
  rejectTopUpRequest,
} from '@/api/wallet'
import { isAppError } from '@/api/errors'
import { setSession } from '@/auth/tokenStore'
import {
  mockDiamondPackages,
  mockTopUpRequests,
  resetMockWallet,
  seedMockWallet,
} from '@/mocks/handlers/wallet'

/**
 * Does the mock behave like the backend that was measured? — phase W1.
 *
 * ⚠️ **A mock written from the same guess as the code cannot disprove the
 * guess.** That is not a maxim; it is what happened in the host module, where
 * a schema, a cell and a mock all agreed on `suspensionReason` and 127 tests
 * passed while the server had always sent `suspendedReason`. So every
 * assertion below is pinned to a response actually observed on
 * `test-api.callschat.com` on 2026-10-27, including the defects.
 */

async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return isAppError(error) ? error.message : String(error)
  }
  throw new Error('expected the call to fail, and it did not')
}

beforeEach(() => {
  resetMockWallet()
  setSession({
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  })
})

describe('the live default: nothing at all', () => {
  it('answers an empty queue, as production does', async () => {
    const page = await fetchTopUpRequests({})
    expect(page.data).toEqual([])
    expect(page.pagination).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 })
  })

  it('answers an empty package list, as production does', async () => {
    expect(await fetchDiamondPackages()).toEqual([])
  })
})

describe('the query contract', () => {
  beforeEach(() => seedMockWallet())

  it('rejects a lower-case status, because the server does', async () => {
    const message = await failure(() => fetchTopUpRequests({ status: 'pending' }))
    expect(message).toContain('Invalid enum value')
    expect(message).toContain("'PENDING'")
  })

  it('rejects a method the server does not know, UPAY included', async () => {
    /* ⚠️ The guide documents UPAY. The server has never had it. */
    const message = await failure(() => fetchTopUpRequests({ method: 'UPAY' }))
    expect(message).toContain('Invalid enum value')
    expect(message).toContain("'APPLE_IAP'")
  })

  it('accepts the three gateway methods the guide omits', async () => {
    const page = await fetchTopUpRequests({ method: 'APPLE_IAP' })
    expect(page.data).toHaveLength(1)
    expect(page.data[0]?.senderNumber).toBeNull()
  })

  it('enforces the limit ceiling and the page floor', async () => {
    expect(await failure(() => fetchTopUpRequests({ limit: 101 }))).toContain(
      'less than or equal to 100',
    )
    expect(await failure(() => fetchTopUpRequests({ limit: 0 }))).toContain(
      'greater than or equal to 1',
    )
    expect(await failure(() => fetchTopUpRequests({ page: 0 }))).toContain(
      'greater than or equal to 1',
    )
  })

  it('⚠️ accepts a garbage date and returns a full list, exactly as the server does', async () => {
    /*
     * This is a **defect reproduced on purpose**. `?startDate=hello` answers
     * 200 on the live backend, so a mistyped date yields a silently wrong set
     * rather than an error. A mock that rejected it would be better behaved
     * than the server and would hide the one failure mode on this route that
     * an operator cannot see. The guard lives in the client, and the test for
     * that guard needs this mock to let the bad value through.
     */
    const page = await fetchTopUpRequests({ startDate: 'hello' })
    expect(page.data).toHaveLength(4)
  })

  it('searches the transaction id and the sender number, nothing else', async () => {
    expect((await fetchTopUpRequests({ search: '9K38FX92P1' })).data).toHaveLength(1)
    expect((await fetchTopUpRequests({ search: '01999888777' })).data).toHaveLength(1)
    /* Not the display name — the server searches two fields, not the user. */
    expect((await fetchTopUpRequests({ search: 'Rakibul' })).data).toHaveLength(0)
  })
})

describe('reviewing a request', () => {
  beforeEach(() => seedMockWallet())

  it('approves a pending request and records who did it', async () => {
    await approveTopUpRequest('cmvo2ve4l0003wkihbnpnc5jb')

    const row = mockTopUpRequests().find((r) => r.id === 'cmvo2ve4l0003wkihbnpnc5jb')
    expect(row?.status).toBe('APPROVED')
    expect(row?.reviewedAt).not.toBeNull()
  })

  it('refuses a second review in the service’s own words, measured', async () => {
    /*
     * ⚠️ **The guide says `409 CONFLICT` and it is wrong.** Verified against a
     * real approved row on 2026-10-27:
     *
     *     400 {"code":"BAD_REQUEST","message":"Cannot approve request in 'APPROVED' status."}
     *
     * This test asserted the guide's invented sentence until then, and the
     * mock agreed with it — the same failure mode that produced
     * `suspensionReason` in the host module. The drawer surfaces this message
     * verbatim, so the wording is what an operator reads when a colleague got
     * there first.
     *
     * The backend still locks the row `FOR UPDATE` and still refuses anything
     * that is not PENDING; only the status code and the sentence were
     * invented.
     */
    const message = await failure(() =>
      approveTopUpRequest('cmvo2ve4l0004wkihbnpnc5jc'),
    )
    expect(message).toBe("Cannot approve request in 'APPROVED' status.")
  })

  it('requires a reason to reject', async () => {
    expect(
      await failure(() => rejectTopUpRequest('cmvo2ve4l0003wkihbnpnc5jb', '')),
    ).toBe('body/reason Required')
  })

  it('validates the body before it looks the request up', async () => {
    /*
     * ⚠️ Validation runs BEFORE the lookup on every write route here — a bad
     * body against an unknown id is a 400, not a 404. That is what let the
     * whole write contract be mapped against an empty database.
     */
    expect(await failure(() => rejectTopUpRequest('does-not-exist', ''))).toBe(
      'body/reason Required',
    )
  })

  it('reports a missing request with a clean, undoubled message', async () => {
    /*
     * ⚠️ Unlike the host routes, which append " not found" to a label already
     * ending in it. This one needs no repair — verified live.
     */
    expect(await failure(() => approveTopUpRequest('does-not-exist'))).toBe(
      'Top-up request not found.',
    )
  })
})

describe('packages', () => {
  beforeEach(() => seedMockWallet())

  it('lists inactive packages too', async () => {
    /*
     * ⚠️ The admin list is not the storefront. Filtering hidden tiers out
     * would make a withdrawn package look deleted and leave nobody able to
     * switch it back on.
     */
    const all = await fetchDiamondPackages()
    expect(all).toHaveLength(3)
    expect(all.some((pkg) => pkg.isActive === false)).toBe(true)
  })

  it('names all three missing required fields at once', async () => {
    const message = await failure(() =>
      createDiamondPackage({ title: '', diamonds: 0, priceBdt: 0 } as never),
    )
    expect(message).toContain('body/title Title is required')
    expect(message).toContain('body/diamonds Base diamonds must be positive')
    expect(message).toContain('body/priceBdt BDT price must be positive')
  })

  it('deletes by id and reports an unknown one as a 404', async () => {
    await deleteDiamondPackage('pkg-diamond-retired')
    expect(mockDiamondPackages()).toHaveLength(2)

    expect(await failure(() => deleteDiamondPackage('pkg-diamond-retired'))).toBe(
      'Diamond package not found.',
    )
  })
})

describe('direct adjustment', () => {
  it('names every missing field, as the server does', async () => {
    const message = await failure(() => adjustWallet({} as never))
    expect(message).toBe(
      'body/userId Required, body/amount Required, body/note Required',
    )
  })

  it('refuses zero', async () => {
    expect(
      await failure(() => adjustWallet({ userId: 'u1', amount: 0, note: 'x' })),
    ).toBe('body/amount Amount cannot be zero')
  })

  it('accepts a debit', async () => {
    await expect(
      adjustWallet({
        userId: 'u1',
        amount: -250,
        note: 'Reversing a duplicate credit',
      }),
    ).resolves.toBeUndefined()
  })
})

describe('the hostile fixture', () => {
  beforeEach(() => seedMockWallet())

  it('carries a javascript: receipt, a 420-character id and no profile', async () => {
    /*
     * The receipt is the evidence a payment decision rests on, which makes it
     * the attachment an operator is most likely to click. It is defused at
     * render (W3), and it has to exist here for that guard to have anything
     * to defuse.
     */
    const page = await fetchTopUpRequests({})
    const hostile = page.data.find((row) => row.id === 'cmvo2ve4l0005wkihbnpnc5jd')

    expect(hostile?.receiptImageUrl).toMatch(/^javascript:/)
    expect(hostile?.transactionId).toHaveLength(420)
    expect(hostile?.user?.profile).toBeNull()
    expect(hostile?.user?.email).toBeNull()
    expect(hostile?.package).toBeNull()
  })
})
