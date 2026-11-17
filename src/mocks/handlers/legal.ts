import { http, HttpResponse } from 'msw'

import { currentMockAdmin } from './auth'
import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Mock of `/admin/legal/documents/*` and the public `/legal/:slug`
 * (plan.md §1, LG0).
 *
 * Copied from staging 2026-11-08, quirks included, so the panel is built
 * against the server it will meet:
 * - validation messages word for word (`FST_ERR_VALIDATION`, `body/<field>`);
 * - `status=ALL`, unknown enums, `page=0` and `limit>50` are 400s;
 * - `search` is accepted and ignored;
 * - `PUT` ignores `version` and `documentType`, rejects `null` subtitle/contact;
 * - the parser: `##` sections, blank-line paragraphs, slug ids that collide on
 *   duplicate headings, raw Markdown kept, `<script|iframe|object>` stripped,
 *   and on **create** `intro` taken from `subtitle` when one is sent.
 *
 * ⚠️ Not measured (irreversible on staging): publish's response and the
 * wrong-state 400s, whose wording is the guide's (plan.md O1).
 *
 * The Personal / Business split (plan.md LB1), measured 2026-11-17:
 * - `appType` on every row; left out on create, it is `PERSONAL`;
 * - a 409 `CONFLICT` only within the same type **and** app, naming the app;
 * - `PUT { appType }` moves the draft but keeps its slug (B1);
 * - Business slugs: `business-` for Privacy and Terms only (B2);
 * - public `?appType=BUSINESS` looks up the Business slug of that type.
 * Publishing archives within the same app: the guide's word, not measured.
 */

const BASE = `${API_PREFIX}/admin/legal/documents`
const PUBLIC = `${API_PREFIX}/legal`
const VALIDATION = 'FST_ERR_VALIDATION' as const

const TYPES = [
  'PRIVACY_POLICY',
  'TERMS_OF_SERVICE',
  'COOKIE_POLICY',
  'COMMUNITY_GUIDELINES',
] as const
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
const APPS = ['PERSONAL', 'BUSINESS'] as const
const SLUGS: Record<App, Record<DocType, string>> = {
  PERSONAL: {
    PRIVACY_POLICY: 'privacy-policy',
    TERMS_OF_SERVICE: 'terms-of-service',
    COOKIE_POLICY: 'cookie-policy',
    COMMUNITY_GUIDELINES: 'community-guidelines',
  },
  /* ⚠️ As staging derives them (plan.md B2): only two get the prefix. */
  BUSINESS: {
    PRIVACY_POLICY: 'business-privacy-policy',
    TERMS_OF_SERVICE: 'business-terms-of-service',
    COOKIE_POLICY: 'cookie-policy',
    COMMUNITY_GUIDELINES: 'community-guidelines',
  },
}
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type DocType = (typeof TYPES)[number]
type Status = (typeof STATUSES)[number]
type App = (typeof APPS)[number]

interface MockContact {
  org: string
  location?: string
  emails: { label: string; address: string }[]
  website?: string
}

interface MockSection {
  id: string
  heading: string
  body: string[]
}

interface MockDoc {
  id: string
  documentType: DocType
  appType: App
  slug: string
  version: string
  title: string
  subtitle: string | null
  effectiveDate: string
  intro: string | null
  contentMarkdown: string
  sections: MockSection[]
  contact: MockContact | null
  consent: string | null
  changelog: string | null
  requiresReconsent: boolean
  status: Status
  publishedAt: string | null
  publishedBy: string | null
  createdByAdminId: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ *
 * Parser — mirrors the server's observed behaviour, not ideal Markdown
 * ------------------------------------------------------------------ */

function sanitize(markdown: string): string {
  return markdown
    .replace(/<(script|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|iframe|object)\b[^>]*>/gi, '')
}

function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function parse(markdown: string): { intro: string | null; sections: MockSection[] } {
  const lines = markdown.split('\n')
  const before: string[] = []
  const sections: { heading: string; lines: string[] }[] = []
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match?.[1]) {
      sections.push({ heading: match[1], lines: [] })
    } else if (sections.length > 0) {
      sections.at(-1)?.lines.push(line)
    } else if (!/^#\s+/.test(line)) {
      before.push(line)
    }
  }
  const intro = paragraphs(before.join('\n')).join('\n\n')
  return {
    intro: intro || null,
    sections: sections.map((section) => ({
      id: anchor(section.heading),
      heading: section.heading,
      body: paragraphs(section.lines.join('\n')),
    })),
  }
}

