import { ArrowLeft } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DateTime, PageHeader } from '@/components/display'
import { ConfirmActionDialog, ErrorState, LoadingState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatDiamonds } from '@/lib/format'
import {
  previewPayout,
  type WithdrawalSettings,
  type WithdrawalSettingsPatch,
} from '@/types/withdrawals'

import { formatBdt, WITHDRAWAL_TIME_ZONE } from './labels'
import { useUpdateWithdrawalSettings, useWithdrawalSettings } from './useWithdrawals'

/**
 * Withdrawal settings — `/withdrawals/settings` (plan.md W4).
 *
 * Everyone with `withdrawals.view` can read them; only `payout_rates.configure`
 * (Super Admin) can change them. The form sends only the fields that changed,
 * and the confirm step lists each one, old → new. Turning withdrawals off is
 * its own, louder confirmation: it stops every host at once.
 *
 * The conversion rate is edited as "diamonds per ৳1" because that is how
 * people say it ("100 diamonds = 1 taka"); the API stores taka per diamond.
 */

interface Draft {
  minAmount: string
  maxAmount: string
  diamondsPerTaka: string
  feePercent: string
  feeFlat: string
  maxPaymentDetailsPerUser: string
  withdrawalsEnabled: boolean
}

function toDraft(s: WithdrawalSettings): Draft {
  return {
    minAmount: String(s.minAmount),
    maxAmount: String(s.maxAmount),
    diamondsPerTaka:
      s.conversionRate > 0
        ? String(Math.round((1 / s.conversionRate) * 10000) / 10000)
        : '',
    feePercent: String(s.feePercent),
    feeFlat: String(s.feeFlat),
    maxPaymentDetailsPerUser: String(s.maxPaymentDetailsPerUser),
    withdrawalsEnabled: s.withdrawalsEnabled,
  }
}

type Errors = Partial<Record<keyof Draft, string>>

const isInt = (text: string) => /^\d+$/.test(text.trim())
const isNumber = (text: string) => /^\d+(\.\d+)?$/.test(text.trim())

function validate(draft: Draft): {
  errors: Errors
  values: WithdrawalSettingsPatch | null
} {
  const errors: Errors = {}
  if (!isInt(draft.minAmount) || Number(draft.minAmount) < 1)
    errors.minAmount = 'A whole number of diamonds, at least 1.'
  if (!isInt(draft.maxAmount) || Number(draft.maxAmount) < 1)
    errors.maxAmount = 'A whole number of diamonds, at least 1.'
  if (
    !errors.minAmount &&
    !errors.maxAmount &&
    Number(draft.minAmount) > Number(draft.maxAmount)
  )
    errors.maxAmount = 'The maximum must be at least the minimum.'
  if (!isNumber(draft.diamondsPerTaka) || Number(draft.diamondsPerTaka) <= 0)
    errors.diamondsPerTaka = 'How many diamonds make ৳1 — a number above 0.'
  if (!isNumber(draft.feePercent) || Number(draft.feePercent) > 100)
    errors.feePercent = 'A percentage from 0 to 100.'
  if (!isNumber(draft.feeFlat)) errors.feeFlat = 'An amount in taka, 0 or more.'
  if (
    !isInt(draft.maxPaymentDetailsPerUser) ||
    Number(draft.maxPaymentDetailsPerUser) < 1
  )
    errors.maxPaymentDetailsPerUser = 'A whole number, at least 1.'

  if (Object.keys(errors).length > 0) return { errors, values: null }
  return {
    errors,
    values: {
      minAmount: Number(draft.minAmount),
      maxAmount: Number(draft.maxAmount),
      conversionRate: Math.round((1 / Number(draft.diamondsPerTaka)) * 1e6) / 1e6,
      feePercent: Number(draft.feePercent),
      feeFlat: Number(draft.feeFlat),
      maxPaymentDetailsPerUser: Number(draft.maxPaymentDetailsPerUser),
      withdrawalsEnabled: draft.withdrawalsEnabled,
    },
  }
}

const LABELS: Record<keyof WithdrawalSettingsPatch, string> = {
  minAmount: 'Minimum withdrawal',
  maxAmount: 'Maximum withdrawal',
  conversionRate: 'Conversion rate',
  feePercent: 'Fee (percent)',
  feeFlat: 'Fee (flat)',
  maxPaymentDetailsPerUser: 'Saved accounts per host',
  withdrawalsEnabled: 'Withdrawals',
}

