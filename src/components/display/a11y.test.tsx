import { describe, it } from 'vitest'

import { StatusBadge } from '@/components/display/StatusBadge'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/feedback'
import { PageHeader } from '@/components/display/PageHeader'
import { expectNoA11yViolations } from '@tests/a11y'
import { renderWithProviders } from '@tests/render'

/**
 * Accessibility is enforced at runtime with axe rather than by
 * eslint-plugin-jsx-a11y, which has no ESLint 10 build (plan.md §13).
 */
describe('accessibility', () => {
  it('PageHeader has no violations', async () => {
    const { container } = renderWithProviders(
      <PageHeader
        title="User Management"
        description="Accounts, restrictions and sessions."
        breadcrumbs={[{ label: 'Admin', to: '/' }, { label: 'Users' }]}
      />,
    )
    await expectNoA11yViolations(container)
  })

  it('status badges have no violations', async () => {
    const { container } = renderWithProviders(
      <div>
        <StatusBadge domain="user" value="ACTIVE" />
        <StatusBadge domain="withdrawal" value="UNDER_REVIEW" />
        <StatusBadge domain="user" value="BANNED" variant="dot" />
      </div>,
    )
    await expectNoA11yViolations(container)
  })

  it('remote states have no violations', async () => {
    const { container } = renderWithProviders(
      <div>
        <EmptyState />
        <ForbiddenState resource="withdrawal records" />
        <ErrorState correlationId="corr_abc123" onRetry={() => {}} />
      </div>,
    )
    await expectNoA11yViolations(container)
  })
})
