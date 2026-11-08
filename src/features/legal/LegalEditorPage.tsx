import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Columns2,
  Eye,
  MoreHorizontal,
  PencilLine,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors,
} from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ConflictError, isAppError, NotFoundError } from '@/api/errors'
import { applyServerFieldErrors, formLevelMessage } from '@/api/formErrors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { PageHeader } from '@/components/display'
import {
  ConfirmActionDialog,
  ErrorState,
  LoadingState,
  NotFoundState,
} from '@/components/feedback'
import { fieldAria, FormField, FormGrid, FormSection } from '@/components/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants,
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import {
  isLegalDocumentType,
  type LegalDocument,
  type LegalDocumentType,
} from '@/types/legal'

import { activeByType, TYPE_LABELS } from './labels'
import {
  emptyFormValues,
  formValuesFrom,
  LEGAL_FORM_FIELDS,
  legalFormSchema,
  nextFreeVersion,
  toCreatePayload,
  toUpdatePayload,
  type LegalFormValues,
} from './legalForm'
import { LegalPreview } from './LegalPreview'
import { NewVersionSetup, type NewVersionChoice } from './NewVersionSetup'
import { parseLegalMarkdown, type LegalWarning } from './parseLegalMarkdown'
import { PublishDialog } from './PublishDialog'
import {
  useCreateLegalDocument,
  useDeleteLegalDocument,
  useLegalDocument,
  useLegalDocuments,
  useUpdateLegalDocument,
} from './useLegal'

/**
 * Draft editor — `/legal/new` and `/legal/:legalId/edit` (plan.md §3.2, LG3).
 *
 * Layout (design pass, 2026-11-08):
 * - One header carries every action: save state, Save, Publish, and a ⋯ menu
 *   for Delete. Only one of Save / Publish is the primary at a time.
 * - The fields are split into tabs. **Content** is the default and is a true
 *   split screen from `xl`: Markdown left, the reader's view right, both the
 *   same height and each scrolling on its own. Below `xl` it is Write or
 *   Preview.
 * - A new draft first settles policy, version and date in a small setup card
 *   (`NewVersionSetup`), since those can't change once the draft exists.
 *
 * The preview runs the same parser the server does, so what it shows —
 * warnings included — is what will be stored.
 */

/* ------------------------------------------------------------------ *
 * Route wrappers
 * ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10)

export function LegalNewPage() {
  const [params] = useSearchParams()
  const docs = useLegalDocuments()
  const [choice, setChoice] = useState<NewVersionChoice | null>(null)
  /* Edits made before going back to change the version, so they survive it. */
  const [kept, setKept] = useState<LegalFormValues | null>(null)
  const [changing, setChanging] = useState(false)

  const fromId = params.get('from') ?? undefined
  const rawType = params.get('type')?.toUpperCase()

  if (docs.isPending) return <LoadingState variant="form" />
  if (docs.isError) {
    return (
      <ErrorState
        {...(isAppError(docs.error) ? { description: docs.error.message } : {})}
        onRetry={() => void docs.refetch()}
      />
    )
  }

  const all = docs.data
  const source = fromId ? all.find((doc) => doc.id === fromId) : undefined
  const type: LegalDocumentType =
    source?.documentType ?? (isLegalDocumentType(rawType) ? rawType : 'PRIVACY_POLICY')

  if (!choice || changing) {
    return (
      <NewVersionSetup
        docs={all}
        source={source}
        initial={
          choice ?? {
            documentType: type,
            version: nextFreeVersion(all, type),
            effectiveDate: today(),
          }
        }
        onCancel={changing ? () => setChanging(false) : undefined}
        onContinue={(next) => {
          setChoice(next)
          setChanging(false)
        }}
      />
    )
  }

  const base: LegalFormValues =
    kept && kept.documentType === choice.documentType
      ? kept
      : source
        ? formValuesFrom(source, { changelog: '', requiresReconsent: false })
        : emptyFormValues(choice.documentType, choice.version)
  const initial: LegalFormValues = { ...base, ...choice }

  return (
    <LegalEditor
      key={`${choice.documentType}:${choice.version}:${choice.effectiveDate}`}
      mode="create"
      initial={initial}
      startDirty={kept !== null}
      docs={all}
      source={source}
      onChangeVersion={(values) => {
        setKept(values)
        setChanging(true)
      }}
    />
  )
}

