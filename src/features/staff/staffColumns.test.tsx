import { describe, expect, it } from 'vitest'

import { DataList } from '@/components/data'
import type { StaffMember } from '@/types/staff'
import { expectNoA11yViolations } from '@tests/a11y'
import { renderWithProviders, screen, setViewport } from '@tests/render'

import { staffColumns } from './staffColumns'

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'stf_000001',
    displayName: 'Sarah Connor',
    /* Deliberately long: this is the value that overflowed a 328px card. */
    username: 'staff_sarah.connor.a.very.long.generated.handle_a1b2',
    email: 'sarah.connor@callschat.com',
    phone: '+12025550199',
    role: 'MODERATOR',
    status: 'ACTIVE',
    adminPermissions: ['USER_VIEW', 'DASHBOARD_VIEW'],
    activeSessionsCount: 2,
    createdAt: '2026-08-28T09:14:00.000Z',
    lastActiveAt: '2026-09-03T08:41:12.000Z',
    ...overrides,
  }
}

const rows: StaffMember[] = [
  member(),
  member({ id: 'stf_000002', displayName: 'Marcus Webb', role: 'ADMIN' }),
  member({
    id: 'stf_000003',
    displayName: 'Probe Temp',
    status: 'INACTIVE',
    adminPermissions: [],
    activeSessionsCount: 0,
    lastActiveAt: null,
  }),
]

function list() {
  return (
    <DataList<StaffMember>
      rows={rows}
      columns={staffColumns}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.displayName}
      onRowClick={() => {}}
    />
  )
}

describe('staff columns', () => {
  it('declares no sortable column', () => {
    /*
     * `/admin/staff` accepts `sortBy` and silently ignores it, verified
     * 2026-09-03. A sort control that reorders nothing looks identical to an
     * already-sorted column, so there must not be one.
     */
    expect(staffColumns.some((column) => column.sortable)).toBe(false)
  })

  it('renders a deleted account as "Deleted", not "Inactive"', () => {
    setViewport(1440)
    renderWithProviders(list())

    expect(screen.getByText('Deleted')).toBeInTheDocument()
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })

  it('shows "Never" rather than an empty cell for an unused account', () => {
    setViewport(1440)
    renderWithProviders(list())
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('swaps to cards below lg and keeps the meta fields', () => {
    setViewport(360)
    renderWithProviders(list())

    // No table at phone width — the card renderer takes over entirely.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument()
    expect(screen.getAllByText('Access').length).toBeGreaterThan(0)
  })

  it('truncates a long username as a block, so it cannot push the badge out', () => {
    /*
     * `truncate-id` sets overflow and text-overflow, which an inline element
     * ignores. This is the S5 defect — a 388px card in a 328px track — and
     * `block` is the fix. Asserted on the class because a jsdom layout
     * measurement would prove nothing.
     */
    setViewport(360)
    renderWithProviders(list())

    const handle = screen.getAllByTitle(rows[0]!.username)[0]
    expect(handle).toHaveClass('block')
    expect(handle).toHaveClass('truncate-id')
  })
})

describe('staff directory accessibility', () => {
  it('has no violations as a table at lg and above', async () => {
    setViewport(1440)
    const { container } = renderWithProviders(list())
    await expectNoA11yViolations(container)
  })

  it('has no violations as cards below lg', async () => {
    setViewport(360)
    const { container } = renderWithProviders(list())
    await expectNoA11yViolations(container)
  })
})
