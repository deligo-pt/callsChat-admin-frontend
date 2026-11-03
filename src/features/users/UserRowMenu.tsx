import { MoreHorizontal, UserRound, Wallet } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserSummary } from '@/types/identity'

/**
 * A directory row's "More" menu — plan.md T5.
 *
 * The caller renders it only with `ledger.view`; without that the menu would
 * hold nothing the row click does not already do. "Open record" is listed too
 * (when the admin may open it) so a keyboard user on the table, where the row
 * itself is not focusable, has a named way in.
 *
 * "Wallet history" opens the wallet ledger filtered to this person — the
 * whole history, not the Finance tab's first page, and readable without
 * `users.view`.
 */
export function UserRowMenu({
  user,
  canOpenRecord,
}: {
  user: UserSummary
  canOpenRecord: boolean
}) {
  const name = user.displayName.trim() || user.username || user.id

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`More for ${name}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canOpenRecord ? (
          <DropdownMenuItem asChild>
            <Link to={ROUTES.user(user.id)}>
              <UserRound aria-hidden="true" />
              Open record
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to={ROUTES.walletLedger({ userId: user.id })}>
            <Wallet aria-hidden="true" />
            Wallet history
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
