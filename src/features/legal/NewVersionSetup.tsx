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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LEGAL_DOCUMENT_TYPES,
  SEMVER_PATTERN,
  type LegalDocument,
  type LegalDocumentType,
} from '@/types/legal'

import { TYPE_LABELS } from './labels'
import { bumpVersion, latestVersion, nextFreeVersion, type Bump } from './legalForm'

/**
 * Step one of a new draft: which policy, which version, from when.
 *
 * These are the fields that can't change once the draft exists, so they are
 * settled here, in one small card, and the editor that follows is all about
 * the text. A version already taken is refused here instead of by a 409.
 */

export interface NewVersionChoice {
  readonly documentType: LegalDocumentType
  readonly version: string
  readonly effectiveDate: string
}

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
  const [type, setType] = useState<LegalDocumentType>(initial.documentType)
  const [version, setVersion] = useState(initial.version)
  const [day, setDay] = useState(initial.effectiveDate)
  const [submitted, setSubmitted] = useState(false)

  const latest = latestVersion(docs, type)
  const taken = docs.some(
    (doc) => doc.documentType === type && doc.version === version.trim(),
  )
  const versionError = !SEMVER_PATTERN.test(version.trim())
    ? 'Use a version like 1.0.0, 1.1.0 or 2.0.0.'
    : taken
      ? `v${version.trim()} of the ${TYPE_LABELS[type]} already exists. Pick another number.`
      : undefined
  const dayError = DAY.test(day)
    ? undefined
    : 'Pick the date this version takes effect.'

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (versionError || dayError) return
    onContinue({ documentType: type, version: version.trim(), effectiveDate: day })
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <Card>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 md:gap-6">
          <CardHeader>
            <CardTitle>
              <h1 className="text-h2">
                {source ? `New version of the ${TYPE_LABELS[type]}` : 'New legal draft'}
              </h1>
            </CardTitle>
            <CardDescription>
              {source
                ? `The text, contact and consent line are copied from v${source.version}. Nothing is public until it's published.`
                : 'Nothing is public until the draft is published.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <FormField id="setup-type" label="Policy" required>
              <Select
                value={type}
                disabled={Boolean(source)}
                onValueChange={(next) => {
                  const nextType = next as LegalDocumentType
                  setType(nextType)
                  setVersion(nextFreeVersion(docs, nextType))
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
                {...fieldAria('setup-effective', true, submitted && Boolean(dayError))}
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className="w-48"
              />
            </FormField>
          </CardContent>

          <CardFooter className="justify-end gap-2">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Back to the text
              </Button>
            ) : (
              <Button type="button" variant="outline" asChild>
                <Link to={ROUTES.legal}>Cancel</Link>
              </Button>
            )}
            <Button type="submit">Continue</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
