import { describe, it } from 'vitest'

import { DataList } from '@/components/data'
import { expectNoA11yViolations } from '@tests/a11y'
import { renderWithProviders, setViewport } from '@tests/render'
import type { UserSummary } from '@/types/identity'

import { userColumns } from './userColumns'

/**
 * Accessibility of the Phase 3 surfaces.
 *
 * plan.md §13: `eslint-plugin-jsx-a11y` has no ESLint 10 build, so runtime axe
 * is the enforcement point. Colour contrast is excluded here (jsdom has no
 * canvas) and is checked in a real browser in the Phase 11 pass.
 */

function user(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 'usr_000001',
    displayName: 'Ayesha Rahman',
    username: 'ayesha',
    avatarUrl: null,
    email: 'ayesha@example.com',
    phone: '+8801712345678',
    phoneMasked: '+880••••••5678',
    role: 'USER',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    isHost: true,
    activeRestrictions: ['GIFTING', 'MESSAGING', 'VOICE_CALL'],
    createdAt: '2026-03-04T10:00:00Z',
    lastActiveAt: '2026-08-20T09:30:00Z',
    ...overrides,
  }
}

const rows = [user(), user({ id: 'usr_000002', status: 'SUSPENDED', isHost: false })]

describe('user directory accessibility', () => {
  it('has no violations as a table at lg and above', async () => {
    setViewport(1440)
    const { container } = renderWithProviders(
      <DataList<UserSummary>
        rows={rows}
        columns={userColumns}
        rowKey={(row) => row.id}
        sort={{ field: 'createdAt', direction: 'desc' }}
        onSortChange={() => {}}
        onRowClick={() => {}}
      />,
    )
    await expectNoA11yViolations(container)
  })

  it('has no violations as cards below lg', async () => {
    setViewport(390)
    const { container } = renderWithProviders(
      <DataList<UserSummary>
        rows={rows}
        columns={userColumns}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.displayName}
        onRowClick={() => {}}
      />,
    )
    await expectNoA11yViolations(container)
  })

  it('has no violations in the empty state', async () => {
    setViewport(1440)
    const { container } = renderWithProviders(
      <DataList<UserSummary>
        rows={[]}
        columns={userColumns}
        rowKey={(row) => row.id}
        emptyTitle="No users match these filters"
        emptyDescription="Try widening the search."
      />,
    )
    await expectNoA11yViolations(container)
  })

  it('has no violations in the error state', async () => {
    setViewport(1440)
    const { container } = renderWithProviders(
      <DataList<UserSummary>
        rows={[]}
        columns={userColumns}
        rowKey={(row) => row.id}
        error={{ message: 'The user directory could not be loaded.' }}
        onRetry={() => {}}
      />,
    )
    await expectNoA11yViolations(container)
  })

  it('has no violations in the loading state', async () => {
    setViewport(1440)
    const { container } = renderWithProviders(
      <DataList<UserSummary>
        rows={[]}
        columns={userColumns}
        rowKey={(row) => row.id}
        loading
      />,
    )
    await expectNoA11yViolations(container)
  })
})
