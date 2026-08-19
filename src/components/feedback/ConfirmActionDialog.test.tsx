import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders, screen } from '@tests/render'

import { ConfirmActionDialog } from './ConfirmActionDialog'

function setup(overrides: Partial<Parameters<typeof ConfirmActionDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  renderWithProviders(
    <ConfirmActionDialog
      open
      onOpenChange={() => {}}
      title="Ban user"
      target="Ayesha Rahman (usr_8Fk29ZqLm401)"
      effect="This user is signed out immediately and cannot sign in again."
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { onConfirm }
}

describe('ConfirmActionDialog', () => {
  it('shows the target and the effect so the operator knows what they are acting on', () => {
    setup()
    expect(screen.getByText('Ayesha Rahman (usr_8Fk29ZqLm401)')).toBeInTheDocument()
    expect(
      screen.getByText(/signed out immediately and cannot sign in again/i),
    ).toBeInTheDocument()
  })

  it('refuses to confirm with an empty reason and explains why', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/reason of at least/i)
  })

  it('refuses to confirm with a reason below the minimum length', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    await user.type(screen.getByLabelText(/reason/i), 'spam')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms with a trimmed reason once one is supplied', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    await user.type(screen.getByLabelText(/reason/i), '  Repeated harassment reports  ')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith('Repeated harassment reports')
  })

  it('additionally requires a typed confirmation for irreversible actions', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup({ typedConfirmation: 'BAN' })

    await user.type(screen.getByLabelText(/reason/i), 'Repeated harassment reports')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/type.*to confirm/i), 'BAN')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('is fully keyboard operable', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    // Type the reason using only the keyboard.
    const reason = screen.getByLabelText(/reason/i)
    reason.focus()
    await user.keyboard('Repeated harassment reports')

    // Tab order must reach Cancel, then Confirm.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await user.tab()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledWith('Repeated harassment reports')
  })
})
