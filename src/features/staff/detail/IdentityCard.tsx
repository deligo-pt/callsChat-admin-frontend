import { CopyableId, DateTime, KeyValueGrid, MaskedValue } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { StaffMember } from '@/types/staff'

/**
 * Who this person is — entirely read-only.
 *
 * **No endpoint edits any of it.** There is no `PATCH /admin/staff/:id`: the
 * four mutation routes cover permissions, status, role and password, and
 * nothing else (§2.1). Email, display name, username and phone are fixed at
 * creation.
 *
 * So the card says so once, in its description, rather than rendering seven
 * disabled inputs. A disabled field implies a permission the operator is
 * missing; a plain value implies a fact — and the second is the true one.
 */
export function IdentityCard({ member }: { member: StaffMember }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>
          Fixed at creation. The API has no route that changes any of these — to correct
          a name or an address, the account has to be replaced.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <KeyValueGrid
          columns={3}
          items={[
            { label: 'Display name', value: member.displayName },
            {
              label: 'Username',
              /* Server-generated and unchangeable, so it is an id, not a name. */
              value: <CopyableId value={member.username} />,
            },
            {
              label: 'Email',
              value: <MaskedValue value={member.email} kind="email" />,
            },
            {
              label: 'Phone',
              value: member.phone ? (
                <MaskedValue value={member.phone} kind="phone" />
              ) : (
                <span className="text-foreground-subtle">Not provided</span>
              ),
            },
            {
              label: 'Active sessions',
              /*
               * The field that confirms a suspension actually took effect, so
               * zero is stated rather than left blank.
               */
              value: <span className="tabular">{member.activeSessionsCount}</span>,
            },
            { label: 'Added', value: <DateTime value={member.createdAt} /> },
            {
              label: 'Last active',
              value: member.lastActiveAt ? (
                <DateTime value={member.lastActiveAt} />
              ) : (
                <span className="text-foreground-subtle">Never</span>
              ),
            },
            { label: 'Staff ID', value: <CopyableId value={member.id} /> },
          ]}
        />
      </CardContent>
    </Card>
  )
}
