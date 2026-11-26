import { AlertTriangle, Info } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { ConfirmActionDialog, ErrorState, LoadingState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/form'
import { fieldAria } from '@/components/form/fieldAria'
import { Input } from '@/components/ui/input'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import {
  RATE_LIMIT_FIELDS,
  RATE_LIMIT_KEYS,
  type RateLimitKey,
  type RateLimitSettings,
  type SystemSettings,
} from '@/types/settings'

import { SettingsCard } from '../SettingsCard'
import { useRateLimitMutation, useSettingsQuery } from '../useSettings'
import {
  RATE_LIMIT_GROUPS,
  rangeHint,
  serverFieldErrors,
  validateRateLimit,
  type RateLimitFieldCopy,
  type RateLimitGroup,
} from './fields'
import { needsLockoutConfirm, summary, warnings } from './guards'

/**
 * Rate limiting & OTP security — `PATCH /admin/settings/rate-limiting`
 * (plan.md RL1).
 *
 * Two cards, each saving its own four fields. **Only changed fields are
 * sent**: `{}` answers `200` and changes nothing, so "did anything change" is
 * worked out here and Save stays disabled until something has.
 *
 * ⚠️ The route answers with only the eight fields; `useRateLimitMutation`
 * merges them into the shared record rather than replacing it.
 */
export function RateLimitTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useSettingsQuery()
  const settings = query.data?.settings

  /*
   * One guard for the page: `useBlocker` supports a single blocker per
   * router, so each card reports its dirtiness up here.
   */
  const [dirtyCards, setDirtyCards] = useState<Record<RateLimitGroup, boolean>>({
    otp: false,
    traffic: false,
  })
  const onOtpDirty = useCallback(
    (dirty: boolean) => setDirtyCards((prev) => ({ ...prev, otp: dirty })),
    [],
  )
  const onTrafficDirty = useCallback(
    (dirty: boolean) => setDirtyCards((prev) => ({ ...prev, traffic: dirty })),
    [],
  )
  useUnsavedChangesGuard(canEdit && (dirtyCards.otp || dirtyCards.traffic))

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !settings) {
    return (
      <ErrorState
        title="Settings could not be loaded"
        description="The rate limiting settings did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const current = readRateLimits(settings)
  if (!current) {
    /*
     * ⚠️ The fields are optional on the schema so an older backend cannot
     * blank every settings page. Here, it means this server has no such
     * feature yet — said plainly rather than shown as an empty form.
     */
    return (
      <ErrorState
        title="Rate limiting is not available on this server"
        description="This environment does not report rate limiting settings yet. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  return (
    <>
      {!canEdit ? (
        <p className="text-body text-foreground-muted">
          You can view these limits. Changing them needs permission to edit system
          settings.
        </p>
      ) : null}

      {/*
       * Two columns from `lg`, so both cards and both Save buttons fit one
       * desktop screen. `items-start`: the OTP card carries a footnote, and
       * stretching the other to match would leave a gap above its footer.
       */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <RateLimitCard
          group="otp"
          title="OTP & SMS protection"
          description="Guards the SMS balance against fraud and stops codes being guessed."
          current={current}
          canEdit={canEdit}
          updatedAt={settings.updatedAt}
          updatedBy={settings.updatedBy}
          onDirtyChange={onOtpDirty}
          footnote={
            <p className="flex items-start gap-2 text-caption text-foreground-muted">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Whitelisted Google Play reviewer numbers skip these limits, so app
                review is never held up.
              </span>
            </p>
          }
        />

        <RateLimitCard
          group="traffic"
          title="API traffic limits"
          description="Caps calls per IP address, with a stricter cap on sign-in."
          current={current}
          canEdit={canEdit}
          updatedAt={settings.updatedAt}
          updatedBy={settings.updatedBy}
          onDirtyChange={onTrafficDirty}
        />
      </div>
    </>
  )
}

/** The eight values, or `null` when the server does not return them all. */
function readRateLimits(settings: SystemSettings): RateLimitSettings | null {
  const out: Partial<RateLimitSettings> = {}
  for (const key of RATE_LIMIT_KEYS) {
    const value = settings[key]
    if (typeof value !== 'number') return null
    out[key] = value
  }
  return out as RateLimitSettings
}

type Values = Partial<Record<RateLimitKey, string>>

function valuesFor(
  fields: readonly RateLimitFieldCopy[],
  source: RateLimitSettings,
): Values {
  return Object.fromEntries(fields.map((f) => [f.key, String(source[f.key])])) as Values
}

interface RateLimitCardProps {
  group: RateLimitGroup
  title: string
  description: string
  current: RateLimitSettings
  canEdit: boolean
  updatedAt: string
  updatedBy: string | null
  onDirtyChange: (dirty: boolean) => void
  footnote?: React.ReactNode
}

function RateLimitCard({
  group,
  title,
  description,
  current,
  canEdit,
  updatedAt,
  updatedBy,
  onDirtyChange,
  footnote,
}: RateLimitCardProps) {
  const fields = RATE_LIMIT_GROUPS[group]
  const keys = useMemo(() => fields.map((f) => f.key), [fields])

  /*
   * ⚠️ Re-seeded when **this card's** values change on the server, not on
   * `updatedAt`. Saving the other card moves `updatedAt`, and keying on it
   * would wipe this card's unsaved edits.
   */
  const baseline = useMemo(() => valuesFor(fields, current), [fields, current])
  const baselineKey = JSON.stringify(baseline)
  const seededKey = useRef<string | null>(null)

  const [values, setValues] = useState<Values>(baseline)
  const [touched, setTouched] = useState<Partial<Record<RateLimitKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<RateLimitKey, string>>
  >({})

  const seed = useCallback((next: Values) => {
    setValues(next)
    setTouched({})
    setSubmitted(false)
    setServerErrors({})
  }, [])

  useEffect(() => {
    if (seededKey.current === baselineKey) return
    seededKey.current = baselineKey
    seed(JSON.parse(baselineKey) as Values)
  }, [baselineKey, seed])

  const mutation = useRateLimitMutation((saved) => {
    seed(valuesFor(fields, saved))
    toast.success('Security & rate limiting settings updated. They apply immediately.')
  })

  const changed = keys.filter((key) => (values[key] ?? '').trim() !== baseline[key])
  const dirty = changed.length > 0
  const clientErrors = Object.fromEntries(
    keys.map((key) => [key, validateRateLimit(key, values[key] ?? '')]),
  ) as Record<RateLimitKey, string | null>
  const valid = keys.every((key) => clientErrors[key] === null)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  /*
   * The full set the server would hold after this save — the card's typed
   * values over the current record. `null` while any field is invalid, so the
   * summary and warnings only ever describe something that could be saved.
   */
  const next: RateLimitSettings | null = valid
    ? {
        ...current,
        ...Object.fromEntries(
          keys.map((key) => [key, Number((values[key] ?? '').trim())]),
        ),
      }
    : null
  const shownSettings = next ?? current
  const notes = next ? warnings(group, next) : []

  const [confirming, setConfirming] = useState(false)

  const defaults = Object.fromEntries(
    keys.map((key) => [key, String(RATE_LIMIT_FIELDS[key].default)]),
  ) as Values
  const atDefaults = keys.every((key) => (values[key] ?? '').trim() === defaults[key])

  function send(onDone?: () => void) {
    const payload: Partial<RateLimitSettings> = {}
    for (const key of changed) payload[key] = Number((values[key] ?? '').trim())

    void mutation
      .mutateAsync(payload)
      .then(() => onDone?.())
      .catch((error: unknown) => {
        onDone?.()
        if (isAppError(error)) setServerErrors(serverFieldErrors(error.message, keys))
      })
  }

  function submit() {
    setSubmitted(true)
    if (!dirty || !valid || !next) return

    /*
     * ⚠️ Tightening traffic limits below a safe rate asks first: admin routes
     * and admin sign-in count against them too (plan.md O4).
     */
    if (needsLockoutConfirm(current, next)) {
      setConfirming(true)
      return
    }
    send()
  }

  return (
    <SettingsCard
      title={title}
      description={description}
      {...(canEdit
        ? {
            onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              submit()
            },
            onDiscard: () => seed(baseline),
          }
        : {})}
      isDirty={dirty}
      canSave={valid}
      isSaving={mutation.isPending}
      error={mutation.error}
      updatedAt={updatedAt}
      updatedBy={updatedBy}
      {...(canEdit
        ? {
            footerExtra: (
              <Button
                type="button"
                variant="outline"
                disabled={atDefaults}
                onClick={() => {
                  setValues(defaults)
                  setServerErrors({})
                }}
              >
                Use recommended
              </Button>
            ),
          }
        : {})}
    >
      <fieldset
        disabled={!canEdit}
        /*
         * Pairs side by side at every width but a phone: a value and its
         * window read as one setting, and one column doubles the height.
         */
        className="grid gap-4 sm:grid-cols-2"
      >
        <legend className="sr-only">{title}</legend>
        {fields.map((field) => {
          const shown =
            serverErrors[field.key] ??
            (touched[field.key] || submitted ? clientErrors[field.key] : null)
          const hint = (
            <>
              {field.hint} {/* Never split a range across lines ("10–" / "1,000"). */}
              <span className="whitespace-nowrap">
                {rangeHint(field.key, field.unit)}
              </span>
            </>
          )
          return (
            <FormField
              key={field.key}
              id={`rl-${field.key}`}
              label={field.label}
              hint={hint}
              error={shown ?? undefined}
            >
              <div className="relative">
                <Input
                  {...fieldAria(`rl-${field.key}`, true, Boolean(shown))}
                  inputMode="numeric"
                  autoComplete="off"
                  className="pr-20 tabular-nums"
                  value={values[field.key] ?? ''}
                  onChange={(event) => {
                    const next = event.target.value
                    setValues((prev) => ({ ...prev, [field.key]: next }))
                    setServerErrors((prev) => {
                      const { [field.key]: _drop, ...rest } = prev
                      return rest
                    })
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-foreground-muted"
                >
                  {field.unit}
                </span>
              </div>
            </FormField>
          )
        })}
      </fieldset>

      {/*
       * Rebuilt as the operator types, from valid values only. `aria-live`
       * so a screen-reader user hears what a change means, not just the
       * number they typed.
       */}
      <p
        aria-live="polite"
        data-testid={`rl-summary-${group}`}
        className="rounded-md bg-surface-muted px-3 py-2 text-body lg:text-caption xl:text-body"
      >
        {summary(group, shownSettings)}
      </p>

      {notes.length > 0 ? (
        <ul className="space-y-2" aria-label="Warnings">
          {notes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-caption text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {footnote}

      {next ? (
        <ConfirmActionDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Tighten API traffic limits"
          target="Every CallsChat client, including this admin panel"
          effect="Requests over the new limits are refused until the window resets. The general limit is per IP address, so admins on one office network share it — set it too low and nobody can use this panel to undo it."
          severity="critical"
          reason="none"
          confirmLabel="Apply limits"
          loading={mutation.isPending}
          details={
            <ul className="space-y-1 text-body">
              {fields
                .filter((field) => changed.includes(field.key))
                .map((field) => (
                  <li key={field.key} className="flex justify-between gap-4">
                    <span>{field.label}</span>
                    <span className="tabular-nums">
                      {current[field.key].toLocaleString()} →{' '}
                      <strong>{next[field.key].toLocaleString()}</strong> {field.unit}
                    </span>
                  </li>
                ))}
            </ul>
          }
          onConfirm={() => send(() => setConfirming(false))}
        />
      ) : null}
    </SettingsCard>
  )
}
