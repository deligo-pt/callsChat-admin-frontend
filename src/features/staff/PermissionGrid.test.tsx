import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MODULE_PERMISSION_VALUES, type ModulePermission } from '@/types/staff'
import { expectNoA11yViolations } from '@tests/a11y'
import { renderWithProviders, screen } from '@tests/render'

import { PermissionGrid } from './PermissionGrid'
import { GRANTABLE_MODULE_PERMISSIONS, MODULE_PERMISSIONS } from './permissionMap'

/**
 * The permission grid.
 *
 * This is where a Super Admin decides what a colleague may do to a real
 * person's account, so the assertions are about the three things that would
 * make it lie: a missing key, a grantable key rendered inert, and an inert key
 * that can nonetheless be granted.
 */

function Harness({ initial = [] }: { initial?: readonly ModulePermission[] }) {
  const [value, setValue] = useState<readonly ModulePermission[]>(initial)
  return (
    <>
      <PermissionGrid value={value} onChange={setValue} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  )
}

describe('permission grid', () => {
  it('renders all eight keys, not just the grantable six', () => {
    /*
     * The API accepts the two restricted keys on an ADMIN, so hiding them
     * would leave an operator comparing the doc's eight against a grid of six,
     * unable to tell whether the panel or the doc was stale.
     */
    renderWithProviders(<Harness />)

    for (const entry of MODULE_PERMISSIONS) {
      expect(screen.getByText(entry.label)).toBeInTheDocument()
    }
  })

  it('states what each key unlocks, on screen rather than in a tooltip', () => {
    // `USER_MODERATE` nowhere says that it carries session revocation.
    renderWithProviders(<Harness />)

    expect(screen.getByText(/revoke their sessions/i)).toBeInTheDocument()
    expect(screen.getByText(/Read and change app name/i)).toBeInTheDocument()
  })

  it('offers a checkbox for every grantable key and none for the three locked rows', () => {
    renderWithProviders(<Harness />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(
      GRANTABLE_MODULE_PERMISSIONS.length,
    )
    /*
     * Once per restricted row, not once per group heading: an operator who
     * reaches for an inert box deserves the reason where they reached.
     *
     * Two rows carry the Super-Admin reason. The third locked row —
     * `FEEDBACK_MANAGEMENT` — carries a different one, because it is locked for
     * a different cause: the API enforces it and then rejects it on every write
     * (feedback_management_plan.md §3.1). Telling an operator that Super
     * Administrators "hold this already" would be the wrong explanation, so the
     * two reasons are asserted separately.
     */
    expect(
      screen.getAllByText(/Granting it to an Admin or\s+Moderator has no effect/i),
    ).toHaveLength(2)
    expect(screen.getAllByText(/Not yet grantable/i)).toHaveLength(1)
    expect(MODULE_PERMISSIONS).toHaveLength(GRANTABLE_MODULE_PERMISSIONS.length + 3)
  })

  it('renders the ungrantable key as a locked row with no checkbox', () => {
    /*
     * Shown rather than hidden. A Super Admin provisioning a support moderator
     * should be able to see that the capability exists and that it cannot yet
     * be delegated — otherwise they grant what they can, and later discover
     * their new hire has an invisible inbox with no explanation anywhere.
     */
    renderWithProviders(<Harness />)

    expect(screen.getByText('Feedback & support')).toBeInTheDocument()
    /* No label points at it, because there is no control to label. */
    expect(
      screen.queryByRole('checkbox', { name: /Feedback & support/i }),
    ).not.toBeInTheDocument()
  })

  it('starts with nothing granted', () => {
    renderWithProviders(<Harness />)

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked()
    }
  })

  it('emits keys in canonical order regardless of click order', async () => {
    /*
     * Two equal sets must be equal arrays, or a dirty check on the detail
     * screen fires on nothing more than the order the boxes were ticked.
     */
    const user = userEvent.setup()
    renderWithProviders(<Harness />)

    await user.click(screen.getByLabelText('App releases'))
    await user.click(screen.getByLabelText('Dashboard & trends'))

    const emitted = screen.getByTestId('value').textContent!.split(',')
    const canonical = MODULE_PERMISSION_VALUES.filter((key) => emitted.includes(key))
    expect(emitted).toEqual(canonical)
  })

  it('removes a key when its box is cleared', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={['USER_VIEW', 'DASHBOARD_VIEW']} />)

    await user.click(screen.getByLabelText('User directory'))

    expect(screen.getByTestId('value')).toHaveTextContent('DASHBOARD_VIEW')
    expect(screen.getByTestId('value')).not.toHaveTextContent('USER_VIEW')
  })

  it('sends the whole array, never a delta', () => {
    /*
     * `PATCH /permissions` replaces the set outright (§3.3), so the control
     * feeding it must always be the complete answer.
     */
    const onChange = vi.fn()
    renderWithProviders(<PermissionGrid value={['USER_VIEW']} onChange={onChange} />)

    return userEvent
      .setup()
      .click(screen.getByLabelText('Dashboard & trends'))
      .then(() => {
        expect(onChange).toHaveBeenCalledWith(['DASHBOARD_VIEW', 'USER_VIEW'])
      })
  })

  it('locks every box while disabled', () => {
    renderWithProviders(<PermissionGrid value={[]} onChange={() => {}} disabled />)

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled()
    }
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<Harness initial={['USER_VIEW']} />)
    await expectNoA11yViolations(container)
  })
})
