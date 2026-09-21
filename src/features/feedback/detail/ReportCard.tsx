import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Feedback } from '@/types/feedback'

import { splitDeviceInfo, splitDeviceLine } from '../labels'
import { AttachmentList } from './AttachmentList'

/**
 * What the user actually said (feedback_management_plan.md §5.4).
 *
 * Three parts in a fixed order: the report, the device it came from, and the
 * files attached to it.
 *
 * **`description` is rendered verbatim**, in a `whitespace-pre-wrap` block at a
 * `max-w-prose` measure. It is free text from a person describing a problem —
 * paragraph breaks are meaning, and a pasted stack trace is evidence. It is
 * never truncated here; the queue truncates because it scans, this page reads.
 *
 * ⚠️ `wrap-anywhere` on that block is load-bearing. A pasted stack trace has no
 * spaces: a 420-character unbroken token sets a min-content width no flex or
 * grid track can shrink below, and `break-words` does not lower it — only
 * `overflow-wrap: anywhere` does (§6). The 360px e2e test seeds exactly such a
 * ticket.
 */
export function ReportCard({ ticket }: { ticket: Feedback }) {
  const attachments = ticket.attachments ?? []
  const deviceSegments = ticket.userDeviceInfo
    ? splitDeviceInfo(ticket.userDeviceInfo)
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>The report</CardTitle>
        <CardDescription>
          The reporter&rsquo;s own words, unedited. Nothing on this page changes what
          they wrote.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="max-w-prose text-body wrap-anywhere whitespace-pre-wrap">
          {ticket.description}
        </p>

        <Separator />

        {/*
         * `aria-labelledby` on a `section`, not an `h3`.
         *
         * `CardTitle` renders a `div`, so a heading here would take the page
         * from its `h1` straight to `h3` — a real `heading-order` violation,
         * and the same one `PermissionGrid` hit and fixed. A labelled section
         * names the group for assistive tech without claiming a place in the
         * document outline, which is exactly what these two labels are.
         */}
        <section className="space-y-2" aria-labelledby="report-device-label">
          <p
            id="report-device-label"
            className="text-overline text-foreground-subtle uppercase"
          >
            Device
          </p>
          {deviceSegments.length > 0 ? (
            /*
             * One line per row, the label muted and the value in body colour —
             * a reading aid, **never a parse into typed fields**. The app sends
             * eight `Key: value` lines today and sent three comma-separated
             * pairs last month (`splitDeviceInfo`); presenting `OS` or `App` as
             * columns would break silently the next time it changes again.
             *
             * A line with no `": "` renders whole rather than being dropped.
             *
             * The key includes the index: two lines can be identical (the new
             * format already repeats `Device:` in two places), and a text-only
             * key would collide.
             */
            <ul className="space-y-1">
              {deviceSegments.map((segment, index) => {
                const pair = splitDeviceLine(segment)
                return (
                  /*
                   * A `ul`, not a `dl`: a line with no separator has no term,
                   * and a `dd` without a `dt` is invalid inside a `dl` — an
                   * axe `dlitem` failure on exactly the unrecognised line this
                   * fallback exists for.
                   */
                  <li
                    key={`${index}-${segment}`}
                    className="flex flex-col gap-x-3 text-caption sm:flex-row"
                  >
                    {pair ? (
                      <>
                        <span className="shrink-0 text-foreground-muted sm:w-28">
                          {pair.label}
                        </span>
                        <span className="min-w-0 wrap-anywhere text-foreground">
                          {pair.value}
                        </span>
                      </>
                    ) : (
                      <span className="min-w-0 wrap-anywhere text-foreground">
                        {segment}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-caption text-foreground-subtle">
              {/*
               * Stated rather than left blank. "The reporter's device is
               * unknown" is a real fact about a bug report, and an empty space
               * reads as a failed render.
               */}
              Not reported. The app did not send device details with this ticket.
            </p>
          )}
        </section>

        <Separator />

        <section className="space-y-2" aria-labelledby="report-attachments-label">
          <p
            id="report-attachments-label"
            className="text-overline text-foreground-subtle uppercase"
          >
            Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
          </p>
          <AttachmentList attachments={attachments} />
        </section>
      </CardContent>
    </Card>
  )
}