/* ------------------------------------------------------------------ *
 * Seed — sample content, clearly not the real policies
 * ------------------------------------------------------------------ */

/** Nadia, the mock Super Admin — so seeded rows read "You" for her. */
const SUPER_ID = 'cmt8orkov00004upco3oifg2v'

const CONTACT: MockContact = {
  org: 'CallsChat LLC',
  location: 'United States',
  emails: [
    { label: 'Privacy', address: 'privacy@callschat.com' },
    { label: 'Support', address: 'support@callschat.com' },
  ],
  website: 'callschat.com',
}

function seedDoc(input: {
  id: string
  documentType: DocType
  appType?: App
  version: string
  title: string
  subtitle?: string
  effectiveDate: string
  markdown: string
  status: Status
  publishedAt?: string
  requiresReconsent?: boolean
  changelog?: string
  createdAt: string
}): MockDoc {
  const content = sanitize(input.markdown)
  const parsed = parse(content)
  const app = input.appType ?? 'PERSONAL'
  return {
    id: input.id,
    documentType: input.documentType,
    appType: app,
    slug: SLUGS[app][input.documentType],
    version: input.version,
    title: input.title,
    subtitle: input.subtitle ?? null,
    effectiveDate: input.effectiveDate,
    intro: input.subtitle ?? parsed.intro,
    contentMarkdown: content,
    sections: parsed.sections,
    contact: CONTACT,
    consent: `By using CallsChat, you agree to this ${input.title}.`,
    changelog: input.changelog ?? null,
    requiresReconsent: input.requiresReconsent ?? false,
    status: input.status,
    publishedAt: input.publishedAt ?? null,
    publishedBy: input.publishedAt ? SUPER_ID : null,
    createdByAdminId: SUPER_ID,
    createdAt: input.createdAt,
    updatedAt: input.publishedAt ?? input.createdAt,
  }
}

const PRIVACY_MD = `# Privacy Policy

CallsChat lets people talk using a CallsChat ID instead of a phone number. This sample text stands in for the real policy.

## 1. Information We Collect
We collect your account details and the minimum call metadata needed to connect calls.

Diagnostics are collected only when you opt in.

## 2. How We Use Information
To run the service, keep it safe, and process diamond purchases and host payouts.

## 3. Your Rights
You can export or delete your account at any time from Settings > Account.`

