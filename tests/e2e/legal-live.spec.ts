import { expect, test, type APIRequestContext } from '@playwright/test'

import {
  LEGAL_APP_TYPES,
  LEGAL_DOCUMENT_TYPES,
  LEGAL_SLUGS,
  LEGAL_STATUSES,
  legalDocumentEnvelopeSchema,
  legalListSchema,
} from '@/types/legal'

/**
 * Real-network smoke for the legal GET endpoints (legal plan LG6).
 *
 * Every other legal spec runs against the MSW mock, which only proves the
 * panel agrees with itself. This one asks the real API and parses the answers
 * with the panel's own schemas, so a renamed field on the server fails here
 * before it blanks the editor.
 *
 * **Opt-in and read-only.** It runs only with a token:
 *
 *   LIVE_API_TOKEN=… npx playwright test legal-live --project=desktop-1440
 *
 * `LIVE_API_BASE_URL` defaults to staging. GET requests only — nothing here
 * creates, saves, publishes or deletes a document. The token is read from the
 * environment and never written anywhere.
 */

/* `tests/` compiles with the browser's types, so Node's `process` is reached untyped. */
const ENV =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env ?? {}
const TOKEN = ENV['LIVE_API_TOKEN']
const BASE = `${(ENV['LIVE_API_BASE_URL'] ?? 'https://test-api.callschat.com').replace(/\/$/, '')}/api/v1`

test.skip(!TOKEN, 'Set LIVE_API_TOKEN to run the real-network smoke.')
// One width is enough: nothing here renders.
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) !== 1440,
  'Runs once, at desktop-1440.',
)

async function get(request: APIRequestContext, path: string, auth = true) {
  const response = await request.get(`${BASE}${path}`, {
    headers: auth ? { Authorization: `Bearer ${TOKEN ?? ''}` } : {},
  })
  return { status: response.status(), body: (await response.json()) as unknown }
}

test('the real list, each status and a detail parse with the panel’s schemas', async ({
  request,
}) => {
  const all = await get(request, '/admin/legal/documents?limit=50')
  expect(all.status).toBe(200)
  const list = legalListSchema.safeParse(all.body)
  expect(list.error?.issues ?? []).toEqual([])

  for (const status of LEGAL_STATUSES) {
    const page = await get(request, `/admin/legal/documents?status=${status}&limit=5`)
    expect(page.status, status).toBe(200)
    const parsed = legalListSchema.safeParse(page.body)
    expect(parsed.error?.issues ?? [], status).toEqual([])
    for (const row of parsed.data?.data ?? []) expect(row.status).toBe(status)
  }

  /* The cap the panel pages at (MAX_LEGAL_LIMIT): one above it is refused. */
  expect((await get(request, '/admin/legal/documents?limit=51')).status).toBe(400)

  const first = list.data?.data[0]
  test.skip(!first, 'No legal documents on this server yet.')
  const detail = await get(request, `/admin/legal/documents/${first?.id ?? ''}`)
  expect(detail.status).toBe(200)
  const doc = legalDocumentEnvelopeSchema.safeParse(detail.body)
  expect(doc.error?.issues ?? []).toEqual([])
})

test('every row says which app it belongs to, and the app filter holds', async ({
  request,
}) => {
  /*
   * plan.md LB1. The schema defaults a missing `appType` to PERSONAL, so a
   * parse alone would not notice the server dropping it: the raw rows are
   * checked too.
   */
  const raw = (await get(request, '/admin/legal/documents?limit=50')).body as {
    data?: { appType?: unknown }[]
  }
  for (const row of raw.data ?? []) expect(LEGAL_APP_TYPES).toContain(row.appType)

  for (const app of LEGAL_APP_TYPES) {
    const page = await get(request, `/admin/legal/documents?appType=${app}&limit=50`)
    expect(page.status, app).toBe(200)
    const parsed = legalListSchema.safeParse(page.body)
    expect(parsed.error?.issues ?? [], app).toEqual([])
    for (const row of parsed.data?.data ?? []) expect(row.appType, app).toBe(app)
  }
  /* The panel only ever sends the two values; anything else is refused. */
  expect((await get(request, '/admin/legal/documents?appType=ALL')).status).toBe(400)
})

test('the public page of each policy matches what the panel says is published', async ({
  request,
}) => {
  const all = legalListSchema.parse(
    (await get(request, '/admin/legal/documents?status=PUBLISHED&limit=50')).body,
  )
  for (const app of LEGAL_APP_TYPES) {
    for (const type of LEGAL_DOCUMENT_TYPES) {
      const label = `${app} ${type}`
      const published = all.data.find(
        (doc) => doc.documentType === type && doc.appType === app,
      )
      /*
       * Asked the way the apps ask: the Personal slug, plus `?appType=` for
       * Business (guide §5). That form stays unambiguous even where the two
       * apps share a slug (plan.md B2).
       */
      const query = app === 'BUSINESS' ? '?appType=BUSINESS' : ''
      const page = await get(request, `/legal/${LEGAL_SLUGS[type]}${query}`, false)
      if (!published) {
        expect(page.status, `${label} has no published version`).toBe(404)
        continue
      }
      expect(page.status, label).toBe(200)
      const body = page.body as { data?: { id?: string; version?: string } }
      expect(body.data?.id, label).toBe(published.id)
      expect(body.data?.version, label).toBe(published.version)
    }
  }
})
