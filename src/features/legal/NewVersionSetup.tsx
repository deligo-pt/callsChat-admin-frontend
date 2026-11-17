import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { fieldAria, FormField } from '@/components/form'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import {
  LEGAL_APP_TYPES,
  LEGAL_DOCUMENT_TYPES,
  SEMVER_PATTERN,
  type LegalAppType,
  type LegalDocument,
  type LegalDocumentType,
} from '@/types/legal'

import { activeByType, APP_LABELS, seriesLabel, TYPE_LABELS } from './labels'
import { bumpVersion, latestVersion, nextFreeVersion, type Bump } from './legalForm'

/**
 * Step one of a new draft: which app, which policy, which version, from when.
 *
 * These are the fields that can't change once the draft exists, so they are
 * settled here, in one small card, and the editor that follows is all about
 * the text. A version already taken is refused here instead of by a 409.
 *
 * The app is fixed with the rest (plan.md LB3, decision 2). The first version
 * of a policy in one app can start from the other app's live text (decision
 * 3) — how the Business set gets written from the Personal one.
 */

export interface NewVersionChoice {
  readonly documentType: LegalDocumentType
  readonly appType: LegalAppType
  readonly version: string
  readonly effectiveDate: string
  /** The other app's live version to copy the text from, when chosen here. */
  readonly fromId?: string | undefined
}