function show(key: keyof WithdrawalSettingsPatch, value: number | boolean): string {
  switch (key) {
    case 'minAmount':
    case 'maxAmount':
      return `${formatDiamonds(Number(value))} diamonds`
    case 'conversionRate':
      return `${formatDiamonds(Math.round(1 / Number(value)))} diamonds = ৳1`
    case 'feePercent':
      return `${String(value)}%`
    case 'feeFlat':
      return formatBdt(Number(value))
    case 'maxPaymentDetailsPerUser':
      return String(value)
    case 'withdrawalsEnabled':
      return value ? 'On' : 'Off'
  }
}

function changes(current: WithdrawalSettings, next: WithdrawalSettingsPatch) {
  return (Object.keys(next) as (keyof WithdrawalSettingsPatch)[])
    .filter((key) => next[key] !== undefined && next[key] !== current[key])
    .map((key) => ({ key, from: current[key], to: next[key] as number | boolean }))
}

function NumberField({
  label,
  hint,
  value,
  error,
  disabled,
  suffix,
  onChange,
}: {
  label: string
  hint: ReactNode
  value: string
  error: string | undefined
  disabled: boolean
  suffix?: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          className="tabular"
        />
        {suffix ? (
          <span className="shrink-0 text-caption text-foreground-muted">{suffix}</span>
        ) : null}
      </div>
      <p
        id={`${id}-hint`}
        className={
          error
            ? 'text-caption text-danger-foreground'
            : 'text-caption text-foreground-muted'
        }
        role={error ? 'alert' : undefined}
      >
        {error ?? hint}
      </p>
    </div>
  )
}

