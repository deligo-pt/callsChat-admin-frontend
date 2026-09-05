/**
 * A password the operator never has to invent.
 *
 * Its own module because `ResetPasswordDialog` is a component, and a module
 * exporting both a component and a plain function breaks Fast Refresh.
 *
 * Generating rather than asking removes the weak-password question entirely —
 * the server's whole rule is length ≥ 8, so `"password"` is accepted
 * (staff_management_plan.md §3.5) — and it means the operator never reuses one
 * they already use somewhere else.
 *
 * The alphabet deliberately excludes `0/O`, `1/l/I` and `5/S`. This password is
 * going to be read aloud, typed from a screenshot, or pasted into a chat
 * message and re-typed at the other end; a character pair nobody can tell
 * apart turns a working credential into a support request.
 */

const UPPER = 'ABCDEFGHJKLMNPQRTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrtuvwxyz'
const DIGITS = '234689'
const ALPHABET = UPPER + LOWER + DIGITS

/** Four groups of four, hyphenated — chunked because it gets read out loud. */
const GROUPS = 4
const GROUP_LENGTH = 4

function pick(alphabet: string): string {
  /*
   * `crypto.getRandomValues`, never `Math.random()`. This is a credential; a
   * predictable one is worse than a short one, and the modulo bias of a 256-way
   * draw over a ~52-character alphabet is not worth arguing about when the
   * rejection loop below removes it outright.
   */
  const max = Math.floor(256 / alphabet.length) * alphabet.length
  const byte = new Uint8Array(1)

  for (;;) {
    crypto.getRandomValues(byte)
    const value = byte[0]!
    if (value < max) return alphabet[value % alphabet.length]!
  }
}

export function generatePassword(): string {
  const groups: string[] = []

  for (let group = 0; group < GROUPS; group += 1) {
    let chunk = ''
    for (let index = 0; index < GROUP_LENGTH; index += 1) chunk += pick(ALPHABET)
    groups.push(chunk)
  }

  /*
   * One of each class is forced into the first group, so the result always
   * satisfies `lib/passwordPolicy` rather than satisfying it by luck — a
   * generator that occasionally produces a password the panel's own form would
   * reject is a bug that appears once every few hundred uses.
   */
  const first = pick(UPPER) + pick(LOWER) + pick(DIGITS) + pick(ALPHABET)
  groups[0] = first

  return groups.join('-')
}
