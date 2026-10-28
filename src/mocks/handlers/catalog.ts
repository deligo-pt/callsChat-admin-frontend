import { http, HttpResponse } from 'msw'

import { API_PREFIX, applyScenario, errorResponse, isEmptyScenario } from './shared'

/**
 * Emoji & Virtual Gift catalog — a mock of a backend that, for once, holds
 * real data (plan.md §2, phase G1).
 *
 * Measured against `https://test-api.callschat.com/api/v1` on 2026-10-28.
 * Everything reproduced here was observed, **including the defects**:
 *
 *   - every seeded gift is `priceDiamonds: 0`, and the write schema refuses
 *     `0` — the live catalog is in a state its own validator rejects;
 *   - `iconUrl === animationUrl` and both are `.json`: there is no thumbnail;
 *   - URLs are root-relative, while `upload-url` returns absolute ones;
 *   - `?isActive=` on gifts is **ignored**;
 *   - the ledger has **no bounds checking** — `limit=0` and `page=0` are 200s;
 *   - a duplicate shortcode says *"this unknown field"*, naming nothing;
 *   - delete is a soft delete, and `PATCH {isActive:true}` reverses it.
 *
 * ⚠️ **Seeded by default, unlike the host and wallet mocks.** Those were empty
 * because production was empty. This catalog is populated on every
 * environment, so an empty default would be the unfaithful choice —
 * `resetMockCatalog()` empties it for the empty-state tests instead.
 */

const VALIDATION = 'FST_ERR_VALIDATION' as const
const NOT_FOUND = 'NOT_FOUND' as const
const ALREADY_EXISTS = 'RECORD_ALREADY_EXISTS' as const
const BAD_REQUEST = 'BAD_REQUEST' as const
const FOREIGN_KEY = 'FOREIGN_KEY_CONSTRAINT' as const

/** Measured on gift and category names alike, 2026-10-28. */
const MAX_NAME = 100

const EMOJI_TYPES = ['STATIC', 'ANIMATED']
const SHORTCODE_ERROR =
  'body/shortcode Shortcode must be in format :name:, lowercase alphanumeric and underscores'
const TAKEN = 'A record with this unknown field already exists.'

/** Pack and emoji body checks, in the live wording (G4, measured 2026-10-28). */
function packNameIssue(name: unknown): string | null {
  if (typeof name !== 'string') return null
  if (name.length < 2) return 'body/name Pack name must be at least 2 characters'
  if (name.length > MAX_NAME)
    return 'body/name String must contain at most 100 character(s)'
  return null
}

function emojiFieldIssues(item: Record<string, unknown> | null | undefined): string[] {
  const issues: string[] = []
  const name = item?.['name']
  if (typeof name === 'string' && name.length > MAX_NAME)
    issues.push('body/name String must contain at most 100 character(s)')
  const type = item?.['type']
  if (typeof type === 'string' && !EMOJI_TYPES.includes(type)) {
    issues.push(
      `body/type Invalid enum value. Expected 'STATIC' | 'ANIMATED', received '${type}'`,
    )
  }
  const shortcode = item?.['shortcode']
  if (typeof shortcode === 'string' && !/^:[a-z0-9_]+:$/.test(shortcode))
    issues.push(SHORTCODE_ERROR)
  return issues
}

/**
 * ⚠️ **Unique across every pack, inactive emojis included** — measured: a
 * deactivated emoji still blocks its shortcode.
 */
function shortcodeTaken(shortcode: string, exceptId?: string): boolean {
  return emojis.some((row) => row.shortcode === shortcode && row.id !== exceptId)
}

/** The server's enum, from its own error message. */
const ANIMATION_TYPES = ['LOTTIE', 'WEBP', 'MP4']

/**
 * The checks the live gift routes run on a body, in their wording (G3).
 * ⚠️ `iconUrl` is checked only as "a URL" — the live route accepted
 * `javascript:alert(1)`, and so does this. The panel must not rely on it.
 */
function giftFieldIssues(body: Record<string, unknown> | null): string[] {
  const issues: string[] = []
  const name = body?.['name']
  if (typeof name === 'string' && name.length < 1)
    issues.push('body/name String must contain at least 1 character(s)')
  if (typeof name === 'string' && name.length > MAX_NAME)
    issues.push('body/name String must contain at most 100 character(s)')
  const price = body?.['priceDiamonds']
  if (typeof price === 'number' && !Number.isInteger(price))
    issues.push('body/priceDiamonds Expected integer, received float')
  const type = body?.['animationType']
  if (typeof type === 'string' && !ANIMATION_TYPES.includes(type)) {
    issues.push(
      `body/animationType Invalid enum value. Expected 'LOTTIE' | 'WEBP' | 'MP4', received '${type}'`,
    )
  }
  return issues
}

