import { AlertTriangle, ChevronRight, FileText, Globe, Mail } from 'lucide-react'
import { useId } from 'react'

import { DateTime } from '@/components/display'
import { cn } from '@/lib/cn'
import type { LegalContact, LegalSection } from '@/types/legal'

import type { LegalWarning } from './parseLegalMarkdown'

/**
 * A legal document as readers will see it (plan.md §3, LG2).
 *
 * The structure follows the website's `LegalPageLayout` — header with intro
 * and effective date, a table of contents, the sections, the contact card and
 * the consent line — drawn in the panel's own tokens so it sits inside the
 * admin theme.
 *
 * ⚠️ **Text only.** Paragraphs are rendered as React text, never as HTML: the
 * server keeps `<b>`, links and other markup as raw text in `body`, and this
 * preview shows exactly that, so nothing in a policy can run in the panel.
 *
 * ⚠️ Section ids can repeat (plan.md O5). Keys use the index; the table of
 * contents scrolls to the section element directly rather than by `#id`, so a
 * duplicate never makes a link jump to the wrong place here, and the URL hash
 * of the admin page is never touched.
 */

export interface LegalPreviewData {
  readonly title: string
  readonly subtitle?: string | null | undefined
  readonly effectiveDate?: string | null | undefined
  readonly intro?: string | null | undefined
  readonly sections: readonly LegalSection[]
  readonly contact?: LegalContact | null | undefined
  readonly consent?: string | null | undefined
  readonly version?: string | undefined
}

export interface LegalPreviewProps {
  readonly data: LegalPreviewData
  readonly warnings?: readonly LegalWarning[]
  /** Side-by-side table of contents from `lg`; off inside a narrow editor pane. */
  readonly wide?: boolean
  readonly className?: string
}

export function LegalWarnings({ warnings }: { warnings: readonly LegalWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div
      className="rounded-md border border-warning/40 bg-warning-soft px-4 py-3"
      role="status"
    >
      <p className="flex items-center gap-2 text-body font-medium text-warning-foreground">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {warnings.length === 1
          ? '1 thing to check'
          : `${warnings.length} things to check`}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-10 text-caption text-warning-foreground">
        {warnings.map((warning) => (
          <li key={`${warning.kind}:${warning.message}`}>{warning.message}</li>
        ))}
      </ul>
    </div>
  )
}

