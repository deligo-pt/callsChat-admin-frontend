import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { fetchEmojiPacks } from '@/api/catalog'
import { isAppError } from '@/api/errors'
import { formLevelMessage } from '@/api/formErrors'
import { queryKeys } from '@/api/queryKeys'
import { UploadProgress } from '@/components/media/AssetFileField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { nameFromFile } from '@/lib/catalogFile'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import type { EmojiPack, EmojiType } from '@/types/catalog'

import {
  checkCatalogFile,
  EMOJI_FILE_ACCEPT,
  MAX_BULK,
  nextSortOrder,
  suggestShortcode,
  TAKEN_MESSAGE,
  validateRows,
} from './emojiForm'
import { uploadEmojiFile, useBulkEmojiMutation } from './useEmoji'

/**
 * Add several emojis to one pack at once — `POST /admin/emoji/emojis/bulk`
 * (plan.md §4, phase G4).
 *
 * ⚠️ **The route skips duplicates silently.** Measured 2026-10-28: two
 * emojis sent, one with a taken shortcode, answered `201 {"count": 1}` —
 * success, and no word on which one was dropped. So this dialog:
 *
 *   1. checks every shortcode against every pack (inactive emojis included —
 *      they keep theirs) **and against the rest of the batch** before sending;
 *   2. compares the returned `count` to what it sent;
 *   3. when they differ, refetches and finds the missing rows by their
 *      uploaded `fileUrl` — never by assuming which ones failed — and keeps
 *      exactly those on screen, flagged, with their uploads reused on retry.
 *
 * ⚠️ **Files are uploaded one at a time**, before the single bulk request.
 * An upload failure stops the batch and saves nothing; the files already
 * uploaded are reused on the next attempt.
 */

interface Row {
  readonly key: string
  readonly file: File
  readonly mimetype: string
  name: string
  shortcode: string
  type: EmojiType
  readonly typeLocked: boolean
  url: string | null
  error: string | null
}

export interface BulkEmojiDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pack: EmojiPack
  packs: readonly EmojiPack[]
}