function makeDocs(): MockDoc[] {
  return [
    seedDoc({
      id: 'cmwlegalprivacy090000000001',
      documentType: 'PRIVACY_POLICY',
      version: '0.9.0',
      title: 'Privacy Policy',
      subtitle: 'CallsChat LLC • United States',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      markdown: PRIVACY_MD.replace('## 3. Your Rights', '## 3. Contact'),
      status: 'ARCHIVED',
      publishedAt: '2026-05-20T09:00:00.000Z',
      changelog: 'First version.',
      createdAt: '2026-05-18T09:00:00.000Z',
    }),
    seedDoc({
      id: 'cmwlegalprivacy100000000001',
      documentType: 'PRIVACY_POLICY',
      version: '1.0.0',
      title: 'Privacy Policy',
      subtitle: 'CallsChat LLC • United States',
      effectiveDate: '2026-10-01T00:00:00.000Z',
      markdown: PRIVACY_MD,
      status: 'PUBLISHED',
      publishedAt: '2026-09-25T10:00:00.000Z',
      requiresReconsent: true,
      changelog: 'Added the rights section.',
      createdAt: '2026-09-20T10:00:00.000Z',
    }),
    seedDoc({
      id: 'cmwlegalprivacy110000000001',
      documentType: 'PRIVACY_POLICY',
      version: '1.1.0',
      title: 'Privacy Policy',
      subtitle: 'CallsChat LLC • United States',
      effectiveDate: '2026-12-01T00:00:00.000Z',
      markdown: `${PRIVACY_MD}\n\n## 4. Live Streams\nLive audio rooms may be reviewed by moderators for safety.`,
      status: 'DRAFT',
      changelog: 'Explain live stream moderation.',
      createdAt: '2026-11-06T08:30:00.000Z',
    }),
    seedDoc({
      id: 'cmwlegalterms1000000000001',
      documentType: 'TERMS_OF_SERVICE',
      version: '1.0.0',
      title: 'Terms of Service',
      subtitle: 'CallsChat LLC • United States',
      effectiveDate: '2026-10-01T00:00:00.000Z',
      markdown: `# Terms of Service

These sample terms describe how CallsChat may be used.

## 1. Accounts
You must be at least 13 to use CallsChat.

## 2. Diamonds and Gifts
Diamonds have no cash value outside the host payout programme.

## 3. Conduct
No harassment, spam or illegal content.`,
      status: 'PUBLISHED',
      publishedAt: '2026-09-25T10:05:00.000Z',
      createdAt: '2026-09-20T10:05:00.000Z',
    }),
    seedDoc({
      id: 'cmwlegalcookie100000000001',
      documentType: 'COOKIE_POLICY',
      version: '1.0.0',
      title: 'Cookie Policy',
      effectiveDate: '2027-01-01T00:00:00.000Z',
      markdown: `# Cookie Policy

Sample cookie disclosure.

## 1. Essential Cookies
Keep you signed in.

## 2. Analytics
Only with your consent.`,
      status: 'PUBLISHED',
      publishedAt: '2026-11-01T12:00:00.000Z',
      createdAt: '2026-10-30T12:00:00.000Z',
    }),
    /*
     * Business (plan.md LB1): nothing published yet, as on staging, and one
     * draft — numbered 1.0.0 even though Personal Privacy is past it,
     * because each app numbers its own versions.
     */
    seedDoc({
      id: 'cmwlegalbizprivacy10000001',
      documentType: 'PRIVACY_POLICY',
      appType: 'BUSINESS',
      version: '1.0.0',
      title: 'Business Privacy Policy',
      subtitle: 'CallsChat LLC • Business & Corporate Solutions • United States',
      effectiveDate: '2027-01-01T00:00:00.000Z',
      markdown: `# Business Privacy Policy

CallsChat Business provides workspaces for organisations. This sample text stands in for the real policy.

## 1. About CallsChat Business
Organisations use CallsChat Business to talk with their customers and teams.

## 2. Data Processor Obligations
CallsChat processes workspace data only on the Workspace Owner's instructions.`,
      status: 'DRAFT',
      changelog: 'First Business version.',
      createdAt: '2026-11-16T09:00:00.000Z',
    }),
  ]
}

let docs = makeDocs()
let sequence = 0

export function resetMockLegal(): void {
  docs = makeDocs()
  sequence = 0
}

/* ------------------------------------------------------------------ *
 * Guards and validation — messages copied from staging
 * ------------------------------------------------------------------ */

