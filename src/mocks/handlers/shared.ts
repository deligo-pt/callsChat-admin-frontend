import { delay, HttpResponse } from 'msw'

import type { ErrorCode } from '@/types/common'

import { mockScenario, scenarioLatencyMs } from '../scenarios'

export const API_PREFIX = '*/api/v1'

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
): Response {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        correlationId: `corr_mock_${Date.now().toString(36)}`,
      },
    },
    { status },
  )
}

/**
 * Applies the active scenario before a handler runs.
 *
 * Returns a response to short-circuit with, or `null` to continue normally.
 */
export async function applyScenario(): Promise<Response | null> {
  await delay(scenarioLatencyMs())

  switch (mockScenario.get()) {
    case 'error':
      return errorResponse(
        500,
        'INTERNAL_ERROR',
        'The mock backend returned a failure.',
      )
    case 'forbidden':
      return errorResponse(403, 'FORBIDDEN', 'You do not have permission to do that.')
    case 'unauthorized':
      return errorResponse(401, 'UNAUTHORIZED', 'Your session has expired.')
    default:
      return null
  }
}

export function isEmptyScenario(): boolean {
  return mockScenario.get() === 'empty'
}
