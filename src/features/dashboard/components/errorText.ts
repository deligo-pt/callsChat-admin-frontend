import { ForbiddenError, isAppError, RateLimitedError } from '@/api/errors'

/**
 * What a failed dashboard source should say (plan.md DB5), and whether a
 * Retry button can help.
 *
 * - **403:** retrying cannot change a permission, so there is no button, and
 *   the note is calm rather than red: nothing is broken.
 * - **429:** the dashboard already backs off on its own (see `pollInterval`),
 *   so a Retry button would only invite the user to make it worse.
 * - **Anything else (500, network):** the server's message, with Retry.
 */
export interface SectionProblem {
  readonly message: string
  /** A few words, for a list row with no room for a sentence. */
  readonly short: string
  readonly retry: boolean
  readonly tone: 'danger' | 'muted'
}

export function describeProblem(error: unknown, what: string): SectionProblem {
  if (error instanceof ForbiddenError) {
    return {
      message: `You don’t have access to ${what}. Contact your Super Administrator if you need it.`,
      short: 'No access',
      retry: false,
      tone: 'muted',
    }
  }
  if (error instanceof RateLimitedError) {
    return {
      message: 'Too many requests. This will refresh on its own in a moment.',
      short: 'Paused for a moment',
      retry: false,
      tone: 'muted',
    }
  }
  return {
    message: isAppError(error)
      ? error.message
      : `${capitalise(what)} could not be loaded.`,
    short: 'Could not be loaded',
    retry: true,
    tone: 'danger',
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