function guard(): Response | null {
  const admin = currentMockAdmin()
  if (!admin)
    return errorResponse(
      401,
      'UNAUTHORIZED',
      'Missing or malformed Authorization token',
    )
  /* `verifyAdmin` admits MODERATOR too, per the guide (plan.md O7). */
  if (!['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(admin.role)) {
    return errorResponse(403, 'FORBIDDEN', 'Access Denied')
  }
  return null
}

async function prelude(): Promise<Response | null> {
  return (await applyScenario()) ?? guard()
}

function enumMessage(
  where: string,
  field: string,
  values: readonly string[],
  received: unknown,
) {
  return `${where}/${field} Invalid enum value. Expected ${values
    .map((value) => `'${value}'`)
    .join(' | ')}, received '${String(received)}'`
}

function intCheck(field: string, raw: string | null, max?: number) {
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value))
    return `querystring/${field} Expected number, received nan`
  if (value < 1) return `querystring/${field} Number must be greater than or equal to 1`
  if (max && value > max)
    return `querystring/${field} Number must be less than or equal to ${max}`
  return null
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text()
  if (!text) {
    return request.headers.get('content-type')?.includes('application/json')
      ? errorResponse(
          400,
          'FST_ERR_CTP_EMPTY_JSON_BODY' as never,
          "Body cannot be empty when content-type is set to 'application/json'",
        )
      : {}
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : errorResponse(400, VALIDATION, 'body must be object')
  } catch {
    return errorResponse(400, VALIDATION, 'body must be object')
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  issues: string[],
) {
  const value = body[field]
  if (value !== undefined && typeof value !== 'string')
    issues.push(`body/${field} Expected string, received ${typeName(value)}`)
}

function contactIssues(value: unknown, issues: string[]) {
  if (value === undefined) return
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`body/contact Expected object, received ${typeName(value)}`)
    return
  }
  const contact = value as Record<string, unknown>
  if (contact['org'] === undefined) issues.push('body/contact/org Required')
  else if (typeof contact['org'] !== 'string')
    issues.push(
      `body/contact/org Expected string, received ${typeName(contact['org'])}`,
    )
  const emails = contact['emails']
  if (emails === undefined) issues.push('body/contact/emails Required')
  else if (!Array.isArray(emails))
    issues.push(`body/contact/emails Expected array, received ${typeName(emails)}`)
  else if (emails.length === 0)
    issues.push('body/contact/emails At least one contact email is required')
  else
    emails.forEach((entry: unknown, index) => {
      const email = (entry ?? {}) as Record<string, unknown>
      if (typeof email['label'] !== 'string')
        issues.push(`body/contact/emails/${index}/label Required`)
      if (typeof email['address'] !== 'string')
        issues.push(`body/contact/emails/${index}/address Required`)
      else if (!EMAIL.test(email['address']))
        issues.push(`body/contact/emails/${index}/address Invalid email address format`)
    })
}

function contactOf(value: unknown): MockContact {
  const contact = value as MockContact
  return {
    org: contact.org,
    ...(contact.location ? { location: contact.location } : {}),
    emails: contact.emails.map(({ label, address }) => ({ label, address })),
    ...(contact.website ? { website: contact.website } : {}),
  }
}

