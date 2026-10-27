import { useCallback, useEffect, useRef, useState } from 'react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ErrorState, LoadingState } from '@/components/feedback'
import { FormField } from '@/components/form'
import { Input } from '@/components/ui/input'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import type { SystemSettings } from '@/types/settings'

import { updateEconomySettings } from '../api'
import { SettingsCard } from '../SettingsCard'
import { useSettingsMutation, useSettingsQuery } from '../useSettings'

/**
 * Diamond economy rules — `PATCH /admin/settings/economy` (plan.md §5, W7).
 *
 * ⚠️ **A tab here rather than a screen in the diamonds module**, because this
 * route writes the **same `id: "primary"` singleton** that every other tab on
 * this page writes. Two features mutating one record through two optimistic
 * paths is the class of bug the bootstrap work spent a phase removing.
 *
 * ⚠️ **An empty body answers `200`** (plan.md O8). The server will happily
 * accept a save that changes nothing and report success, so the card's dirty
 * state is computed here and the Save button is the only thing standing
 * between an operator and a meaningless write. Nothing reports success from
 * the status code alone.
 *
 * ⚠️ **Two fields, not the guide's three.** `defaultHostRevenueSharePercent`
 * is documented and is not in the record — all 25 keys were read on
 * 2026-10-27. Revenue share is per host, on `LiveHostProfile`, and the roster
 * shows it there (plan.md O9).
 */

/** What the backend accepts, measured: `-1` is `Bonus cannot be negative`. */
const MIN_VALUE = 0

/*
 * ⚠️ No upper bound is enforced server-side. These are soft ceilings for the
 * client only, chosen to catch a slipped digit — 50 becoming 500000 is a
 * plausible typo and an expensive one, since the bonus is granted to **every**
 * new registration automatically.
 */
const BONUS_SANITY_MAX = 10_000
const TRANSFER_SANITY_MAX = 1_000_000

function text(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : ''
}

export function EconomyTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()

  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [bonus, setBonus] = useState('')
  const [transferLimit, setTransferLimit] = useState('')
  const [bonusError, setBonusError] = useState<string | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)

  const settings = query.data?.settings
  const seededVersion = useRef<string | null>(null)

  const seed = useCallback((record: SystemSettings) => {
    seededVersion.current = record.updatedAt
    setBonus(text(record.newUserDiamondBonus))
    setTransferLimit(text(record.minCreatorTransferLimit))
    setBonusError(null)
    setLimitError(null)
  }, [])

  useEffect(() => {
    if (!settings) return
    if (seededVersion.current === settings.updatedAt) return
    seed(settings)
  }, [settings, seed])

  const mutation = useSettingsMutation(updateEconomySettings, (saved) => {
    seed(saved)
    setSavedMessage('Saved. New registrations use this immediately.')
  })

  /*
   * ⚠️ Computed here, not inferred from the response. The route returns `200`
   * for an empty body, so "did anything change" is a question only the client
   * can answer.
   */
  const dirty = settings
    ? bonus !== text(settings.newUserDiamondBonus) ||
      transferLimit !== text(settings.minCreatorTransferLimit)
    : false

  useUnsavedChangesGuard(dirty && canEdit)

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The economy settings did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  function validate(
    raw: string,
    max: number,
    setError: (message: string | null) => void,
  ): number | null {
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isInteger(parsed)) {
      setError('Enter a whole number of diamonds.')
      return null
    }
    if (parsed < MIN_VALUE) {
      /* The server's own wording for the bonus; reused for both. */
      setError('Cannot be negative.')
      return null
    }
    if (parsed > max) {
      setError(
        `That looks like a slipped digit — the most this accepts here is ${max}.`,
      )
      return null
    }
    setError(null)
    return parsed
  }

  function submit() {
    const nextBonus = validate(bonus, BONUS_SANITY_MAX, setBonusError)
    const nextLimit = validate(transferLimit, TRANSFER_SANITY_MAX, setLimitError)
    if (nextBonus === null || nextLimit === null) return

    /*
     * ⚠️ Both fields are sent, including the unchanged one. `PATCH` here is
     * partial, so a diff would be smaller — but there is no detail route to
     * re-read from and no concurrency token on this record, so sending the
     * complete picture is the safest thing the client can state.
     */
    void mutation
      .mutateAsync({
        newUserDiamondBonus: nextBonus,
        minCreatorTransferLimit: nextLimit,
      })
      .catch(() => {
        /* Rendered by the card's error slot. */
      })
  }

  return (
    <SettingsCard
      title="Diamond economy"
      description="Platform-wide rules for how diamonds enter the economy and leave the Creator Studio."
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onDiscard={() => seed(settings)}
      isDirty={dirty}
      isSaving={mutation.isPending}
      error={mutation.error}
      successMessage={dirty ? null : savedMessage}
      updatedAt={settings.updatedAt}
      updatedBy={settings.updatedBy}
    >
      <fieldset disabled={!canEdit} className="contents space-y-4">
        <FormField
          id="newUserDiamondBonus"
          label="Signup bonus"
          /*
           * ⚠️ The cost is stated because it is per registration, not a
           * one-off. At 50 diamonds and a thousand signups a day this is
           * 50,000 diamonds a day leaving the house, and the field gives no
           * other clue.
           */
          hint="Diamonds granted automatically to every new account on registration. Set 0 to grant none."
          error={bonusError ?? undefined}
        >
          <Input
            id="newUserDiamondBonus"
            inputMode="numeric"
            value={bonus}
            onChange={(event) => setBonus(event.target.value)}
          />
        </FormField>

        <FormField
          id="minCreatorTransferLimit"
          label="Minimum creator transfer"
          /*
           * ⚠️ One-way, and worth saying. A host converting earnings into
           * spending diamonds can never convert them back — the bridge is
           * deliberately one-directional so promotional diamonds cannot be
           * laundered into a cash-out (guide §1).
           */
          hint="The fewest diamonds a host may move from their Creator Studio into their spending wallet at once. The transfer is one-way and cannot be reversed."
          error={limitError ?? undefined}
        >
          <Input
            id="minCreatorTransferLimit"
            inputMode="numeric"
            value={transferLimit}
            onChange={(event) => setTransferLimit(event.target.value)}
          />
        </FormField>

        {/*
         * ⚠️ Said plainly, because the guide documents a third field here and
         * an operator who read it will come looking for it.
         */}
        <p className="text-caption text-foreground-muted">
          The host revenue split is set per host, not globally — it appears on each
          creator&rsquo;s row in the live host roster.
        </p>
      </fieldset>
    </SettingsCard>
  )
}
