/**
 * Stub that replaces `mocks/browser.ts` when a build sets VITE_USE_MOCKS=false.
 *
 * Aliased in `vite.config.ts` so MSW, the seed data and the mock auth handlers
 * — which accept any password — are dropped from the bundle entirely rather
 * than shipped as unreachable code.
 */
export async function startMockBackend(): Promise<void> {
  throw new Error('Mock backend is not included in this build (VITE_USE_MOCKS=false).')
}