function isIso(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function find(id: unknown): MockDoc | undefined {
  return docs.find((doc) => doc.id === id)
}

function notFound() {
  return errorResponse(404, 'NOT_FOUND', 'Legal document not found')
}

function locked(doc: MockDoc, verb: string) {
  return errorResponse(
    400,
    'BAD_REQUEST',
    `Cannot ${verb} a ${doc.status.toLowerCase()} legal document. Create a new draft version instead.`,
  )
}

function newId() {
  sequence += 1
  return `cmwlegalmock${Date.now().toString(36)}${sequence.toString().padStart(4, '0')}`
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const legalHandlers = [
  http.get(BASE, async ({ request }) => {
    const blocked = await prelude()
    if (blocked) return blocked

    const url = new URL(request.url)
    const type = url.searchParams.get('documentType')
    const app = url.searchParams.get('appType')
    const status = url.searchParams.get('status')
    const issues = [
      type !== null && !(TYPES as readonly string[]).includes(type)
        ? enumMessage('querystring', 'documentType', TYPES, type)
        : null,
      app !== null && !(APPS as readonly string[]).includes(app)
        ? enumMessage('querystring', 'appType', APPS, app)
        : null,
      status !== null && !(STATUSES as readonly string[]).includes(status)
        ? enumMessage('querystring', 'status', STATUSES, status)
        : null,
      intCheck('page', url.searchParams.get('page')),
      intCheck('limit', url.searchParams.get('limit'), 50),
    ].filter(Boolean)
    if (issues.length) return errorResponse(400, VALIDATION, issues.join(', '))

    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    /* `search` is deliberately ignored, as on staging. */
    const rows = isEmptyScenario()
      ? []
      : docs
          .filter((doc) => !type || doc.documentType === type)
          .filter((doc) => !app || doc.appType === app)
          .filter((doc) => !status || doc.status === status)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const total = rows.length
    return HttpResponse.json({
      success: true,
      data: rows.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  }),

  http.get(`${BASE}/:id`, async ({ params }) => {
    const blocked = await prelude()
    if (blocked) return blocked
    const doc = find(params['id'])
    return doc ? HttpResponse.json({ success: true, data: doc }) : notFound()
  }),

  http.post(BASE, async ({ request }) => {
    const blocked = await prelude()
    if (blocked) return blocked
    const body = await readBody(request)
    if (body instanceof Response) return body

    const issues: string[] = []
    const type = body['documentType']
    if (type === undefined) issues.push('body/documentType Required')
    else if (!(TYPES as readonly unknown[]).includes(type))
      issues.push(enumMessage('body', 'documentType', TYPES, type))
    const appType = body['appType']
    if (appType !== undefined && !(APPS as readonly unknown[]).includes(appType))
      issues.push(enumMessage('body', 'appType', APPS, appType))
    const version = body['version']
    if (version === undefined) issues.push('body/version Required')
    else if (typeof version !== 'string' || !SEMVER.test(version))
      issues.push('body/version Version must follow SemVer format (e.g. 1.0.0, 2.1.0)')
    const title = body['title']
    if (title === undefined) issues.push('body/title Required')
    else if (typeof title !== 'string' || !title.trim())
      issues.push('body/title Document title is required')
    optionalString(body, 'subtitle', issues)
    const effective = body['effectiveDate']
    if (effective === undefined) issues.push('body/effectiveDate Required')
    else if (!isIso(effective))
      issues.push('body/effectiveDate effectiveDate must be a valid ISO 8601 string')
    const content = body['contentMarkdown']
    if (content === undefined) issues.push('body/contentMarkdown Required')
    else if (typeof content !== 'string' || content.length < 10)
      issues.push('body/contentMarkdown contentMarkdown must be at least 10 characters')
    contactIssues(body['contact'], issues)
    optionalString(body, 'consent', issues)
    optionalString(body, 'changelog', issues)
    if (
      body['requiresReconsent'] !== undefined &&
      typeof body['requiresReconsent'] !== 'boolean'
    )
      issues.push(
        `body/requiresReconsent Expected boolean, received ${typeName(body['requiresReconsent'])}`,
      )
    if (issues.length) return errorResponse(400, VALIDATION, issues.join(', '))

    const docType = type as DocType
    const docApp: App = appType === undefined ? 'PERSONAL' : (appType as App)
    if (
      docs.some(
        (doc) =>
          doc.documentType === docType &&
          doc.appType === docApp &&
          doc.version === version,
      )
    ) {
      return errorResponse(
        409,
        'CONFLICT',
        `A document for "${docType}" (${docApp}) with version "${String(version)}" already exists.`,
      )
    }

    const markdown = sanitize(content as string)
    const parsed = parse(markdown)
    const subtitle = typeof body['subtitle'] === 'string' ? body['subtitle'] : null
    const now = new Date().toISOString()
    const doc: MockDoc = {
      id: newId(),
      documentType: docType,
      appType: docApp,
      slug: SLUGS[docApp][docType],
      version: version as string,
      title: title as string,
      subtitle,
      effectiveDate: effective as string,
      /* ⚠️ Server quirk on create: a subtitle wins over the parsed intro (O5). */
      intro: subtitle ?? parsed.intro,
      contentMarkdown: markdown,
      sections: parsed.sections,
      contact: body['contact'] === undefined ? null : contactOf(body['contact']),
      consent: typeof body['consent'] === 'string' ? body['consent'] : null,
      changelog: typeof body['changelog'] === 'string' ? body['changelog'] : null,
      requiresReconsent: body['requiresReconsent'] === true,
      status: 'DRAFT',
      publishedAt: null,
      publishedBy: null,
      createdByAdminId: currentMockAdmin()?.id ?? SUPER_ID,
      createdAt: now,
      updatedAt: now,
    }
    docs.push(doc)
    return HttpResponse.json(
      {
        success: true,
        message: 'Legal document draft created successfully',
        data: doc,
      },
      { status: 201 },
    )
  }),

  http.put(`${BASE}/:id`, async ({ params, request }) => {
    const blocked = await prelude()
    if (blocked) return blocked
    const body = await readBody(request)
    if (body instanceof Response) return body

    const issues: string[] = []
    if (body['title'] !== undefined) {
      if (typeof body['title'] !== 'string')
        issues.push(`body/title Expected string, received ${typeName(body['title'])}`)
      else if (!body['title'].trim())
        issues.push('body/title Document title is required')
    }
    optionalString(body, 'subtitle', issues)
    const moveTo = body['appType']
    if (moveTo !== undefined && !(APPS as readonly unknown[]).includes(moveTo))
      issues.push(enumMessage('body', 'appType', APPS, moveTo))
    if (body['effectiveDate'] !== undefined && !isIso(body['effectiveDate']))
      issues.push('body/effectiveDate Invalid datetime')
    const content = body['contentMarkdown']
    if (content !== undefined && (typeof content !== 'string' || content.length < 10))
      issues.push('body/contentMarkdown contentMarkdown must be at least 10 characters')
    contactIssues(body['contact'], issues)
    optionalString(body, 'consent', issues)
    optionalString(body, 'changelog', issues)
    if (
      body['requiresReconsent'] !== undefined &&
      typeof body['requiresReconsent'] !== 'boolean'
    )
      issues.push(
        `body/requiresReconsent Expected boolean, received ${typeName(body['requiresReconsent'])}`,
      )
    if (issues.length) return errorResponse(400, VALIDATION, issues.join(', '))

    const doc = find(params['id'])
    if (!doc) return notFound()
    if (doc.status !== 'DRAFT') return locked(doc, 'edit')

    /* `version` and `documentType` are silently ignored, as on staging. */
    /* ⚠️ `appType` moves the draft and leaves the slug behind (plan.md B1). */
    if (moveTo !== undefined) doc.appType = moveTo as App
    if (typeof body['title'] === 'string') doc.title = body['title']
    if (typeof body['subtitle'] === 'string') doc.subtitle = body['subtitle']
    if (typeof body['effectiveDate'] === 'string')
      doc.effectiveDate = body['effectiveDate']
    if (typeof content === 'string') {
      doc.contentMarkdown = sanitize(content)
      const parsed = parse(doc.contentMarkdown)
      doc.intro = parsed.intro
      doc.sections = parsed.sections
    }
    if (body['contact'] !== undefined) doc.contact = contactOf(body['contact'])
    if (typeof body['consent'] === 'string') doc.consent = body['consent']
    if (typeof body['changelog'] === 'string') doc.changelog = body['changelog']
    if (typeof body['requiresReconsent'] === 'boolean')
      doc.requiresReconsent = body['requiresReconsent']
    doc.updatedAt = new Date().toISOString()
    return HttpResponse.json({
      success: true,
      message: 'Legal document draft updated successfully',
      data: doc,
    })
  }),

  http.post(`${BASE}/:id/publish`, async ({ params, request }) => {
    const blocked = await prelude()
    if (blocked) return blocked
    const body = await readBody(request)
    if (body instanceof Response) return body

    const issues: string[] = []
    if (body['effectiveDate'] !== undefined && !isIso(body['effectiveDate']))
      issues.push('body/effectiveDate Invalid datetime')
    if (
      body['requiresReconsent'] !== undefined &&
      typeof body['requiresReconsent'] !== 'boolean'
    )
      issues.push(
        `body/requiresReconsent Expected boolean, received ${typeName(body['requiresReconsent'])}`,
      )
    optionalString(body, 'changelog', issues)
    if (issues.length) return errorResponse(400, VALIDATION, issues.join(', '))

    const doc = find(params['id'])
    if (!doc) return notFound()
    if (doc.status !== 'DRAFT') return locked(doc, 'publish')

    const now = new Date().toISOString()
    for (const other of docs) {
      if (
        other.documentType === doc.documentType &&
        other.appType === doc.appType &&
        other.status === 'PUBLISHED'
      ) {
        other.status = 'ARCHIVED'
        other.updatedAt = now
      }
    }
    if (typeof body['effectiveDate'] === 'string')
      doc.effectiveDate = body['effectiveDate']
    if (typeof body['requiresReconsent'] === 'boolean')
      doc.requiresReconsent = body['requiresReconsent']
    if (typeof body['changelog'] === 'string') doc.changelog = body['changelog']
    doc.status = 'PUBLISHED'
    doc.publishedAt = now
    doc.publishedBy = currentMockAdmin()?.id ?? SUPER_ID
    doc.updatedAt = now
    return HttpResponse.json({
      success: true,
      message: 'Legal document published successfully',
      data: {
        id: doc.id,
        status: doc.status,
        publishedAt: doc.publishedAt,
        publishedBy: doc.publishedBy,
      },
    })
  }),

  http.delete(`${BASE}/:id`, async ({ params }) => {
    const blocked = await prelude()
    if (blocked) return blocked
    const doc = find(params['id'])
    if (!doc) return notFound()
    if (doc.status !== 'DRAFT') return locked(doc, 'delete')
    docs = docs.filter((other) => other.id !== doc.id)
    return HttpResponse.json({
      success: true,
      message: 'Legal document draft deleted successfully',
      data: { id: doc.id },
    })
  }),

  /* Public, no auth. Registered after the admin routes; `consent` is not mocked. */
  http.get(`${PUBLIC}/:slug`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const asked = String(params['slug'])
    const app = new URL(request.url).searchParams.get('appType')
    if (app !== null && !(APPS as readonly string[]).includes(app)) {
      return errorResponse(
        400,
        VALIDATION,
        enumMessage('querystring', 'appType', APPS, app),
      )
    }
    /*
     * `?appType=BUSINESS` swaps a Personal slug for the Business one of the
     * same type, as staging does (`privacy-policy` → `business-privacy-policy`).
     */
    const type = TYPES.find((value) => SLUGS.PERSONAL[value] === asked)
    const slug = app === 'BUSINESS' && type ? SLUGS.BUSINESS[type] : asked
    /*
     * ⚠️ Business Cookie and Community share Personal's slug (B2); which one a
     * bare slug returns on the server is unknown. Here the app decides, and
     * Personal wins without one.
     */
    const doc = docs.find(
      (row) =>
        row.slug === slug &&
        row.status === 'PUBLISHED' &&
        row.appType ===
          (app ?? (row.slug.startsWith('business-') ? 'BUSINESS' : 'PERSONAL')),
    )
    if (!doc) {
      return errorResponse(
        404,
        'NOT_FOUND',
        `Legal document "${slug}" not found or not published.`,
      )
    }
    return HttpResponse.json({ success: true, data: { ...doc, _cached: false } })
  }),
]
