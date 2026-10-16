import type { HostApplication, LiveHost } from '@/types/hosts'

/**
 * How a person is named, everywhere in this module (phase H6).
 *
 * ⚠️ **One fallback chain, used by both the row an operator clicks and the
 * dialog that asks them to confirm.** Two different chains for the same record
 * would let a table say "alexrivers" while the ban dialog said "usr_99" — a
 * genuinely dangerous inconsistency on an action that ends someone's income.
 *
 * ⚠️ Every step is reachable. The doc shows `user.profile.displayName`
 * populated on every record, but nothing has ever been observed on the wire
 * (plan.md O1) and an account with no display name is ordinary on any consumer
 * platform. The chain ends at the `userId`, which is the last thing that is
 * still traceable — and on the roster it is also the key every status write
 * uses.
 *
 * In its own module because `cells.tsx` exports components, and
 * `react-refresh/only-export-components` refuses a plain function beside them.
 */
/*
 * ⚠️ The parameter is typed from the contract rather than hand-written.
 * `exactOptionalPropertyTypes` is on, so `displayName?: string | null` and
 * `displayName?: string | null | undefined` are different types — and the
 * schema produces the second. Restating the shape by hand compiled against
 * neither.
 */
type Profile = NonNullable<LiveHost['user']>['profile']

function pick(profile: Profile, userId: string | undefined, id: string): string {
  return profile?.displayName?.trim() || profile?.username?.trim() || userId || id
}

export function hostName(record: LiveHost): string {
  return pick(record.user?.profile, record.userId, record.id)
}

export function applicantName(record: HostApplication): string {
  return pick(record.user?.profile, record.userId, record.id)
}
