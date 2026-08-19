import { http, HttpResponse } from 'msw'

import { PERMISSIONS } from '@/auth/permissions'
import type { AdminRole, CurrentAdmin } from '@/types/identity'

import { API_PREFIX, applyScenario, errorResponse } from './shared'

const ALL = Object.values(PERMISSIONS)

/**
 * Permission sets per role, mirroring the matrix in plan.md §8.
 *
 * The mock enforces these so the real RBAC behaviour — hidden nav, forbidden
 * routes — can be exercised by signing in as different roles.
 */
const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly string[]>> = {
  SUPER_ADMIN: ALL,
  OPERATIONS_ADMIN: [
    PERMISSIONS.usersView,
    PERMISSIONS.usersSuspend,
    PERMISSIONS.usersBan,
    PERMISSIONS.usersRestrict,
    PERMISSIONS.sessionsRevoke,
    PERMISSIONS.clubsView,
    PERMISSIONS.clubsModerate,
    PERMISSIONS.hostApplicationsView,
    PERMISSIONS.hostApplicationsApprove,
    PERMISSIONS.hostApplicationsReject,
    PERMISSIONS.walletsView,
    PERMISSIONS.ledgerView,
    PERMISSIONS.paymentsView,
    PERMISSIONS.withdrawalsView,
    PERMISSIONS.reportsView,
    PERMISSIONS.reportsResolve,
    PERMISSIONS.analyticsView,
    PERMISSIONS.exportData,
    PERMISSIONS.notificationsSend,
    PERMISSIONS.auditLogsView,
    PERMISSIONS.configurationView,
  ],
  MODERATOR: [
    PERMISSIONS.usersView,
    PERMISSIONS.usersRestrict,
    PERMISSIONS.clubsView,
    PERMISSIONS.clubsModerate,
    PERMISSIONS.reportsView,
    PERMISSIONS.reportsResolve,
  ],
}

const ACCOUNTS: Readonly<Record<string, { name: string; role: AdminRole }>> = {
  'nadia@callchat.app': { name: 'Nadia Chowdhury', role: 'SUPER_ADMIN' },
  'tomas@callchat.app': { name: 'Tomas Ricci', role: 'OPERATIONS_ADMIN' },
  'elena@callchat.app': { name: 'Elena Petrova', role: 'MODERATOR' },
}

const SESSION_KEY = 'callchat.mock.session'

function readSession(): CurrentAdmin | null {
  const raw = globalThis.localStorage?.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CurrentAdmin
  } catch {
    return null
  }
}

function writeSession(admin: CurrentAdmin | null): void {
  if (admin) globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(admin))
  else globalThis.localStorage?.removeItem(SESSION_KEY)
}

export const authHandlers = [
  http.get(`${API_PREFIX}/admin/me`, async () => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const session = readSession()
    if (!session) {
      return errorResponse(401, 'UNAUTHORIZED', 'Not signed in.')
    }
    return HttpResponse.json(session)
  }),

  http.post(`${API_PREFIX}/admin/auth/login`, async ({ request }) => {
    const scenario = await applyScenario()
    if (scenario) return scenario

    const body = (await request.json()) as { email?: string; password?: string }
    const email = body.email?.toLowerCase().trim() ?? ''
    const account = ACCOUNTS[email]

    /*
     * The mock accepts any non-empty password for a known account. Password
     * policy is a backend concern (plan.md §RBAC) — mirroring it here would
     * only create a second, divergent source of truth.
     */
    if (!account || !body.password) {
      return errorResponse(401, 'UNAUTHORIZED', 'Email or password is incorrect.')
    }

    const admin: CurrentAdmin = {
      id: `adm_${email}`,
      name: account.name,
      email,
      role: account.role,
      permissions: [...(ROLE_PERMISSIONS[account.role] ?? [])],
      lastSignInAt: new Date().toISOString(),
    }

    writeSession(admin)
    return HttpResponse.json(admin)
  }),

  http.post(`${API_PREFIX}/admin/auth/logout`, async () => {
    writeSession(null)
    return new HttpResponse(null, { status: 204 })
  }),
]

export { ROLE_PERMISSIONS }
