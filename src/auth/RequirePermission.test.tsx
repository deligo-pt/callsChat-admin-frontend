import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/auth/permissions'
import { renderWithProviders, screen } from '@tests/render'

import { AuthContext, type AuthContextValue } from './AuthContext'
import { RequirePermission } from './RequirePermission'

function withPermissions(permissions: string[]): AuthContextValue {
  const set = new Set(permissions)
  return {
    admin: {
      id: 'adm_1',
      name: 'Test Admin',
      email: 'test@callchat.app',
      role: 'MODERATOR',
      permissions,
      lastSignInAt: null,
    },
    loading: false,
    ready: true,
    error: null,
    can: (permission) => set.has(permission),
    signOut: async () => {},
    refresh: async () => {},
  }
}

function render(permissions: string[], required: string) {
  return renderWithProviders(
    <AuthContext.Provider value={withPermissions(permissions)}>
      <RequirePermission permission={required as never} resource="withdrawal records">
        <p>Protected content: WD-10482 net USD 36.00</p>
      </RequirePermission>
    </AuthContext.Provider>,
  )
}

describe('RequirePermission', () => {
  it('renders the page when the admin holds the permission', () => {
    render([PERMISSIONS.withdrawalsView], PERMISSIONS.withdrawalsView)
    expect(screen.getByText(/Protected content/)).toBeInTheDocument()
  })

  it('renders a forbidden state when the admin does not', () => {
    render([PERMISSIONS.usersView], PERMISSIONS.withdrawalsView)
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument()
  })

  it('leaks no record data through the forbidden state (plan.md §3.4)', () => {
    const { container } = render([PERMISSIONS.usersView], PERMISSIONS.withdrawalsView)
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/WD-10482|36\.00/)
  })
})