export function BulkEmojiDialog({
  open,
  onOpenChange,
  pack,
  packs,
}: BulkEmojiDialogProps) {
  const returnFocus = useReturnFocus(open)
  const client = useQueryClient()
  const bulk = useBulkEmojiMutation()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)

  const [rows, setRows] = useState<Row[]>([])
  const [pickErrors, setPickErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ index: number; percent: number } | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)

  function patch(key: string, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, ...change, error: null } : row,
      ),
    )
  }

  async function pick(files: readonly File[]) {
    setNotice(null)
    const errors: string[] = []
    const added: Row[] = []
    for (const file of files) {
      const verdict = await checkCatalogFile(file, 'emojis')
      if (!verdict.ok) {
        errors.push(verdict.message)
        continue
      }
      added.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        mimetype: verdict.mimetype,
        name: nameFromFile(file.name),
        shortcode: suggestShortcode(file.name),
        type: verdict.impliedType ?? 'ANIMATED',
        typeLocked: verdict.impliedType !== null,
        url: null,
        error: null,
      })
    }
    const room = MAX_BULK - rows.length
    if (added.length > room) {
      errors.push(
        `At most ${MAX_BULK} emojis at a time; ${added.length - room} were left out.`,
      )
    }
    setRows((current) => [...current, ...added.slice(0, Math.max(0, room))])
    setPickErrors(errors)
  }

  async function submit() {
    setNotice(null)
    const problems = validateRows(rows, packs)
    if (problems.some(Boolean)) {
      setRows((current) =>
        current.map((row, index) => ({ ...row, error: problems[index] ?? null })),
      )
      return
    }

    setBusy(true)
    try {
      /* Upload, one at a time, reusing whatever already reached storage. */
      const uploaded = [...rows]
      for (const [index, row] of uploaded.entries()) {
        if (row.url) continue
        setProgress({ index, percent: 0 })
        try {
          const url = await uploadEmojiFile(
            row.file,
            row.mimetype,
            'emojis',
            (percent) => setProgress({ index, percent }),
          )
          uploaded[index] = { ...row, url }
          setRows([...uploaded])
        } catch (failure) {
          setRows(
            uploaded.map((candidate, at) =>
              at === index
                ? {
                    ...candidate,
                    error: `${failure instanceof Error ? failure.message : 'The upload failed.'} Nothing was saved.`,
                  }
                : candidate,
            ),
          )
          return
        } finally {
          setProgress(null)
        }
      }

      const start = nextSortOrder(pack.emojis ?? [])
      let count: number
      try {
        count = await bulk.mutateAsync({
          packId: pack.id,
          /* `type` and `sortOrder` always sent: omitted, the server stores STATIC at 0. */
          emojis: uploaded.map((row, index) => ({
            name: row.name.trim(),
            shortcode: row.shortcode.trim(),
            fileUrl: row.url ?? '',
            type: row.type,
            sortOrder: start + index,
          })),
        })
      } catch (error) {
        setNotice(
          isAppError(error) && error.status === 409
            ? TAKEN_MESSAGE
            : (formLevelMessage(error) ?? 'The emojis could not be saved.'),
        )
        return
      }

      if (count >= uploaded.length) {
        toast.success(count === 1 ? '1 emoji added.' : `${count} emojis added.`)
        onOpenChange(false)
        return
      }

      /*
       * ⚠️ Fewer created than sent, with a `201`. Find out which from the
       * server rather than guessing — by the file each row uploaded.
       */
      const fresh = await client.fetchQuery({
        queryKey: queryKeys.emojiPacks.list(),
        queryFn: ({ signal }) => fetchEmojiPacks(signal),
        staleTime: 0,
      })
      const saved = new Set(
        fresh
          .find((candidate) => candidate.id === pack.id)
          ?.emojis?.map((emoji) => emoji.fileUrl) ?? [],
      )
      const skipped = uploaded
        .filter((row) => !saved.has(row.url))
        .map((row) => ({
          ...row,
          error:
            'Not added — the server skipped it, most likely because its shortcode was taken.',
        }))
      setRows(skipped)
      setNotice(
        `${count} of ${uploaded.length} added. The server skipped ${uploaded.length - count} without saying which; ${skipped.length === 1 ? 'it is' : 'they are'} listed below. Change the shortcode and try again — the file is not uploaded twice.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>Add several emojis</DialogTitle>
          <DialogDescription>
            To {pack.name || 'this pack'}. Names and shortcodes are suggested from the
            file names; check them before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || rows.length >= MAX_BULK}
              onClick={() => input.current?.click()}
            >
              <Upload className="size-4" aria-hidden="true" />
              {rows.length > 0 ? 'Add more files' : 'Choose files'}
            </Button>
            <span className="text-caption text-foreground-muted">
              Lottie (.json), PNG or WebP · up to {MAX_BULK} at a time
            </span>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Emoji files"
              accept={EMOJI_FILE_ACCEPT}
              onChange={(event) => {
                void pick(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </div>

          {pickErrors.length > 0 ? (
            <ul className="space-y-1 text-caption text-danger-foreground" role="alert">
              {pickErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          {notice ? (
            <p
              className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-body text-warning-foreground"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <ol
              className="divide-y divide-border rounded-md border border-border"
              aria-label="Emojis to add"
            >
              {rows.map((row, index) => (
                <li key={row.key} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-caption text-foreground-muted">
                      {row.file.name}
                      {row.url ? ' · uploaded' : ''}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${row.file.name}`}
                      disabled={busy}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((other) => other.key !== row.key),
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem]">
                    <Input
                      aria-label={`Name for ${row.file.name}`}
                      value={row.name}
                      maxLength={100}
                      disabled={busy}
                      onChange={(event) => patch(row.key, { name: event.target.value })}
                    />
                    <Input
                      aria-label={`Shortcode for ${row.file.name}`}
                      className="font-mono"
                      value={row.shortcode}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={busy}
                      onChange={(event) =>
                        patch(row.key, { shortcode: event.target.value })
                      }
                    />
                    <Select
                      value={row.type}
                      onValueChange={(value) =>
                        patch(row.key, { type: value as EmojiType })
                      }
                      disabled={busy || row.typeLocked}
                    >
                      <SelectTrigger
                        id={`${id}-type-${index}`}
                        aria-label={`Type for ${row.file.name}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ANIMATED">Animated</SelectItem>
                        <SelectItem value="STATIC">Static</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {progress?.index === index ? (
                    <UploadProgress
                      percent={progress.percent}
                      label={`Uploading ${index + 1} of ${rows.length}…`}
                    />
                  ) : null}
                  {row.error ? (
                    <p className="text-caption text-danger-foreground">{row.error}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => void submit()}
          >
            {busy
              ? 'Saving…'
              : rows.length === 0
                ? 'Add emojis'
                : rows.length === 1
                  ? 'Add 1 emoji'
                  : `Add ${rows.length} emojis`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
