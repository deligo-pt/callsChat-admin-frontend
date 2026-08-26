import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { humaniseEnum } from '@/lib/status'
import type { UserDetail, UserIdentity } from '@/types/identity'

import { updateUserEmail, updateUserProfile } from './actions'
import { useUserMutation } from './useUserMutation'

const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const

/** `undefined` for an unchanged field, so the patch carries only real edits. */
function changed(next: string, previous: string | null): string | undefined {
  const trimmed = next.trim()
  if (trimmed === (previous ?? '')) return undefined
  return trimmed
}

/** Loose on purpose: numbers vary worldwide and the backend does not validate. */
const PHONE_PATTERN = /^\+?[0-9\s()-]{6,20}$/

/**
 * Edit a user's profile.
 *
 * plan.md §3.5: this is a sensitive change to someone else's record, so it goes
 * through the same confirm-and-reason gateway as suspend or ban rather than
 * being a quietly-saving inline form.
 */
export function EditProfileAction({ user }: { user: UserDetail }) {
  const [open, setOpen] = useState(false)
  const { identity, overview } = user

  const [displayName, setDisplayName] = useState(identity.displayName)
  const [username, setUsername] = useState(identity.username ?? '')
  const [phone, setPhone] = useState(identity.phone ?? '')
  const [country, setCountry] = useState(overview.country ?? '')
  const [gender, setGender] = useState(overview.gender ?? '')
  const [bio, setBio] = useState(overview.bio ?? '')

  const phoneInvalid = phone.trim() !== '' && !PHONE_PATTERN.test(phone.trim())
  const nameEmpty = displayName.trim() === ''

  const patch = {
    displayName: changed(displayName, identity.displayName),
    username: changed(username, identity.username),
    phone: changed(phone, identity.phone),
    country: changed(country, overview.country),
    bio: changed(bio, overview.bio),
    gender: changed(gender, overview.gender) as UpdateGender | undefined,
  }

  const nothingChanged = Object.values(patch).every((value) => value === undefined)

  const mutation = useUserMutation({
    userId: identity.id,
    mutationFn: (reason: string) =>
      updateUserProfile(identity.id, {
        ...Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        ),
        reason,
      }),
    successMessage: 'Profile updated.',
    onSuccess: () => setOpen(false),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit profile
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit profile"
        target={`${identity.displayName} (${identity.id})`}
        effect="These details change on the user's account. Only the fields you alter are sent."
        severity="warning"
        confirmLabel="Save changes"
        loading={mutation.isPending}
        // Confirming an unchanged form would write a meaningless audit entry.
        confirmDisabled={nothingChanged || nameEmpty || phoneInvalid}
        onConfirm={(reason) => mutation.mutate(reason)}
        fields={
          /* plan.md §6.3: 1 column below md, 2 above. */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Display name <span className="text-danger">*</span>
              </Label>
              <Input
                id="edit-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-invalid={nameEmpty || undefined}
              />
              {nameEmpty ? (
                <p role="alert" className="text-caption text-danger">
                  A display name is required.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={phoneInvalid || undefined}
              />
              {/*
                The backend accepts ANY string here, so this check is the only
                thing standing between a typo and a permanently unreachable
                account. It is a guard, not a guarantee.
              */}
              {phoneInvalid ? (
                <p role="alert" className="text-caption text-danger">
                  That does not look like a phone number. The server does not check
                  this, so a mistake here is not recoverable from the UI.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-country">Country</Label>
              <Input
                id="edit-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-gender">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="edit-gender" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humaniseEnum(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-bio">Bio</Label>
              <Textarea
                id="edit-bio"
                rows={2}
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </div>

            {nothingChanged ? (
              <p className="text-caption text-foreground-muted md:col-span-2">
                Change a field to continue.
              </p>
            ) : null}
          </div>
        }
      />
    </>
  )
}

type UpdateGender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'

/**
 * Change a user's email address.
 *
 * Separate from the profile form because the email is the account's identity
 * and carries its own verified flag — bundling it into a general edit would
 * make a significant change look incidental.
 */
export function EditEmailAction({ user }: { user: UserDetail }) {
  const [open, setOpen] = useState(false)
  const { identity } = user

  const [email, setEmail] = useState(identity.email ?? '')
  const [verified, setVerified] = useState(false)

  const trimmed = email.trim()
  const invalid = trimmed === '' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)
  const unchanged = trimmed === (identity.email ?? '')

  const mutation = useUserMutation({
    userId: identity.id,
    mutationFn: (reason: string) =>
      updateUserEmail(identity.id, { email: trimmed, emailVerified: verified, reason }),
    successMessage: 'Email address updated.',
    onSuccess: () => setOpen(false),
  })

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change email
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Change email address"
        target={`${identity.displayName} (${identity.id})`}
        effect="This becomes the account's email address. The user is not asked to confirm it."
        severity="warning"
        confirmLabel="Update email"
        loading={mutation.isPending}
        confirmDisabled={invalid || (unchanged && !verified)}
        onConfirm={(reason) => mutation.mutate(reason)}
        fields={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">
                New email address <span className="text-danger">*</span>
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={(trimmed !== '' && invalid) || undefined}
              />
              {trimmed !== '' && invalid ? (
                <p role="alert" className="text-caption text-danger">
                  Enter a valid email address.
                </p>
              ) : null}
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="edit-email-verified"
                checked={verified}
                onCheckedChange={(checked) => setVerified(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="edit-email-verified" className="font-normal">
                  Mark this address as verified
                </Label>
                {/*
                  Marking verified bypasses the confirmation the user would
                  normally complete, so it deserves to be an explicit, opt-in
                  choice rather than a default.
                */}
                <p className="text-caption text-foreground-muted">
                  Only do this when you have confirmed ownership another way.
                </p>
              </div>
            </div>
          </div>
        }
      />
    </>
  )
}

export type { UserIdentity }
