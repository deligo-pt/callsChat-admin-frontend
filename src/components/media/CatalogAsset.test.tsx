import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import { render, screen, waitFor } from '@tests/render'

import { CatalogAsset } from './CatalogAsset'
import { mountLottie } from './lottiePlayer'

/**
 * The catalog thumbnail — phase G2.
 *
 * ⚠️ The player itself is stubbed: jsdom has no SVG geometry, and what this
 * component owns is everything around the player — which URL it fetches, how,
 * what it hands over, and when it plays.
 */

vi.mock('./lottiePlayer', () => ({ mountLottie: vi.fn() }))

const ASSET = 'https://media.example.com/catalog/gifts/teddy_bear.json'
const LOTTIE = { v: '5.7.4', w: 100, h: 100, fr: 60, ip: 0, op: 120, layers: [] }

function player() {
  return {
    totalFrames: 120,
    play: vi.fn(),
    goToAndStop: vi.fn(),
    destroy: vi.fn(),
  }
}

let item: ReturnType<typeof player>
let requests: Request[]

function renderAsset(value: string | null, active = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CatalogAsset value={value} active={active} />
    </QueryClientProvider>,
  )
}

function serve(body: string | Record<string, unknown>, status = 200) {
  server.use(
    http.get(ASSET, ({ request }) => {
      requests.push(request)
      return typeof body === 'string'
        ? new HttpResponse(body, { status })
        : HttpResponse.json(body, { status })
    }),
  )
}

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  item = player()
  requests = []
  vi.mocked(mountLottie).mockReset()
  vi.mocked(mountLottie).mockResolvedValue(item as never)
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: originalMatchMedia,
  })
})

describe('what is fetched, and how', () => {
  it('fetches the Lottie file with no credentials and no referrer', async () => {
    serve(LOTTIE)
    renderAsset(ASSET)

    await waitFor(() => expect(mountLottie).toHaveBeenCalledTimes(1))
    expect(requests[0]?.credentials).toBe('omit')
    expect(requests[0]?.referrerPolicy).toBe('no-referrer')
  })

  it('hands the player the defused document, not the raw text', async () => {
    serve({ ...LOTTIE, assets: [{ id: 'i', u: 'https://evil.example/', p: 'px.png' }] })
    renderAsset(ASSET)

    await waitFor(() => expect(mountLottie).toHaveBeenCalledTimes(1))
    const handed = vi.mocked(mountLottie).mock.calls[0]?.[0].animationData
    expect(JSON.stringify(handed)).not.toContain('evil.example')
  })

  it('rests on the middle frame, because frame 0 is often empty', async () => {
    serve(LOTTIE)
    renderAsset(ASSET)
    await waitFor(() => expect(item.goToAndStop).toHaveBeenCalledWith(60, true))
    expect(item.play).not.toHaveBeenCalled()
  })

  it('destroys the player on unmount', async () => {
    serve(LOTTIE)
    const { unmount } = renderAsset(ASSET)
    await waitFor(() => expect(mountLottie).toHaveBeenCalled())
    await waitFor(() => expect(item.goToAndStop).toHaveBeenCalled())
    unmount()
    expect(item.destroy).toHaveBeenCalled()
  })
})

describe('what is refused', () => {
  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['protocol-relative', '//evil.example/x.json'],
    ['plain http', 'http://media.example.com/x.json'],
  ])('flags a %s URL without fetching it', (_, value) => {
    renderAsset(value)
    expect(screen.getByText('Unsafe asset URL')).toBeInTheDocument()
    /* The raw value stays readable, as inert text, for whoever fixes it. */
    expect(screen.getByTitle(value)).toBeInTheDocument()
    expect(mountLottie).not.toHaveBeenCalled()
  })

  it('says the preview is unavailable when the file is not Lottie', async () => {
    serve('<html>not lottie</html>')
    renderAsset(ASSET)
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
    expect(mountLottie).not.toHaveBeenCalled()
  })

  it('says the preview is unavailable when the file is missing', async () => {
    serve({ error: 'gone' }, 404)
    renderAsset(ASSET)
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
  })

  it('says the preview is unavailable when the player fails', async () => {
    vi.mocked(mountLottie).mockRejectedValue(new Error('boom'))
    serve(LOTTIE)
    renderAsset(ASSET)
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
  })

  it('says so when there is no asset at all', () => {
    renderAsset(null)
    expect(screen.getByText('No asset')).toBeInTheDocument()
  })
})

describe('a still image', () => {
  it('renders an <img> with no referrer, never through the player', () => {
    const png = 'https://media.example.com/catalog/packs/cover.png'
    const { container } = renderAsset(png)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(png)
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(mountLottie).not.toHaveBeenCalled()
  })
})

describe('when it plays', () => {
  it('plays under the pointer and comes back to rest after', async () => {
    serve(LOTTIE)
    const { container } = renderAsset(ASSET)
    await waitFor(() => expect(item.goToAndStop).toHaveBeenCalled())

    const thumb = container.firstElementChild as HTMLElement
    fireEvent.pointerEnter(thumb)
    expect(item.play).toHaveBeenCalledTimes(1)

    item.goToAndStop.mockClear()
    fireEvent.pointerLeave(thumb)
    expect(item.goToAndStop).toHaveBeenCalledWith(60, true)
  })

  it('plays while its row is active — keyboard focus', async () => {
    serve(LOTTIE)
    renderAsset(ASSET, true)
    await waitFor(() => expect(item.play).toHaveBeenCalled())
  })

  it('never plays when the operator asked for reduced motion', async () => {
    setReducedMotion(true)
    serve(LOTTIE)
    const { container } = renderAsset(ASSET, true)
    await waitFor(() => expect(item.goToAndStop).toHaveBeenCalled())

    fireEvent.pointerEnter(container.firstElementChild as HTMLElement)
    expect(item.play).not.toHaveBeenCalled()
  })
})