const FOREIGN_KEY_MESSAGE =
  'Operation failed due to a foreign key constraint. The referenced record does not exist.'

/** Every byte "uploaded" to the mock storage host, for tests to inspect. */
let storageUploads: { url: string; contentType: string | null; size: number }[] = []

const CATEGORIES = `${API_PREFIX}/admin/gifts/categories`
const GIFTS = `${API_PREFIX}/admin/gifts`
const TRANSACTIONS = `${API_PREFIX}/admin/gifts/transactions`
const PACKS = `${API_PREFIX}/admin/emoji/packs`
const EMOJIS = `${API_PREFIX}/admin/emoji/emojis`
const UPLOAD_URL = `${API_PREFIX}/admin/catalog/upload-url`
const VERSION = `${API_PREFIX}/catalog/version`

/** The real media path shape — root-relative, `.json`, no thumbnail. */
const asset = (folder: string, file: string) =>
  `/api/v1/media/download/catalog/${folder}/${file}.json`

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

interface MockGift {
  id: string
  categoryId: string
  name: string
  iconUrl: string
  animationUrl: string
  animationType: string
  priceDiamonds: number
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface MockCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface MockEmoji {
  id: string
  packId: string
  name: string
  shortcode: string
  fileUrl: string
  type: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface MockPack {
  id: string
  name: string
  coverUrl: string
  sortOrder: number
  isActive: boolean
  isPremium: boolean
  createdAt: string
  updatedAt: string
}

interface MockTransaction {
  id: string
  giftId: string
  senderId: string
  receiverId: string
  contextType: string
  contextId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  hostEarnings: number
  status: string
  idempotencyKey: string
  snapshotName: string
  snapshotIconUrl: string
  snapshotAnimationUrl: string
  createdAt: string
}

const T0 = '2026-10-24T11:38:05.365Z'
const T1 = '2026-10-24T14:52:02.241Z'

function seedCategories(): MockCategory[] {
  return [
    {
      id: 'cat_popular',
      name: 'Popular Gifts',
      sortOrder: 0,
      isActive: true,
      createdAt: T0,
      updatedAt: T1,
    },
    {
      id: 'cat_luxury',
      name: 'VIP Luxuries',
      sortOrder: 1,
      isActive: true,
      createdAt: T0,
      updatedAt: T1,
    },
    {
      id: 'cat_fx',
      name: 'Super Stage FX',
      sortOrder: 2,
      isActive: true,
      createdAt: T0,
      updatedAt: T1,
    },
    /*
     * ⚠️ An inactive category, which the live list also carries. The admin
     * list is not the storefront: a deactivated row must stay visible or
     * nobody can switch it back on.
     */
    {
      id: 'cat_retired',
      name: '[TEST] Retired Set',
      sortOrder: 99,
      isActive: false,
      createdAt: T0,
      updatedAt: T1,
    },
  ]
}

function gift(
  id: string,
  categoryId: string,
  name: string,
  file: string,
  sortOrder: number,
  priceDiamonds = 0,
): MockGift {
  return {
    id,
    categoryId,
    name,
    /* ⚠️ Identical, and `.json`. Measured on all 8 live gifts. */
    iconUrl: asset('gifts', file),
    animationUrl: asset('gifts', file),
    animationType: 'LOTTIE',
    priceDiamonds,
    sortOrder,
    isActive: true,
    createdAt: T0,
    updatedAt: T1,
  }
}

function seedGifts(): MockGift[] {
  return [
    gift('gift-heart_icon', 'cat_popular', 'Heart Icon', 'heart_icon', 0),
    gift('gift-rose_bouquet', 'cat_popular', 'Rose Bouquet', 'rose_bouquet', 1),
    gift('gift-chocolate_box', 'cat_popular', 'Chocolate Box', 'chocolate_box', 2),
    gift('gift-teddy_bear', 'cat_luxury', 'Teddy Bear', 'teddy_bear', 0),
    gift('gift-heart_lock', 'cat_luxury', 'Heart Lock', 'heart_lock', 1),
    gift('gift-love_potion', 'cat_luxury', 'Love Potion', 'love_potion', 2),
    gift('gift-winged_heart', 'cat_fx', 'Winged Heart', 'winged_heart', 0),
    gift('gift-love_guitar', 'cat_fx', 'Love Guitar', 'love_guitar', 1),
    /*
     * ⚠️ The hostile fixture. A `javascript:` icon on a record an operator
     * must look at to decide anything, and a name long enough to break a grid
     * cell. The live catalog has nothing like it — which is exactly why the
     * mock must.
     */
    {
      ...gift('gift-hostile', 'cat_fx', 'X'.repeat(400), 'ignored', 99, 25),
      iconUrl: 'javascript:alert(document.domain)',
      animationUrl: 'javascript:alert(document.domain)',
    },
  ]
}

function seedPacks(): MockPack[] {
  return [
    {
      id: 'pack_animated_expressions',
      name: 'Official Emojis',
      coverUrl: asset('emojis', 'heart_eyes'),
      sortOrder: 0,
      isActive: true,
      isPremium: false,
      createdAt: T0,
      updatedAt: T1,
    },
    /* ⚠️ A premium pack, and an empty one — neither exists live yet. */
    {
      id: 'pack_premium_empty',
      name: '[TEST] Premium Empty',
      coverUrl: asset('emojis', 'blushing'),
      sortOrder: 1,
      isActive: true,
      isPremium: true,
      createdAt: T0,
      updatedAt: T1,
    },
  ]
}

function seedEmojis(): MockEmoji[] {
  const names = ['blushing', 'cool_sunglasses', 'heart_eyes', 'loudly_crying']
  return names.map((file, index) => ({
    id: `emoji_${file}`,
    packId: 'pack_animated_expressions',
    name: file.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    shortcode: `:${file}:`,
    fileUrl: asset('emojis', file),
    type: 'ANIMATED',
    sortOrder: index,
    isActive: true,
    createdAt: T0,
    updatedAt: T1,
  }))
}

/** The two live parties' ids and names, so a joined row names the right person. */
export const MOCK_LEDGER_SENDER = 'cmv6ekev300t901o5lz8yjf49'
export const MOCK_LEDGER_RECEIVER = 'cmv5jz04e000201o5mtu3alad'
const PARTY_NAMES: Record<string, string> = {
  [MOCK_LEDGER_SENDER]: 'call chat',
  [MOCK_LEDGER_RECEIVER]: 'App Developer',
}

function seedTransactions(): MockTransaction[] {
  const SENDER = MOCK_LEDGER_SENDER
  const RECEIVER = MOCK_LEDGER_RECEIVER

  return Array.from({ length: 22 }, (_, index) => ({
    id: `txn_${String(index).padStart(3, '0')}`,
    giftId: 'gift-chocolate_box',
    /* ⚠️ Mixed directions, so `senderId` and `receiverId` filter differently. */
    senderId: index % 3 === 0 ? RECEIVER : SENDER,
    receiverId: index % 3 === 0 ? SENDER : RECEIVER,
    contextType: 'LIVE_ROOM',
    contextId: 'cmvph9tft00kp01p68mid7a91',
    /* Live quantities seen: 1, 5, 10, 99. */
    quantity: index === 5 ? 10 : index === 7 ? 99 : 1,
    /* ⚠️ Zero on every live row — the catalog is free (plan.md O1, O2). */
    unitPrice: 0,
    totalPrice: 0,
    hostEarnings: 0,
    status: 'SUCCESS',
    idempotencyKey: `key-${index}`,
    /*
     * ⚠️ The snapshot deliberately DIFFERS from the live gift's name. A row
     * rendering "Chocolate Box" instead of this is reading the live record,
     * which is the defect this fixture exists to catch.
     */
    snapshotName: 'Chocolate Box (as sent)',
    snapshotIconUrl: asset('gifts', 'chocolate_box'),
    snapshotAnimationUrl: asset('gifts', 'chocolate_box'),
    createdAt: new Date(Date.UTC(2026, 9, 26, 16, index)).toISOString(),
  }))
}

let categories: MockCategory[] = seedCategories()
let gifts: MockGift[] = seedGifts()
let packs: MockPack[] = seedPacks()
let emojis: MockEmoji[] = seedEmojis()
let transactions: MockTransaction[] = seedTransactions()
let giftVersion = 11
let emojiVersion = 6

/** Restore the populated default — what every environment actually holds. */
export function resetMockCatalog(): void {
  categories = seedCategories()
  gifts = seedGifts()
  packs = seedPacks()
  emojis = seedEmojis()
  transactions = seedTransactions()
  storageUploads = []
  giftVersion = 11
  emojiVersion = 6
}

/** Empty everything, for the states an operator meets on a fresh deployment. */
export function emptyMockCatalog(): void {
  categories = []
  gifts = []
  packs = []
  emojis = []
  transactions = []
}

/** Mutable on purpose: tests price rows to show what a paid catalog would. */
export function mockTransactions(): MockTransaction[] {
  return transactions
}
export function mockGifts(): readonly MockGift[] {
  return gifts
}
export function mockGiftCategories(): readonly MockCategory[] {
  return categories
}
export function mockEmojiPacks(): readonly MockPack[] {
  return packs
}
export function mockEmojis(): readonly MockEmoji[] {
  return emojis
}
export function mockStorageUploads(): readonly {
  url: string
  contentType: string | null
  size: number
}[] {
  return storageUploads
}

export function mockCatalogVersions(): { gift: number; emoji: number } {
  return { gift: giftVersion, emoji: emojiVersion }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json()
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return null
  }
}

function now(): string {
  return new Date().toISOString()
}

/** Reorder shares one body shape across all four routes — measured. */
function applyReorder(
  body: Record<string, unknown> | null,
  rows: Array<{ id: string; sortOrder: number; updatedAt: string }>,
): Response | null {
  const items = body?.['items']
  if (!Array.isArray(items)) {
    return errorResponse(400, VALIDATION, 'body/items Required')
  }
  if (items.length === 0) {
    return errorResponse(
      400,
      VALIDATION,
      'body/items At least one item must be supplied for reordering',
    )
  }

  for (const [index, raw] of items.entries()) {
    const item = raw as Record<string, unknown>
    if (typeof item['sortOrder'] === 'undefined') {
      return errorResponse(400, VALIDATION, `body/items/${index}/sortOrder Required`)
    }
    if (typeof item['sortOrder'] !== 'number') {
      return errorResponse(
        400,
        VALIDATION,
        `body/items/${index}/sortOrder Expected number, received ${typeof item['sortOrder']}`,
      )
    }
  }

  for (const raw of items) {
    const item = raw as { id?: string; sortOrder?: number }
    const row = rows.find((candidate) => candidate.id === item.id)
    if (row && typeof item.sortOrder === 'number') {
      row.sortOrder = item.sortOrder
      row.updatedAt = now()
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

export const catalogHandlers = [
  /** `GET /catalog/version`. */
  http.get(VERSION, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    return HttpResponse.json({
      success: true,
      data: { giftVersion, emojiVersion, updatedAt: now() },
    })
  }),

  /*
   * ⚠️ `/reorder` is registered BEFORE `/:id`, on every pair. MSW matches in
   * order, and `/categories/:id` would otherwise swallow `/categories/reorder`
   * and answer a 404 for a route that exists — the exact defect the live
   * backend has on `/host-applications/stats` (previous plan, O1).
   */
  http.patch(`${CATEGORIES}/reorder`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const failure = applyReorder(await readBody(request), categories)
    if (failure) return failure
    giftVersion += 1
    return HttpResponse.json({
      success: true,
      message: 'Categories reordered successfully.',
    })
  }),

  http.get(CATEGORIES, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: isEmptyScenario()
        ? []
        : categories.map((category) => ({
            ...category,
            /* ⚠️ Nested by the server — the category list is also a gift list. */
            gifts: gifts
              .filter((row) => row.categoryId === category.id)
              .sort((a, b) => a.sortOrder - b.sortOrder),
          })),
    })
  }),

  http.post(CATEGORIES, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const name = body?.['name']
    if (typeof name !== 'string') {
      return errorResponse(400, VALIDATION, 'body/name Required')
    }
    if (name.length < 2) {
      return errorResponse(
        400,
        VALIDATION,
        'body/name Category name must be at least 2 characters',
      )
    }
    if (name.length > MAX_NAME) {
      return errorResponse(
        400,
        VALIDATION,
        'body/name String must contain at most 100 character(s)',
      )
    }

    const created: MockCategory = {
      id: `cat_${Date.now().toString(36)}`,
      name,
      sortOrder: (body?.['sortOrder'] as number | undefined) ?? categories.length,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    }
    categories.push(created)
    giftVersion += 1

    return HttpResponse.json(
      { success: true, message: 'Gift category created successfully.', data: created },
      { status: 201 },
    )
  }),

  http.patch(`${CATEGORIES}/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    /*
     * ⚠️ Validation runs BEFORE the lookup, as it does live: a malformed body
     * against an unknown id answers 400, not 404.
     */
    const name = body?.['name']
    if (typeof name === 'string' && name.length < 2) {
      return errorResponse(
        400,
        VALIDATION,
        'body/name Category name must be at least 2 characters',
      )
    }
    if (typeof name === 'string' && name.length > MAX_NAME) {
      return errorResponse(
        400,
        VALIDATION,
        'body/name String must contain at most 100 character(s)',
      )
    }

    const row = categories.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Gift category not found')

    if (typeof name === 'string') row.name = name
    if (typeof body?.['sortOrder'] === 'number') row.sortOrder = body['sortOrder']
    /* ⚠️ Reactivation — verified live, a soft delete is reversible. */
    if (typeof body?.['isActive'] === 'boolean') row.isActive = body['isActive']
    row.updatedAt = now()
    giftVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Gift category updated successfully.',
      data: row,
    })
  }),

  /** ⚠️ Soft delete: `isActive: false`, the row stays listed. */
  http.delete(`${CATEGORIES}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = categories.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Gift category not found')

    row.isActive = false
    row.updatedAt = now()
    giftVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Gift category deactivated successfully.',
      data: row,
    })
  }),

  /* ---------------------------- gifts ---------------------------- */

  http.patch(`${GIFTS}/reorder`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const failure = applyReorder(await readBody(request), gifts)
    if (failure) return failure
    giftVersion += 1
    return HttpResponse.json({
      success: true,
      message: 'Gifts reordered successfully.',
    })
  }),

  /** ⚠️ Registered before `/:id`, and before `/transactions` is matched. */
  http.get(TRANSACTIONS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const url = new URL(request.url)
    const senderId = url.searchParams.get('senderId')
    const receiverId = url.searchParams.get('receiverId')
    const contextId = url.searchParams.get('contextId')

    /*
     * ⚠️ **No bounds checking, reproduced deliberately.** `limit=0` and
     * `page=0` answer 200 on the live backend (plan.md O5), so a mock that
     * rejected them would be better behaved than the server and would hide
     * the reason the client clamps.
     */
    const numeric = (key: string, fallback: number) => {
      /* Live: `limit=abc` falls back to the default rather than failing. */
      const value = Number(url.searchParams.get(key) ?? fallback)
      return Number.isFinite(value) ? value : fallback
    }
    const limit = numeric('limit', 20)
    const page = numeric('page', 1)

    const rows = isEmptyScenario()
      ? []
      : transactions
          .filter((row) => {
            if (senderId && row.senderId !== senderId) return false
            if (receiverId && row.receiverId !== receiverId) return false
            if (contextId && row.contextId !== contextId) return false
            /*
             * ⚠️ `userId`, `giftId`, `contextType` and `status` are deliberately
             * NOT honoured — the live service accepts and ignores them, and a
             * mock that filtered would make a dead control look alive.
             */
            return true
          })
          /* Live: newest first, always — `sortBy` / `sortOrder` are ignored. */
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const size = limit > 0 ? limit : rows.length
    const start = Math.max(0, (page - 1) * size)

    /*
     * ⚠️ **The live row carries BOTH the snapshot and the current records.**
     * Joined at response time rather than stored on the fixture, so the live
     * gift's name genuinely tracks the catalog — which is what makes the
     * "render the snapshot, not the live gift" test meaningful: rename the
     * gift and the two values diverge, exactly as they would in production.
     */
    const joined = rows.slice(start, start + size).map((row) => ({
      ...row,
      gift: gifts.find((g) => g.id === row.giftId) ?? null,
      sender: {
        id: row.senderId,
        displayName: PARTY_NAMES[row.senderId] ?? null,
        avatarUrl: 'avatars/default-avatar.png',
        equippedFrame: null,
      },
      receiver: {
        id: row.receiverId,
        displayName: PARTY_NAMES[row.receiverId] ?? null,
        avatarUrl: `avatars/avatar_${row.receiverId}.jpg`,
      },
    }))

    return HttpResponse.json({
      success: true,
      data: joined,
      pagination: {
        page: page > 0 ? page : 1,
        limit: limit > 0 ? limit : rows.length,
        total: rows.length,
        totalPages: size > 0 ? Math.ceil(rows.length / size) : 0,
      },
    })
  }),

  http.get(GIFTS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const categoryId = new URL(request.url).searchParams.get('categoryId')

    /*
     * ⚠️ `isActive` is read and **ignored**, exactly as live: the live route
     * answers `isActive=false` with eight ACTIVE rows (plan.md O3). Honouring
     * it here would let a filter control pass its test and do nothing in
     * production.
     */
    const rows = isEmptyScenario()
      ? []
      : gifts.filter((row) => (categoryId ? row.categoryId === categoryId : true))

    return HttpResponse.json({ success: true, data: rows })
  }),

  http.post(GIFTS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const missing: string[] = []
    if (typeof body?.['categoryId'] !== 'string')
      missing.push('body/categoryId Required')
    if (typeof body?.['name'] !== 'string') missing.push('body/name Required')
    if (typeof body?.['iconUrl'] !== 'string')
      missing.push('body/iconUrl Invalid input')
    if (typeof body?.['animationUrl'] !== 'string') {
      missing.push('body/animationUrl Invalid input')
    }
    if (typeof body?.['priceDiamonds'] !== 'number') {
      missing.push('body/priceDiamonds Required')
    }
    missing.push(...giftFieldIssues(body))
    if (missing.length > 0) return errorResponse(400, VALIDATION, missing.join(', '))

    /* ⚠️ The create wording. Update uses a different one for the same rule. */
    if ((body!['priceDiamonds'] as number) < 1) {
      return errorResponse(
        400,
        VALIDATION,
        'body/priceDiamonds Gift price must be at least 1 diamond',
      )
    }

    if (!categories.some((category) => category.id === body!['categoryId'])) {
      return errorResponse(422, FOREIGN_KEY, FOREIGN_KEY_MESSAGE)
    }

    const created: MockGift = {
      id: `gift-${Date.now().toString(36)}`,
      categoryId: body!['categoryId'] as string,
      name: body!['name'] as string,
      iconUrl: body!['iconUrl'] as string,
      animationUrl: body!['animationUrl'] as string,
      animationType: (body!['animationType'] as string | undefined) ?? 'LOTTIE',
      priceDiamonds: body!['priceDiamonds'] as number,
      sortOrder: (body!['sortOrder'] as number | undefined) ?? gifts.length,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    }
    gifts.push(created)
    giftVersion += 1

    return HttpResponse.json(
      { success: true, message: 'Gift created successfully.', data: created },
      { status: 201 },
    )
  }),

  http.patch(`${GIFTS}/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)

    /*
     * ⚠️ **The headline defect, reproduced.** Every seeded gift is `0` and
     * this rejects `0` — so saving any live gift unchanged is impossible, and
     * editing its name forces a price change (plan.md O1). A mock that
     * allowed `0` would let the editor ship without facing that.
     */
    if (typeof body?.['priceDiamonds'] === 'number' && body['priceDiamonds'] < 1) {
      return errorResponse(
        400,
        VALIDATION,
        'body/priceDiamonds Number must be greater than 0',
      )
    }

    const issues = giftFieldIssues(body)
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const row = gifts.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Gift not found')

    /* ⚠️ Measured: `422`, Prisma's message, not a validation error. */
    const categoryId = body?.['categoryId']
    if (
      typeof categoryId === 'string' &&
      !categories.some((category) => category.id === categoryId)
    ) {
      return errorResponse(422, FOREIGN_KEY, FOREIGN_KEY_MESSAGE)
    }

    for (const key of [
      'name',
      'iconUrl',
      'animationUrl',
      'animationType',
      'categoryId',
    ] as const) {
      if (typeof body?.[key] === 'string') row[key] = body[key]
    }
    if (typeof body?.['priceDiamonds'] === 'number')
      row.priceDiamonds = body['priceDiamonds']
    if (typeof body?.['sortOrder'] === 'number') row.sortOrder = body['sortOrder']
    if (typeof body?.['isActive'] === 'boolean') row.isActive = body['isActive']
    row.updatedAt = now()
    giftVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Gift updated successfully.',
      data: row,
    })
  }),

  http.delete(`${GIFTS}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = gifts.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Gift not found')

    row.isActive = false
    row.updatedAt = now()
    giftVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Gift deactivated successfully.',
      data: row,
    })
  }),

  /* ------------------------- emoji packs ------------------------- */

  http.patch(`${PACKS}/reorder`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const failure = applyReorder(await readBody(request), packs)
    if (failure) return failure
    emojiVersion += 1
    return HttpResponse.json({
      success: true,
      message: 'Packs reordered successfully.',
    })
  }),

  http.get(PACKS, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    return HttpResponse.json({
      success: true,
      data: isEmptyScenario()
        ? []
        : packs.map((pack) => ({
            ...pack,
            emojis: emojis
              .filter((row) => row.packId === pack.id)
              .sort((a, b) => a.sortOrder - b.sortOrder),
          })),
    })
  }),

  http.post(PACKS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const issues: string[] = []
    if (typeof body?.['name'] !== 'string') issues.push('body/name Required')
    if (typeof body?.['coverUrl'] !== 'string')
      issues.push('body/coverUrl Invalid input')
    const nameIssue = packNameIssue(body?.['name'])
    if (nameIssue) issues.push(nameIssue)
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const created: MockPack = {
      id: `pack_${Date.now().toString(36)}`,
      name: body!['name'] as string,
      coverUrl: body!['coverUrl'] as string,
      sortOrder: (body!['sortOrder'] as number | undefined) ?? packs.length,
      isActive: true,
      isPremium: (body!['isPremium'] as boolean | undefined) ?? false,
      createdAt: now(),
      updatedAt: now(),
    }
    packs.push(created)
    emojiVersion += 1

    return HttpResponse.json(
      { success: true, message: 'Emoji pack created successfully.', data: created },
      { status: 201 },
    )
  }),

  http.patch(`${PACKS}/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const nameIssue = packNameIssue(body?.['name'])
    if (nameIssue) return errorResponse(400, VALIDATION, nameIssue)
    const row = packs.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Emoji pack not found')

    if (typeof body?.['name'] === 'string') row.name = body['name']
    if (typeof body?.['coverUrl'] === 'string') row.coverUrl = body['coverUrl']
    if (typeof body?.['sortOrder'] === 'number') row.sortOrder = body['sortOrder']
    if (typeof body?.['isPremium'] === 'boolean') row.isPremium = body['isPremium']
    if (typeof body?.['isActive'] === 'boolean') row.isActive = body['isActive']
    row.updatedAt = now()
    emojiVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Emoji pack updated successfully.',
      data: row,
    })
  }),

  http.delete(`${PACKS}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = packs.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Emoji pack not found')

    row.isActive = false
    row.updatedAt = now()
    emojiVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Emoji pack deactivated successfully.',
      data: row,
    })
  }),

  /* --------------------------- emojis ---------------------------- */

  http.patch(`${EMOJIS}/reorder`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario
    const failure = applyReorder(await readBody(request), emojis)
    if (failure) return failure
    emojiVersion += 1
    return HttpResponse.json({
      success: true,
      message: 'Emojis reordered successfully.',
    })
  }),

  /** ⚠️ Before `/:id`, like every other sub-route here. */
  http.post(`${EMOJIS}/bulk`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const issues: string[] = []
    if (typeof body?.['packId'] !== 'string') issues.push('body/packId Required')
    if (!Array.isArray(body?.['emojis'])) issues.push('body/emojis Required')
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const packId = body!['packId'] as string
    const incoming = body!['emojis'] as Array<Record<string, unknown>>
    if (incoming.length === 0) {
      return errorResponse(
        400,
        VALIDATION,
        'body/emojis At least one emoji must be provided',
      )
    }
    for (const item of incoming) {
      const itemIssues = emojiFieldIssues(item)
      if (typeof item['shortcode'] !== 'string') itemIssues.push(SHORTCODE_ERROR)
      if (itemIssues.length > 0) {
        return errorResponse(400, VALIDATION, itemIssues.join(', '))
      }
    }

    /*
     * ⚠️ **Duplicates are skipped silently** — measured 2026-10-28: two
     * sent, one taken, answered `201 {count: 1}`. Not a 409, and no list of
     * what was skipped. A mock that refused the batch would let the panel
     * ship believing a 201 means "all of them".
     */
    let created = 0
    for (const item of incoming) {
      const shortcode = item['shortcode'] as string
      if (shortcodeTaken(shortcode)) continue
      emojis.push({
        id: `emoji_${Date.now().toString(36)}_${created}_${Math.random().toString(36).slice(2, 6)}`,
        packId,
        name: String(item['name'] ?? ''),
        shortcode,
        fileUrl: String(item['fileUrl'] ?? ''),
        /* ⚠️ Omitted → STATIC at 0, measured. */
        type: (item['type'] as string | undefined) ?? 'STATIC',
        sortOrder: (item['sortOrder'] as number | undefined) ?? 0,
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      })
      created += 1
    }
    emojiVersion += 1

    /* ⚠️ A count and nothing else — no records. The caller must refetch. */
    return HttpResponse.json(
      {
        success: true,
        message: `${created} emojis created successfully.`,
        data: { count: created },
      },
      { status: 201 },
    )
  }),

  http.post(EMOJIS, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const issues: string[] = []
    if (typeof body?.['packId'] !== 'string') issues.push('body/packId Required')
    if (typeof body?.['name'] !== 'string') issues.push('body/name Required')
    if (typeof body?.['shortcode'] !== 'string') issues.push('body/shortcode Required')
    if (typeof body?.['fileUrl'] !== 'string') issues.push('body/fileUrl Invalid input')
    issues.push(...emojiFieldIssues(body))
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const shortcode = body!['shortcode'] as string
    if (!/^:[a-z0-9_]+:$/.test(shortcode)) {
      return errorResponse(
        400,
        VALIDATION,
        'body/shortcode Shortcode must be in format :name:, lowercase alphanumeric and underscores',
      )
    }
    if (shortcodeTaken(shortcode)) return errorResponse(409, ALREADY_EXISTS, TAKEN)

    const created: MockEmoji = {
      id: `emoji_${Date.now().toString(36)}`,
      packId: body!['packId'] as string,
      name: body!['name'] as string,
      shortcode,
      fileUrl: body!['fileUrl'] as string,
      /* ⚠️ Omitted → STATIC at 0, measured on single create too. */
      type: (body!['type'] as string | undefined) ?? 'STATIC',
      sortOrder: (body!['sortOrder'] as number | undefined) ?? 0,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    }
    emojis.push(created)
    emojiVersion += 1

    return HttpResponse.json(
      { success: true, message: 'Emoji created successfully.', data: created },
      { status: 201 },
    )
  }),

  http.patch(`${EMOJIS}/:id`, async ({ params, request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const shortcode = body?.['shortcode']
    const issues = emojiFieldIssues(body)
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const row = emojis.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Emoji not found')

    /* ⚠️ Measured: moving onto any taken shortcode, in any pack, is a 409. */
    if (typeof shortcode === 'string' && shortcodeTaken(shortcode, row.id)) {
      return errorResponse(409, ALREADY_EXISTS, TAKEN)
    }

    if (typeof body?.['name'] === 'string') row.name = body['name']
    if (typeof shortcode === 'string') row.shortcode = shortcode
    if (typeof body?.['fileUrl'] === 'string') row.fileUrl = body['fileUrl']
    if (typeof body?.['type'] === 'string') row.type = body['type']
    if (typeof body?.['sortOrder'] === 'number') row.sortOrder = body['sortOrder']
    if (typeof body?.['isActive'] === 'boolean') row.isActive = body['isActive']
    row.updatedAt = now()
    emojiVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Emoji updated successfully.',
      data: row,
    })
  }),

  http.delete(`${EMOJIS}/:id`, async ({ params }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const row = emojis.find((candidate) => candidate.id === params['id'])
    if (!row) return errorResponse(404, NOT_FOUND, 'Emoji not found')

    row.isActive = false
    row.updatedAt = now()
    emojiVersion += 1

    return HttpResponse.json({
      success: true,
      message: 'Emoji deactivated successfully.',
      data: row,
    })
  }),

  /* --------------------------- uploads --------------------------- */

  http.post(UPLOAD_URL, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = await readBody(request)
    const filename = body?.['filename']
    /* ⚠️ `mimetype` OR `contentType` — both accepted live (doc §2.1). */
    const mimetype = body?.['mimetype'] ?? body?.['contentType']

    const issues: string[] = []
    if (typeof filename !== 'string') issues.push('body/filename Required')
    if (typeof mimetype !== 'string') issues.push('body/mimetype Required')
    if (issues.length > 0) return errorResponse(400, VALIDATION, issues.join(', '))

    const folder = (body?.['folder'] as string | undefined) ?? 'gifts'
    const allowedFolders = ['emojis', 'gifts', 'packs']
    if (!allowedFolders.includes(folder)) {
      return errorResponse(
        400,
        VALIDATION,
        `body/folder Invalid enum value. Expected 'emojis' | 'gifts' | 'packs', received '${folder}'`,
      )
    }

    const allowedMime: Record<string, string[]> = {
      gifts: ['image/png', 'image/webp', 'application/json', 'video/mp4'],
      emojis: ['image/png', 'image/webp', 'application/json'],
      packs: ['image/png', 'image/webp', 'image/jpeg'],
    }
    const allowed = allowedMime[folder]!
    if (!allowed.includes(mimetype as string)) {
      /* ⚠️ The service's own wording, which is worth surfacing verbatim. */
      return errorResponse(
        400,
        BAD_REQUEST,
        `Invalid MIME type '${String(mimetype)}' for folder '${folder}'. Allowed: ${allowed.join(', ')}`,
      )
    }

    const key = `catalog/${folder}/${Date.now()}_${String(filename)}`
    return HttpResponse.json({
      success: true,
      data: {
        /* ⚠️ Absolute, while stored records are root-relative (plan.md O10). */
        uploadUrl: `https://media.callschat.com/calls-chat-media/${key}?X-Amz-Signature=mock`,
        fileUrl: `https://media.callschat.com/calls-chat-media/${key}`,
        fileKey: key,
        expiresIn: 3600,
      },
    })
  }),

  /**
   * ⚠️ **The storage host, not our API.** The real PUT goes to
   * `media.callschat.com`, which could not be reached from the machine the
   * contract was measured on (G3) — so this answers what S3 answers on
   * success, an empty `200`, and records what arrived so tests can check the
   * bytes and the content type rather than trusting the client.
   */
  http.put('https://media.callschat.com/calls-chat-media/*', async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const bytes = await request.arrayBuffer()
    storageUploads.push({
      url: request.url,
      contentType: request.headers.get('content-type'),
      size: bytes.byteLength,
    })
    return new HttpResponse(null, { status: 200 })
  }),
]
