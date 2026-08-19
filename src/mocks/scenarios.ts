/**
 * Failure-scenario switches for the mock backend (plan.md §2.7).
 *
 * These let the loading / empty / error / forbidden states be exercised
 * without touching the backend or editing fixtures. Toggle from the browser
 * console:
 *
 *   __mockScenario.set('error')      // every list endpoint returns 500
 *   __mockScenario.set('empty')      // every list endpoint returns zero rows
 *   __mockScenario.set('forbidden')  // every request returns 403
 *   __mockScenario.set('slow')       // 3s latency
 *   __mockScenario.set('normal')     // back to seeded data
 */
export type MockScenario =
  'normal' | 'empty' | 'error' | 'forbidden' | 'slow' | 'unauthorized'

let current: MockScenario = 'normal'

export const mockScenario = {
  get: (): MockScenario => current,
  set: (scenario: MockScenario): void => {
    current = scenario
    console.warn(`[mocks] scenario -> ${scenario}`)
  },
}

/** Realistic latency so loading states are actually visible in development. */
export function scenarioLatencyMs(): number {
  if (current === 'slow') return 3000
  return 120 + Math.floor(Math.random() * 280)
}

declare global {
  var __mockScenario: typeof mockScenario | undefined
}

export function exposeScenarioControls(): void {
  globalThis.__mockScenario = mockScenario
}