export function LegalEditPage() {
  const { legalId = '' } = useParams()
  const doc = useLegalDocument(legalId)
  const docs = useLegalDocuments()

  if (doc.isPending) return <LoadingState variant="form" />
  if (doc.isError) {
    return doc.error instanceof NotFoundError ? (
      <NotFoundState
        title="Draft not found"
        description="No legal document has this id. It may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link to={ROUTES.legal}>Back to Legal & policies</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState
        {...(isAppError(doc.error) ? { description: doc.error.message } : {})}
        onRetry={() => void doc.refetch()}
      />
    )
  }

  const record = doc.data
  if (record.status !== 'DRAFT') {
    return (
      <div className="form-column space-y-6">
        <PageHeader
          breadcrumbs={[
            { label: 'Legal & policies', to: ROUTES.legal },
            { label: 'Edit' },
          ]}
          title={`${TYPE_LABELS[record.documentType]} v${record.version}`}
        />
        <NotFoundState
          title="This version can't be edited"
          description={`It is ${record.status === 'PUBLISHED' ? 'the published version' : 'archived'}. Published and archived versions are permanent. To change the text, start a new version from it.`}
          action={
            <Button asChild>
              <Link to={ROUTES.legalNew(record.documentType, record.id)}>
                New version from this
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <LegalEditor
      key={record.id}
      mode="edit"
      initial={formValuesFrom(record)}
      docs={docs.data ?? []}
      doc={record}
    />
  )
}

/* ------------------------------------------------------------------ *
 * The editor
 * ------------------------------------------------------------------ */

type EditorTab = 'content' | 'details' | 'contact' | 'changelog'
type View = 'split' | 'write' | 'preview'

const TAB_LABELS: Record<EditorTab, string> = {
  content: 'Content',
  details: 'Details',
  contact: 'Contact & consent',
  changelog: 'Changelog',
}

/** Which tab a field lives on, so an error is never hidden on another tab. */
function tabsWithErrors(errors: FieldErrors<LegalFormValues>): Set<EditorTab> {
  const tabs = new Set<EditorTab>()
  if (errors.contentMarkdown) tabs.add('content')
  if (
    errors.title ||
    errors.subtitle ||
    errors.effectiveDate ||
    errors.requiresReconsent
  )
    tabs.add('details')
  if (errors.contact || errors.consent || errors.hasContact) tabs.add('contact')
  if (errors.changelog) tabs.add('changelog')
  return tabs
}

const ORDER: readonly EditorTab[] = ['content', 'details', 'contact', 'changelog']

function formatDay(day: string | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'no date set'
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

interface LegalEditorProps {
  readonly mode: 'create' | 'edit'
  readonly initial: LegalFormValues
  readonly docs: readonly LegalDocument[]
  readonly doc?: LegalDocument | undefined
  readonly source?: LegalDocument | undefined
  /** Create mode: there are edits from before a version change to protect. */
  readonly startDirty?: boolean
  /** Create mode: back to the setup card, keeping what was written. */
  readonly onChangeVersion?: (values: LegalFormValues) => void
}

function LegalEditor({
  mode,
  initial,
  docs,
  doc,
  source,
  startDirty = false,
  onChangeVersion,
}: LegalEditorProps) {
  const navigate = useNavigate()
  const canEdit = useCan(PERMISSIONS.legalEdit)
  const canPublish = useCan(PERMISSIONS.legalPublish)
  const wide = useMediaQuery('(min-width: 1280px)')
  const [tab, setTab] = useState<EditorTab>('content')
  const [view, setView] = useState<View>('split')
  const [publishing, setPublishing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)

  const create = useCreateLegalDocument()
  const update = useUpdateLegalDocument(doc?.id ?? '')
  const remove = useDeleteLegalDocument()
  const mutation = mode === 'create' ? create : update

  const form = useForm<LegalFormValues>({
    resolver: zodResolver(legalFormSchema),
    defaultValues: initial,
  })
  const emails = useFieldArray({ control: form.control, name: 'contact.emails' })
  const values = useWatch({ control: form.control }) as LegalFormValues
  const errors = form.formState.errors
  const dirty = form.formState.isDirty || startDirty
  const saving = form.formState.isSubmitting

  useUnsavedChangesGuard(dirty && !leaving)

  const parsed = useMemo(
    () => parseLegalMarkdown(values.contentMarkdown ?? ''),
    [values.contentMarkdown],
  )

  const type = values.documentType
  const hadSubtitle = Boolean(doc?.subtitle)
  const hadContact = Boolean(doc?.contact)
  const errorTabs = tabsWithErrors(errors)
  /* Split needs the width; below xl the view is Write or Preview. */
  const effectiveView: View = !wide && view === 'split' ? 'write' : view

  function leave(to: string) {
    flushSync(() => setLeaving(true))
    void navigate(to)
  }

  const onSubmit = form.handleSubmit(
    async (formValues) => {
      setConflict(null)
      try {
        if (mode === 'create') {
          const created = await create.mutateAsync(toCreatePayload(formValues))
          toast.success(
            `Draft v${created.version} of the ${TYPE_LABELS[created.documentType]} saved.`,
          )
          flushSync(() => setLeaving(true))
          void navigate(ROUTES.legalEdit(created.id), { replace: true })
        } else {
          const saved = await update.mutateAsync(toUpdatePayload(formValues))
          toast.success('Draft saved.')
          form.reset(formValuesFrom(saved))
        }
      } catch (error) {
        if (error instanceof ConflictError) {
          setConflict(error.message)
          return
        }
        applyServerFieldErrors(error, form.setError, LEGAL_FORM_FIELDS)
        const failed = tabsWithErrors(form.formState.errors)
        const first = ORDER.find((key) => failed.has(key))
        if (first) setTab(first)
      }
    },
    (invalid) => {
      /* Jump to the first tab with a problem, so Save never fails silently. */
      const failed = tabsWithErrors(invalid)
      const first = ORDER.find((key) => failed.has(key))
      if (first) setTab(first)
      if (first === 'content' && !wide) setView('write')
    },
  )

  function runDelete() {
    if (!doc) return
    remove.mutate(doc.id, {
      onSuccess: () => {
        setConfirmDelete(false)
        toast.success(`Draft v${doc.version} deleted.`)
        leave(ROUTES.legalFor({ tab: 'drafts' }))
      },
      onError: (error) =>
        toast.error(
          isAppError(error) ? error.message : 'The draft could not be deleted.',
        ),
    })
  }

  /** Insert a new "## " heading at the cursor, numbered after the last one. */
  function addSection() {
    const area = contentRef.current
    const current = form.getValues('contentMarkdown')
    const at = area ? area.selectionEnd : current.length
    const before = current.slice(0, at).replace(/\s*$/, '')
    const after = current.slice(at).replace(/^\s*/, '')
    const label = 'New section'
    const heading = `## ${parsed.sections.length + 1}. ${label}`
    const block = `${before ? '\n\n' : ''}${heading}\nWrite the section here.\n${after ? '\n' : ''}`
    form.setValue('contentMarkdown', `${before}${block}${after}`, {
      shouldDirty: true,
      shouldValidate: Boolean(errors.contentMarkdown),
    })
    if (!wide) setView('write')
    requestAnimationFrame(() => {
      const node = contentRef.current
      if (!node) return
      const start = before.length + (before ? 2 : 0) + heading.length - label.length
      node.focus({ preventScroll: true })
      node.setSelectionRange(start, start + label.length)
    })
  }

  const formError = formLevelMessage(
    mutation.error,
    mode === 'create'
      ? 'The draft could not be created. Nothing was saved.'
      : 'The draft could not be saved. Your edits are still here.',
  )
  const showFormError = formError !== null && conflict === null

  /* ---------------------------------------------------------------- *
   * Header
   * ---------------------------------------------------------------- */

  const facts = [
    mode === 'create' ? 'New draft, not saved yet' : 'Draft',
    `Effective ${formatDay(values.effectiveDate)}`,
    values.requiresReconsent ? 'Users must accept again' : 'Re-consent not required',
    ...(source ? [`Copied from v${source.version}`] : []),
  ].join(' · ')

  const saveState =
    mode === 'create' ? null : dirty ? (
      <span className="flex items-center gap-1.5 text-caption text-warning-foreground">
        <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
        Unsaved changes{canPublish ? ' — save before publishing' : ''}
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-caption text-foreground-muted">
        <span className="size-2 rounded-full bg-success" aria-hidden="true" />
        All changes saved
      </span>
    )

  /* Exactly one primary: Save while there is something to save, else Publish. */
  const saveIsPrimary = mode === 'create' || dirty || !canPublish

  const actions = (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <span role="status" aria-live="polite" className="sm:mr-2">
        {saveState}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'create' && onChangeVersion ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChangeVersion(form.getValues())}
          >
            Change version
          </Button>
        ) : null}
        <Button
          type="submit"
          form="legal-editor-form"
          variant={saveIsPrimary ? 'default' : 'outline'}
          disabled={!canEdit || (mode === 'edit' && !dirty)}
          loading={saving}
        >
          {mode === 'create' ? 'Create draft' : 'Save draft'}
        </Button>
        {mode === 'edit' && doc && canPublish ? (
          /* Publishes what is SAVED, so it waits for unsaved edits. */
          <Button
            type="button"
            variant={saveIsPrimary ? 'outline' : 'default'}
            disabled={dirty}
            onClick={() => setPublishing(true)}
          >
            <Send /> Publish…
          </Button>
        ) : null}
        {mode === 'edit' && doc && canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={ROUTES.legalDoc(doc.id)}>
                  <Eye /> Open read-only view
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 /> Delete draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )

  /* ---------------------------------------------------------------- *
   * Content tab
   * ---------------------------------------------------------------- */

  const contentField = form.register('contentMarkdown')

  const preview = (
    <LegalPreview
      data={{
        title: values.title ?? '',
        subtitle: values.subtitle,
        effectiveDate: values.effectiveDate
          ? `${values.effectiveDate}T00:00:00.000Z`
          : null,
        intro: parsed.intro,
        sections: parsed.sections,
        contact: values.hasContact
          ? {
              org: values.contact?.org ?? '',
              location: values.contact?.location || null,
              website: values.contact?.website || null,
              emails: (values.contact?.emails ?? []).filter((email) => email.address),
            }
          : null,
        consent: values.consent,
        version: values.version,
      }}
      wide={false}
    />
  )

  /* Both panes share one height: the viewport below the header and toolbar. */
  const paneHeight = 'h-[max(28rem,calc(100dvh-24rem))]'

  const contentTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/*
           * A view switch, not tabs: the three views show the same field, so
           * there is no separate panel for `aria-controls` to name (axe,
           * LG6). Pressed buttons in a group, drawn like the tab list.
           */}
          <div role="group" aria-label="View" className={tabsListVariants()}>
            {(
              [
                ...(wide ? [['split', 'Split', Columns2] as const] : []),
                ['write', 'Write', PencilLine] as const,
                ['preview', 'Preview', Eye] as const,
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={effectiveView === value}
                onClick={() => setView(value)}
                className={cn(
                  'inline-flex h-full items-center gap-1.5 rounded-md px-2 text-body font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4',
                  effectiveView === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground/60 hover:text-foreground',
                )}
              >
                <Icon aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSection}>
            <Plus /> Add section
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-caption text-foreground-muted">
          <span>
            {parsed.sections.length === 1
              ? '1 section'
              : `${parsed.sections.length} sections`}
          </span>
          <WarningsChip warnings={parsed.warnings} />
          <MarkdownHelp />
        </div>
      </div>

      {errors.contentMarkdown ? (
        <p id="legal-content-error" role="alert" className="text-caption text-danger">
          {errors.contentMarkdown.message}
        </p>
      ) : null}

      <div
        className={cn(
          effectiveView === 'split' && 'grid grid-cols-2 gap-4',
          paneHeight,
        )}
      >
        <div className={cn('h-full', effectiveView === 'preview' && 'hidden')}>
          <label htmlFor="legal-content" className="sr-only">
            Policy text (Markdown)
          </label>
          <Textarea
            id="legal-content"
            aria-invalid={Boolean(errors.contentMarkdown) || undefined}
            aria-describedby={
              errors.contentMarkdown ? 'legal-content-error' : undefined
            }
            {...contentField}
            ref={(node) => {
              contentField.ref(node)
              contentRef.current = node
            }}
            spellCheck
            className="[field-sizing:fixed] h-full resize-none bg-card font-mono text-caption leading-relaxed"
          />
        </div>
        {effectiveView !== 'write' ? (
          <div className="h-full overflow-y-auto rounded-lg">{preview}</div>
        ) : null}
      </div>
    </div>
  )

  /* ---------------------------------------------------------------- *
   * Details / Contact / Changelog tabs
   * ---------------------------------------------------------------- */

  /* Side by side from lg, so each tab fits on one screen without scrolling. */
  const detailsTab = (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <FormSection title="When it applies">
        <FormGrid>
          <FormField
            id="legal-effective"
            label="Effective date"
            required
            hint="A future date gives users advance notice."
            error={errors.effectiveDate?.message}
          >
            <Input
              type="date"
              {...fieldAria('legal-effective', true, Boolean(errors.effectiveDate))}
              {...form.register('effectiveDate')}
            />
          </FormField>
          <FormField
            id="legal-reconsent"
            label="Re-consent"
            hint="Users must accept this version before they continue."
          >
            <Controller
              control={form.control}
              name="requiresReconsent"
              render={({ field }) => (
                <span className="flex h-10 items-center gap-3">
                  <Switch
                    id="legal-reconsent"
                    aria-describedby="legal-reconsent-hint"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <span className="text-body">
                    {field.value ? 'Required' : 'Not required'}
                  </span>
                </span>
              )}
            />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="Page header">
        <FormGrid>
          <FormField
            id="legal-title"
            label="Title"
            required
            error={errors.title?.message}
          >
            <Input
              {...fieldAria('legal-title', false, Boolean(errors.title))}
              {...form.register('title')}
            />
          </FormField>
          <FormField
            id="legal-subtitle"
            label="Subtitle"
            hint={
              hadSubtitle
                ? 'Can be changed but not removed once saved.'
                : 'Optional, e.g. the company and country.'
            }
            error={errors.subtitle?.message}
          >
            <Input
              {...fieldAria('legal-subtitle', true, Boolean(errors.subtitle))}
              {...form.register('subtitle')}
            />
          </FormField>
        </FormGrid>
      </FormSection>
    </div>
  )

  const contactTab = (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <FormSection title="Contact card">
        <div className="space-y-5">
          <Controller
            control={form.control}
            name="hasContact"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id="legal-has-contact"
                  checked={field.value}
                  disabled={hadContact && field.value}
                  onCheckedChange={field.onChange}
                  aria-describedby="legal-has-contact-hint"
                />
                <div>
                  <label htmlFor="legal-has-contact" className="text-body-strong">
                    Show a contact card
                  </label>
                  <p
                    id="legal-has-contact-hint"
                    className="text-caption text-foreground-muted"
                  >
                    {hadContact
                      ? 'Can be edited but not removed once saved.'
                      : 'Who readers can write to about this policy.'}
                  </p>
                </div>
              </div>
            )}
          />

          {values.hasContact ? (
            <>
              <FormGrid>
                <FormField
                  id="legal-org"
                  label="Organisation"
                  required
                  error={errors.contact?.org?.message}
                >
                  <Input
                    {...fieldAria('legal-org', false, Boolean(errors.contact?.org))}
                    {...form.register('contact.org')}
                  />
                </FormField>
                <FormField id="legal-location" label="Location">
                  <Input id="legal-location" {...form.register('contact.location')} />
                </FormField>
                <FormField id="legal-website" label="Website">
                  <Input
                    id="legal-website"
                    placeholder="callschat.com"
                    {...form.register('contact.website')}
                  />
                </FormField>
              </FormGrid>

              <fieldset className="space-y-3">
                <legend className="text-body-strong">Emails</legend>
                {emails.fields.map((item, index) => {
                  const fieldErrors = errors.contact?.emails?.[index]
                  return (
                    <div
                      key={item.id}
                      className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-start"
                    >
                      <div>
                        <Input
                          aria-label={`Email ${index + 1} label`}
                          placeholder="Label"
                          aria-invalid={Boolean(fieldErrors?.label) || undefined}
                          {...form.register(`contact.emails.${index}.label`)}
                        />
                        {fieldErrors?.label ? (
                          <p role="alert" className="mt-1 text-caption text-danger">
                            {fieldErrors.label.message}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <Input
                          type="email"
                          aria-label={`Email ${index + 1} address`}
                          placeholder="name@callschat.com"
                          aria-invalid={Boolean(fieldErrors?.address) || undefined}
                          {...form.register(`contact.emails.${index}.address`)}
                        />
                        {fieldErrors?.address ? (
                          <p role="alert" className="mt-1 text-caption text-danger">
                            {fieldErrors.address.message}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove email ${index + 1}`}
                        disabled={emails.fields.length === 1}
                        onClick={() => emails.remove(index)}
                      >
                        <X />
                      </Button>
                    </div>
                  )
                })}
                {errors.contact?.emails?.message ? (
                  <p role="alert" className="text-caption text-danger">
                    {errors.contact.emails.message}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => emails.append({ label: '', address: '' })}
                >
                  <Plus /> Add email
                </Button>
              </fieldset>
            </>
          ) : null}
        </div>
      </FormSection>

      <FormSection title="Consent line">
        <FormField
          id="legal-consent"
          label="Closing sentence"
          hint='Shown under the contact card, e.g. "By using CallsChat, you agree to this Privacy Policy."'
        >
          <Textarea
            {...fieldAria('legal-consent', true, Boolean(errors.consent))}
            {...form.register('consent')}
            rows={4}
          />
        </FormField>
      </FormSection>
    </div>
  )

  const changelogTab = (
    <div className="form-column space-y-6">
      <FormSection title="Changelog">
        <FormField
          id="legal-changelog"
          label="What changed in this version"
          hint="Kept with the version in the history."
        >
          <Textarea
            {...fieldAria('legal-changelog', true, Boolean(errors.changelog))}
            {...form.register('changelog')}
            rows={5}
          />
        </FormField>
      </FormSection>
    </div>
  )

  const panels: Record<EditorTab, React.ReactNode> = {
    content: contentTab,
    details: detailsTab,
    contact: contactTab,
    changelog: changelogTab,
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Legal & policies', to: ROUTES.legal },
          { label: 'Drafts', to: ROUTES.legalFor({ tab: 'drafts' }) },
          { label: mode === 'create' ? 'New draft' : `v${doc?.version ?? ''}` },
        ]}
        title={`${TYPE_LABELS[type]} v${values.version}`}
        description={facts}
        actions={actions}
      />

      {conflict ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{conflict}</span>
            {onChangeVersion ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChangeVersion(form.getValues())}
              >
                Change version
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {showFormError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <form
        id="legal-editor-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="space-y-5"
      >
        <Tabs value={tab} onValueChange={(next) => setTab(next as EditorTab)}>
          <div className="overflow-x-auto border-b border-border">
            <TabsList variant="line" className="h-auto w-max justify-start gap-1 p-0">
              {ORDER.map((key) => (
                <TabsTrigger key={key} value={key} className="px-3 py-2">
                  {TAB_LABELS[key]}
                  {errorTabs.has(key) ? (
                    <span
                      className="size-2 rounded-full bg-danger"
                      aria-label="has a problem"
                    />
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/*
           * Every panel stays mounted (`forceMount`), so the form keeps each
           * field registered; inactive ones are only hidden.
           */}
          {ORDER.map((key) => (
            <TabsContent
              key={key}
              value={key}
              forceMount
              className="pt-5 data-[state=inactive]:hidden"
            >
              {panels[key]}
            </TabsContent>
          ))}
        </Tabs>
      </form>

      {doc && canPublish ? (
        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          draft={doc}
          active={activeByType(docs)[doc.documentType]}
          onPublished={() =>
            leave(ROUTES.legalFor({ tab: 'history', type: doc.documentType }))
          }
        />
      ) : null}

      {doc ? (
        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this draft?"
          target={`${TYPE_LABELS[doc.documentType]} v${doc.version}`}
          effect="The draft is removed for good. Published versions are not affected."
          severity="warning"
          reason="none"
          confirmLabel="Delete draft"
          loading={remove.isPending}
          onConfirm={runDelete}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Toolbar bits
 * ------------------------------------------------------------------ */

function WarningsChip({ warnings }: { warnings: readonly LegalWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-warning/40 bg-warning-soft text-warning-foreground hover:bg-warning-soft/80"
        >
          <AlertTriangle />
          {warnings.length === 1
            ? '1 thing to check'
            : `${warnings.length} things to check`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <ul className="list-disc space-y-1.5 pl-5 text-caption text-foreground">
          {warnings.map((warning) => (
            <li key={`${warning.kind}:${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function MarkdownHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Formatting help
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-caption">
        <p>
          Text before the first <code className="font-mono">## </code> heading is the
          intro.
        </p>
        <p>
          Each <code className="font-mono">## </code> line starts a section in the table
          of contents.
        </p>
        <p>A blank line starts a new paragraph. Other Markdown shows as plain text.</p>
      </PopoverContent>
    </Popover>
  )
}
