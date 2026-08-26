import { describe, expect, it } from 'vitest'

import { renderWithProviders, screen, setViewport } from '@tests/render'
import { DataList } from '@/components/data'
import type { UserSummary } from '@/types/identity'

import { userColumns } from './userColumns'

/**
 * plan.md Phase 3A gate: one column definition, two renderers, and the rules
 * the module must never break — status and restrictions stay separate, and no
 * unmasked phone number reaches the DOM.
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
    isHost: false,
    activeRestrictions: [],
    createdAt: '2026-03-04T10:00:00Z',
    lastActiveAt: '2026-08-20T09:30:00Z',
    ...overrides,
  }
}

function renderList(rows: UserSummary[]) {
  return renderWithProviders(
    <DataList<UserSummary>
      rows={rows}
      columns={userColumns}
      rowKey={(row) => row.id}
    />,
  )
}

describe('user directory columns', () => {
  it('renders a table at lg and above', () => {
    setViewport(1440)
    renderList([user()])

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Ayesha Rahman')).toBeInTheDocument()
  })

  it('renders cards below lg from the same column definition', () => {
    setViewport(390)
    renderList([user()])

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Ayesha Rahman')).toBeInTheDocument()
  })

  it.each([390, 1440])(
    'never places an unmasked phone number in the DOM at %ipx',
    (width) => {
      setViewport(width)
      const { container } = renderList([user()])

      // plan.md §3.9 — the raw value is present on the record but must not render.
      expect(container.textContent).not.toContain('8801712345678')
      expect(container.textContent).toContain('+880••••••5678')
    },
  )

  it('keeps capability restrictions separate from account status', () => {
    setViewport(1440)
    renderList([
      user({ status: 'ACTIVE', activeRestrictions: ['GIFTING', 'MESSAGING'] }),
    ])

    /*
     * plan.md Phase 3 "Rules enforced": a restricted account is still ACTIVE.
     * A restriction must never be rendered as a status value.
     */
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Gifting blocked')).toBeInTheDocument()
    expect(screen.getByText('Messaging blocked')).toBeInTheDocument()
  })

  it('collapses more than two restrictions into a counter', () => {
    setViewport(1440)
    renderList([user({ activeRestrictions: ['GIFTING', 'MESSAGING', 'VOICE_CALL'] })])

    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('shows an explicit fallback rather than a blank cell for never-active users', () => {
    setViewport(1440)
    renderList([user({ lastActiveAt: null })])

    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('degrades an unknown status to a readable label instead of breaking', () => {
    setViewport(1440)
    // A backend adding a state must never crash the directory (plan.md §3.7).
    renderList([user({ status: 'ARCHIVED' as UserSummary['status'] })])

    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})
