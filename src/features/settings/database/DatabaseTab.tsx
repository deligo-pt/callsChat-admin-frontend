import { AlertTriangle, Database, Download, Info } from 'lucide-react'
import { useState } from 'react'

import { isAppError } from '@/api/errors'
import { DataList, PAGE_SIZE_OPTIONS, Pagination } from '@/components/data'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { MAX_PAGE_SIZE } from '@/types/common'
import {
  BACKUP_DOWNLOAD_TTL_SECONDS,
  BACKUP_RATE_LIMIT_MINUTES,
  type BackupLog,
} from '@/types/settings'

import { fetchBackupDownloadUrl, isBackupRateLimited } from '../api'
import { backupColumns } from './backupColumns'
import { useBackupsQuery, useTriggerBackup } from './useBackups'

/**
 * Manual database backups — Super Admin only.
 *
 * ⚠️ **This feature is broken on production.** The worker fails immediately
 * with `spawn pg_dump ENOENT` — there is no postgres client on the API host
 * (system_settings_plan.md §8 R1). Every design decision here follows from
 * refusing to hide that:
 *
 * - The trigger reports *"Backup started"*, never *"Backup complete"*. A `202`
 *   means the job was accepted, nothing more.
 * - A failed row shows the worker's error **verbatim**. `spawn pg_dump ENOENT`
 *   is the string an operator forwards to a backend engineer; paraphrasing it
 *   into "something went wrong" destroys its only value.
 * - Download appears only on a row that actually succeeded, because the
 *   endpoint rejects anything else with a 400.
 */

/* Must be one of `PAGE_SIZE_OPTIONS`, or the size select renders blank. */
const PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

export function DatabaseTab() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const query = useBackupsQuery({ page, limit: pageSize })
  const trigger = useTriggerBackup()

  const items = query.data?.items ?? []
  const meta = query.data?.meta
  const running = items.some((item) => item.status === 'RUNNING')

  /*
   * The 10-minute cooldown answers **400**, not 429, so it arrives as an
   * ordinary validation error. Rendered as a neutral notice rather than a red
   * failure: the operator did nothing wrong and nothing is broken.
   */
  const rateLimited = isBackupRateLimited(trigger.error)
  const triggerError =
    trigger.error && !rateLimited
      ? isAppError(trigger.error)
        ? trigger.error.message
        : 'The backup could not be started.'
      : null

  async function download(row: BackupLog) {
    setDownloadError(null)
    setDownloading(row.id)
    try {
      const { downloadUrl } = await fetchBackupDownloadUrl(row.id)
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setDownloadError(
        isAppError(error) ? error.message : 'The download link could not be created.',
      )
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle asChild className="text-h3">
            <h2>Manual backup</h2>
          </CardTitle>
          <CardDescription>
            Dumps the database, compresses it, and uploads the archive to object
            storage. One backup every {BACKUP_RATE_LIMIT_MINUTES} minutes.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {rateLimited ? (
            <Alert>
              <Info />
              <AlertDescription>
                {isAppError(trigger.error)
                  ? trigger.error.message
                  : `Wait ${BACKUP_RATE_LIMIT_MINUTES} minutes between backups.`}
              </AlertDescription>
            </Alert>
          ) : null}

          {triggerError ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{triggerError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-foreground-muted">
              {running
                ? 'A backup is running. This list refreshes on its own.'
                : 'Backups run in the background. Watch the table below for the result.'}
            </p>

            <Button
              type="button"
              loading={trigger.isPending}
              disabled={running}
              onClick={() => trigger.mutate()}
            >
              <Database />
              Start backup
            </Button>
          </div>

          {/*
           * "Started", never "complete". The job runs asynchronously and the
           * only report of its outcome is the row below.
           */}
          {trigger.isSuccess && !trigger.error ? (
            <p className="text-caption text-foreground-muted">
              Backup started. Its result appears in the history below.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-h4">Backup history</h2>

        {downloadError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{downloadError}</AlertDescription>
          </Alert>
        ) : null}

        <DataList<BackupLog>
          rows={items}
          columns={backupColumns}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.fileName}
          loading={query.isPending}
          error={
            query.isError
              ? { message: 'The backup history could not be loaded.' }
              : null
          }
          onRetry={() => void query.refetch()}
          emptyTitle="No backups yet"
          emptyDescription="Nothing has been backed up from this environment. Start one above."
          onRowClick={(row) =>
            setExpanded((current) => (current === row.id ? null : row.id))
          }
          rowActions={(row) =>
            row.status === 'SUCCESS' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={downloading === row.id}
                onClick={(event) => {
                  event.stopPropagation()
                  void download(row)
                }}
              >
                <Download />
                Download
              </Button>
            ) : null
          }
        />

        {/*
         * The failure detail sits outside the table rather than inside a row:
         * `DataList` renders two different layouts and an expandable cell would
         * have to be built twice. One panel below the list works in both.
         */}
        {expanded
          ? items
              .filter((row) => row.id === expanded)
              .map((row) => (
                <Alert key={row.id} variant={row.error ? 'destructive' : 'default'}>
                  {row.error ? <AlertTriangle /> : <Info />}
                  <AlertDescription>
                    <span className="block font-medium">{row.fileName}</span>
                    {row.error ? (
                      <>
                        <span className="mt-1 block text-caption">
                          Reported by the backup worker:
                        </span>
                        {/*
                         * Verbatim. `spawn pg_dump ENOENT` is what an operator
                         * forwards to a backend engineer — paraphrasing it into
                         * "something went wrong" throws away its only value.
                         */}
                        <code className="mt-1 block scroll-x rounded-sm bg-surface-muted px-2 py-1 font-mono text-caption text-foreground">
                          {row.error}
                        </code>
                      </>
                    ) : (
                      <span className="mt-1 block text-caption">
                        {row.storageLocation ?? 'Not yet written to storage.'}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              ))
          : null}

        {meta && meta.total > 0 ? (
          <Pagination
            state={{
              page: meta.page,
              pageSize: meta.limit,
              total: meta.total,
              totalPages: meta.totalPages,
            }}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(Math.min(size, MAX_PAGE_SIZE))
              setPage(1)
            }}
          />
        ) : null}

        <p className="text-caption text-foreground-muted">
          Download links are signed and expire after {BACKUP_DOWNLOAD_TTL_SECONDS / 60}{' '}
          minutes.
        </p>
      </div>
    </div>
  )
}