export function LegalPreview({
  data,
  warnings = [],
  wide = true,
  className,
}: LegalPreviewProps) {
  const base = useId()
  const sectionId = (index: number) => `${base}-section-${index}`
  const jump = (index: number) => {
    const target = document.getElementById(sectionId(index))
    if (target) scrollWithinPane(target)
  }

  const toc = data.sections.map((section, index) => (
    <li key={index}>
      <button
        type="button"
        onClick={() => jump(index)}
        className="block w-full rounded-sm px-3 py-1.5 text-left text-caption text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {section.heading}
      </button>
    </li>
  ))

  return (
    <article
      className={cn('space-y-4', className)}
      aria-label={`Preview of ${data.title || 'the document'}`}
    >
      <LegalWarnings warnings={warnings} />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <header className="border-b border-border bg-surface-muted px-4 py-8 text-center sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-caption font-medium text-primary-700">
            <FileText className="size-3.5" aria-hidden="true" />
            Legal
            {data.version ? <span className="font-mono">· v{data.version}</span> : null}
          </span>
          <h2 className="mt-4 text-h2 font-semibold wrap-anywhere text-foreground">
            {data.title || <span className="text-foreground-subtle">Untitled</span>}
          </h2>
          {data.subtitle ? (
            <p className="mt-2 text-caption text-foreground-muted">{data.subtitle}</p>
          ) : null}
          {data.intro ? (
            <p className="mx-auto mt-4 max-w-2xl text-body whitespace-pre-line text-foreground">
              {data.intro}
            </p>
          ) : null}
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-caption text-foreground-muted">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            Effective date:{' '}
            {data.effectiveDate ? (
              <DateTime
                value={data.effectiveDate}
                variant="date"
                className="font-medium text-foreground"
              />
            ) : (
              <span className="text-foreground-subtle">not set</span>
            )}
          </p>
        </header>

        <div
          className={cn(
            'px-4 py-6 sm:px-8',
            wide && data.sections.length > 0 && 'lg:grid lg:grid-cols-12 lg:gap-8',
          )}
        >
          {data.sections.length > 0 ? (
            wide ? (
              <>
                <nav
                  aria-label="Table of contents"
                  className="hidden lg:col-span-4 lg:block"
                >
                  <p className="mb-2 px-3 text-overline text-foreground-muted uppercase">
                    On this page
                  </p>
                  <ul className="space-y-0.5 border-l border-border">{toc}</ul>
                </nav>
                <TocDisclosure className="lg:hidden">{toc}</TocDisclosure>
              </>
            ) : (
              <TocDisclosure>{toc}</TocDisclosure>
            )
          ) : null}

          <div className={cn(wide && data.sections.length > 0 && 'lg:col-span-8')}>
            {data.sections.length > 0 ? (
              <div className="space-y-8">
                {data.sections.map((section, index) => (
                  <section
                    key={index}
                    id={sectionId(index)}
                    className="scroll-mt-4 border-b border-border pb-8 last:border-b-0 last:pb-0"
                  >
                    <h3 className="text-h3 font-semibold wrap-anywhere text-primary">
                      {section.heading}
                    </h3>
                    {section.body.length > 0 ? (
                      <div className="mt-2 space-y-3 text-body wrap-anywhere text-foreground">
                        {section.body.map((paragraph, i) => (
                          <p key={i} className="whitespace-pre-line">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-caption text-foreground-subtle italic">
                        No text in this section.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-body text-foreground-muted">
                No sections yet. Start one with a line beginning “## ”.
              </p>
            )}

            {data.contact ? <ContactCard contact={data.contact} /> : null}

            {data.consent ? (
              <p className="mt-6 text-caption text-foreground-muted italic">
                {data.consent}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function TocDisclosure({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <details
      className={cn(
        'group mb-6 rounded-md border border-border bg-surface-muted p-3',
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm text-body font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Jump to section
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>
      <nav aria-label="Table of contents" className="mt-2">
        <ul className="space-y-0.5">{children}</ul>
      </nav>
    </details>
  )
}

function ContactCard({ contact }: { contact: LegalContact }) {
  return (
    <div className="mt-8 rounded-lg border border-border bg-surface-muted p-5">
      <h3 className="text-body font-semibold text-foreground">Contact information</h3>
      <p className="mt-2 text-body font-medium text-foreground">{contact.org}</p>
      {contact.location ? (
        <p className="text-caption text-foreground-muted">{contact.location}</p>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {contact.emails.map((email, index) => (
          <li
            key={`${email.address}-${index}`}
            className="flex flex-wrap items-center gap-x-2 text-caption"
          >
            <Mail className="size-3.5 text-primary" aria-hidden="true" />
            <span className="text-foreground-muted">{email.label}:</span>
            <span className="wrap-anywhere text-foreground">{email.address}</span>
          </li>
        ))}
        {contact.website ? (
          <li className="flex flex-wrap items-center gap-x-2 text-caption">
            <Globe className="size-3.5 text-primary" aria-hidden="true" />
            <span className="text-foreground-muted">Website:</span>
            <span className="wrap-anywhere text-foreground">{contact.website}</span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

/**
 * Scroll `target` to the top of its nearest scrolling ancestor — and nothing
 * else.
 *
 * ⚠️ Not `scrollIntoView`: that scrolls *every* ancestor, including the app
 * frame and `<html>`, which are `overflow: hidden` (AdminLayout's fixed frame)
 * but still scrollable from script. When the preview pane or `<main>` could
 * not move far enough, the browser shifted the whole frame up — top bar and
 * breadcrumbs gone, a blank band at the bottom — and nothing could scroll it
 * back.
 */
function scrollWithinPane(target: HTMLElement) {
  let pane = target.parentElement
  while (pane && pane !== document.body) {
    const { overflowY } = getComputedStyle(pane)
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      pane.scrollHeight > pane.clientHeight
    )
      break
    pane = pane.parentElement
  }
  if (!pane || pane === document.body) return
  const top =
    target.getBoundingClientRect().top -
    pane.getBoundingClientRect().top +
    pane.scrollTop
  pane.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
}