function SettingsForm({ settings }: { settings: WithdrawalSettings }) {
  const canEdit = useCan(PERMISSIONS.payoutRatesConfigure)
  const save = useUpdateWithdrawalSettings()
  const [draft, setDraft] = useState(() => toDraft(settings))
  const [synced, setSynced] = useState(settings)
  const [confirming, setConfirming] = useState(false)
  const [tried, setTried] = useState(false)
  const switchId = useId()

  // A refetch with new values (another admin saved) resets an untouched form.
  if (synced !== settings) {
    setSynced(settings)
    setDraft(toDraft(settings))
  }

  const { errors, values } = validate(draft)
  const diff = values ? changes(settings, values) : []
  const turningOff = diff.some(
    (change) => change.key === 'withdrawalsEnabled' && change.to === false,
  )
  const shownErrors = tried ? errors : {}
  const set = (key: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const sample = values ? Math.max(values.minAmount ?? 0, 1000) : 1000
  const preview = values
    ? previewPayout(sample, {
        conversionRate: values.conversionRate ?? settings.conversionRate,
        feePercent: values.feePercent ?? settings.feePercent,
        feeFlat: values.feeFlat ?? settings.feeFlat,
      })
    : null

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (values && diff.length > 0) setConfirming(true)
      }}
    >
      {!canEdit ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-body text-foreground-muted">
          Only a Super Admin can change these settings. You can see them here.
        </p>
      ) : null}

      <section
        aria-label="Withdrawals switch"
        className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-border bg-surface p-4 sm:p-6"
      >
        <div className="min-w-0 space-y-1">
          <Label htmlFor={switchId} className="text-h4 font-semibold">
            Withdrawals are {draft.withdrawalsEnabled ? 'on' : 'off'}
          </Label>
          <p className="text-caption text-foreground-muted">
            When off, no host can request a withdrawal. Requests already made stay in
            the queue and can still be processed.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={draft.withdrawalsEnabled}
          disabled={!canEdit}
          onCheckedChange={(checked) =>
            setDraft((d) => ({ ...d, withdrawalsEnabled: checked }))
          }
        />
      </section>

      <section
        aria-label="Limits and fees"
        className="space-y-5 rounded-md border border-border bg-surface p-4 sm:p-6"
      >
        <h2 className="text-h4 font-semibold">Limits and fees</h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          <NumberField
            label="Minimum withdrawal"
            suffix="diamonds"
            hint="The smallest request a host can make."
            value={draft.minAmount}
            error={shownErrors.minAmount}
            disabled={!canEdit}
            onChange={set('minAmount')}
          />
          <NumberField
            label="Maximum withdrawal"
            suffix="diamonds"
            hint="The largest single request."
            value={draft.maxAmount}
            error={shownErrors.maxAmount}
            disabled={!canEdit}
            onChange={set('maxAmount')}
          />
          <NumberField
            label="Conversion rate"
            suffix="diamonds = ৳1"
            hint="How many diamonds make one taka."
            value={draft.diamondsPerTaka}
            error={shownErrors.diamondsPerTaka}
            disabled={!canEdit}
            onChange={set('diamondsPerTaka')}
          />
          <NumberField
            label="Fee (percent)"
            suffix="%"
            hint="Taken from the gross amount."
            value={draft.feePercent}
            error={shownErrors.feePercent}
            disabled={!canEdit}
            onChange={set('feePercent')}
          />
          <NumberField
            label="Fee (flat)"
            suffix="৳"
            hint="Added to the percentage fee, per request."
            value={draft.feeFlat}
            error={shownErrors.feeFlat}
            disabled={!canEdit}
            onChange={set('feeFlat')}
          />
          <NumberField
            label="Saved accounts per host"
            hint="How many payout accounts a host can keep."
            value={draft.maxPaymentDetailsPerUser}
            error={shownErrors.maxPaymentDetailsPerUser}
            disabled={!canEdit}
            onChange={set('maxPaymentDetailsPerUser')}
          />
        </div>

        <p className="rounded-md bg-surface-muted px-3 py-2 text-body" role="status">
          {preview
            ? `A host withdrawing ${formatDiamonds(sample)} diamonds gets ${formatBdt(preview.net)} (${formatBdt(preview.gross)} minus ${formatBdt(preview.fee)} fee).`
            : 'Fix the highlighted fields to see what a host would receive.'}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={diff.length === 0 && Object.keys(errors).length === 0}
              onClick={() => {
                setDraft(toDraft(settings))
                setTried(false)
              }}
            >
              Discard
            </Button>
            {tried && values && diff.length === 0 ? (
              <span className="text-caption text-foreground-muted" role="status">
                Nothing has changed.
              </span>
            ) : null}
          </>
        ) : null}
        {settings.updatedAt ? (
          <span className="text-caption text-foreground-muted sm:ml-auto">
            Last changed{' '}
            <DateTime value={settings.updatedAt} timeZone={WITHDRAWAL_TIME_ZONE} />
          </span>
        ) : null}
      </div>

      {confirming && values ? (
        <ConfirmActionDialog
          open
          onOpenChange={(next) => !next && setConfirming(false)}
          title={turningOff ? 'Turn withdrawals off' : 'Save withdrawal settings'}
          target="Withdrawal settings — every host"
          effect={
            turningOff
              ? 'No host will be able to request a withdrawal until this is switched back on. Requests already made are not affected.'
              : 'The new values apply to every new withdrawal request straight away. Requests already made keep the amounts they were made with.'
          }
          severity={turningOff ? 'critical' : 'warning'}
          reason="none"
          confirmLabel={turningOff ? 'Turn withdrawals off' : 'Save'}
          loading={save.isPending}
          details={
            <ul className="space-y-1.5 rounded-md border border-border px-3 py-2.5 text-body">
              {diff.map((change) => (
                <li key={change.key} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{LABELS[change.key]}:</span>
                  <span className="text-foreground-muted line-through">
                    {show(change.key, change.from)}
                  </span>
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">changes to</span>
                  <span>{show(change.key, change.to)}</span>
                </li>
              ))}
            </ul>
          }
          onConfirm={() => {
            const patch = Object.fromEntries(
              diff.map((change) => [change.key, change.to]),
            ) as WithdrawalSettingsPatch
            save.mutate(patch, {
              onSuccess: () => {
                setConfirming(false)
                setTried(false)
              },
            })
          }}
        />
      ) : null}
    </form>
  )
}

export function WithdrawalSettingsPage() {
  const query = useWithdrawalSettings()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="-ml-2.5 self-start" asChild>
          <Link to={ROUTES.withdrawals}>
            <ArrowLeft /> Withdrawals
          </Link>
        </Button>
        <PageHeader
          title="Withdrawal settings"
          description="Limits, conversion rate and fees for host withdrawals, and the switch that turns them off for everyone."
        />
      </div>
      {query.isPending ? (
        <LoadingState variant="detail" />
      ) : query.isError ? (
        <ErrorState
          {...(isAppError(query.error) ? { description: query.error.message } : {})}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <SettingsForm settings={query.data} />
      )}
    </div>
  )
}