type StartFrom = 'blank' | 'other'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function NewVersionSetup({
  docs,
  initial,
  source,
  onContinue,
  onCancel,
}: {
  docs: readonly LegalDocument[]
  initial: NewVersionChoice
  source?: LegalDocument | undefined
  onContinue: (choice: NewVersionChoice) => void
  /** Back to the editor when the operator came from there; otherwise a link out. */
  onCancel?: (() => void) | undefined
}) {
  const [app, setApp] = useState<LegalAppType>(initial.appType)
  const [type, setType] = useState<LegalDocumentType>(initial.documentType)
  const [version, setVersion] = useState(initial.version)
  const [day, setDay] = useState(initial.effectiveDate)
  const [startFrom, setStartFrom] = useState<StartFrom>(
    initial.fromId ? 'other' : 'blank',
  )
  const [submitted, setSubmitted] = useState(false)

  const latest = latestVersion(docs, type, app)
  const otherApp: LegalAppType = app === 'PERSONAL' ? 'BUSINESS' : 'PERSONAL'
  /*
   * Offered only for a policy's first version in this app: once it has one,
   * "New version" copies forward from that, as it always did.
   */
  const otherActive =
    !source && !latest ? activeByType(docs, otherApp)[type] : undefined
  const copyFrom = otherActive && startFrom === 'other' ? otherActive : undefined
  const taken = docs.some(
    (doc) =>
      doc.documentType === type &&
      doc.appType === app &&
      doc.version === version.trim(),
  )
  const versionError = !SEMVER_PATTERN.test(version.trim())
    ? 'Use a version like 1.0.0, 1.1.0 or 2.0.0.'
    : taken
      ? `v${version.trim()} of the ${seriesLabel(type, app)} already exists. Pick another number.`
      : undefined
  const dayError = DAY.test(day)
    ? undefined
    : 'Pick the date this version takes effect.'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (versionError || dayError) return
    onContinue({
      documentType: type,
      appType: app,
      version: version.trim(),
      effectiveDate: day,
      fromId: copyFrom?.id,
    })
  }

  /* Back to the overview of the app the operator came from (plan.md LB2). */
  const overview = ROUTES.legalFor({ tab: 'drafts', app: initial.appType })

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-2 pb-4 lg:max-w-5xl">
      {/*
       * The way out sits at the top, as on every other sub-page (the
       * Withdrawals settings pattern): Cancel alone was below the fold.
       */}
      {onCancel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 self-start"
          onClick={onCancel}
        >
          <ArrowLeft /> Back to the text
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="-ml-2.5 self-start" asChild>
          <Link to={overview}>
            <ArrowLeft /> Legal & policies
          </Link>
        </Button>
      )}
      <Card>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 md:gap-6">
          <CardHeader>
            <CardTitle>
              <h1 className="text-h2">
                {source
                  ? `New version of the ${seriesLabel(type, app)}`
                  : 'New legal draft'}
              </h1>
            </CardTitle>
            <CardDescription>
              {source
                ? `The text, contact and consent line are copied from v${source.version}. Nothing is public until it's published.`
                : copyFrom
                  ? `The text, contact and consent line are copied from ${APP_LABELS[copyFrom.appType]} v${copyFrom.version}. Nothing is public until it's published.`
                  : 'Nothing is public until the draft is published.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5 lg:grid-cols-2 lg:gap-x-10">
            {/*
             * Two columns from lg (user report 2026-11-17): what the draft is
             * on the left, its number and date on the right, so the whole
             * step fits a desktop screen without scrolling.
             */}
            <div className="min-w-0 space-y-5">
              <FormField
                id="setup-app"
                label="App"
                required
                hint={
                  source
                    ? undefined
                    : 'Each app has its own policies and version numbers. This can’t change later.'
                }
              >
                <Select
                  value={app}
                  disabled={Boolean(source)}
                  onValueChange={(next) => {
                    const nextApp = next as LegalAppType
                    setApp(nextApp)
                    setVersion(nextFreeVersion(docs, type, nextApp))
                  }}
                >
                  <SelectTrigger id="setup-app" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_APP_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {APP_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField id="setup-type" label="Policy" required>
                <Select
                  value={type}
                  disabled={Boolean(source)}
                  onValueChange={(next) => {
                    const nextType = next as LegalDocumentType
                    setType(nextType)
                    setVersion(nextFreeVersion(docs, nextType, app))
                  }}
                >
                  <SelectTrigger id="setup-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_DOCUMENT_TYPES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {TYPE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {otherActive ? (
                <fieldset className="space-y-2">
                  <legend className="text-body-strong text-foreground">
                    Start from
                  </legend>
                  <p className="text-caption text-foreground-muted">
                    This is the first {seriesLabel(type, app)}. The{' '}
                    {APP_LABELS[otherApp]} app already has one live.
                  </p>
                  <RadioGroup
                    value={startFrom}
                    onValueChange={(next) => setStartFrom(next as StartFrom)}
                    aria-label="Start from"
                    className="gap-2"
                  >
                    {(
                      [
                        ['blank', 'A blank template'],
                        [
                          'other',
                          `${APP_LABELS[otherApp]} v${otherActive.version} (active), copied to edit`,
                        ],
                      ] as const
                    ).map(([value, text]) => (
                      <label
                        key={value}
                        htmlFor={`setup-start-${value}`}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-md border bg-surface p-3 transition-colors',
                          startFrom === value
                            ? 'border-primary'
                            : 'border-border hover:bg-surface-muted',
                        )}
                      >
                        <RadioGroupItem id={`setup-start-${value}`} value={value} />
                        <span className="text-body">{text}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
              ) : null}
            </div>

            <div className="min-w-0 space-y-5">
              <FormField
                id="setup-version"
                label="Version"
                required
                hint={
                  latest
                    ? `Highest so far: v${latest}. Fix for wording, Update for new rules, Major for a rewrite.`
                    : 'The first version of this policy.'
                }
                error={submitted ? versionError : undefined}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    {...fieldAria(
                      'setup-version',
                      true,
                      submitted && Boolean(versionError),
                    )}
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    inputMode="decimal"
                    className="w-32 font-mono"
                  />
                  {latest
                    ? (['patch', 'minor', 'major'] as const).map((bump: Bump) => {
                        const next = bumpVersion(latest, bump)
                        return (
                          <Button
                            key={bump}
                            type="button"
                            size="sm"
                            variant={version === next ? 'secondary' : 'outline'}
                            aria-pressed={version === next}
                            onClick={() => setVersion(next)}
                          >
                            {bump === 'patch'
                              ? 'Fix'
                              : bump === 'minor'
                                ? 'Update'
                                : 'Major'}
                            <span className="font-mono text-foreground-muted">
                              {next}
                            </span>
                          </Button>
                        )
                      })
                    : null}
                </div>
              </FormField>

              <FormField
                id="setup-effective"
                label="Effective date"
                required
                hint="A future date gives users advance notice. You can change it later."
                error={submitted ? dayError : undefined}
              >
                <Input
                  type="date"
                  {...fieldAria(
                    'setup-effective',
                    true,
                    submitted && Boolean(dayError),
                  )}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  className="w-48"
                />
              </FormField>
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Back to the text
              </Button>
            ) : (
              <Button type="button" variant="outline" asChild>
                <Link to={overview}>Cancel</Link>
              </Button>
            )}
            <Button type="submit">Continue</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
