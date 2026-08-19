import { http, HttpResponse } from 'msw'

import { ROUTES } from '@/app/routes'
import { resolveStatus } from '@/lib/status'
import type { SearchResult } from '@/types/ops'

import { payments, socialClubs, users, withdrawals } from '../seed'
import { API_PREFIX, applyScenario } from './shared'

const MAX_PER_GROUP = 4

/**
 * Cross-entity search (plan.md §2.9).
 *
 * Matches user ID, masked contact, club ID/title, payment ID and withdrawal
 * reference. Sublabels are masked values only — search results must not become
 * a way to read a raw phone number.
 */
export const searchHandlers = [
  http.get(`${API_PREFIX}/admin/search`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const term = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? ''
    if (term.length < 2) return HttpResponse.json({ data: [] })

    const matches = (value: string | null | undefined): boolean =>
      Boolean(value && value.toLowerCase().includes(term))

    const results: SearchResult[] = [
      ...users
        .filter(
          (user) =>
            matches(user.id) || matches(user.displayName) || matches(user.maskedPhone),
        )
        .slice(0, MAX_PER_GROUP)
        .map((user) => ({
          id: user.id,
          type: 'USER' as const,
          label: user.displayName,
          sublabel: `${user.id} · ${user.maskedPhone}`,
          href: ROUTES.user(user.id),
        })),

      ...socialClubs
        .filter(
          (club) => matches(club.id) || matches(club.title) || matches(club.hostName),
        )
        .slice(0, MAX_PER_GROUP)
        .map((club) => ({
          id: club.id,
          type: 'SOCIAL_CLUB' as const,
          label: club.title,
          sublabel: `${club.id} · Host ${club.hostName}`,
          href: ROUTES.socialClub(club.id),
        })),

      ...payments
        .filter((payment) => matches(payment.id) || matches(payment.providerReference))
        .slice(0, MAX_PER_GROUP)
        .map((payment) => ({
          id: payment.id,
          type: 'PAYMENT' as const,
          label: payment.id,
          sublabel: `${payment.userName} · ${resolveStatus('payment', payment.status).label}`,
          href: ROUTES.payment(payment.id),
        })),

      ...withdrawals
        .filter((w) => matches(w.id) || matches(w.reference) || matches(w.hostName))
        .slice(0, MAX_PER_GROUP)
        .map((w) => ({
          id: w.id,
          type: 'WITHDRAWAL' as const,
          label: w.reference,
          sublabel: `${w.hostName} · ${resolveStatus('withdrawal', w.state).label}`,
          href: ROUTES.withdrawal(w.id),
        })),
    ]

    return HttpResponse.json({ data: results })
  }),
]
