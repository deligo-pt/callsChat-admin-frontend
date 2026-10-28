import { Upload } from 'lucide-react'
import { useId, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format'

import { CatalogAsset } from './CatalogAsset'

/**
 * Choose one catalog file — a gift animation, an emoji, a pack cover (phases
 * G3–G4).
 *
 * ⚠️ **This component never uploads.** It shows what is stored, what was
 * picked, and how an upload is going; the dialog uploads on save, because an
 * upload on pick leaves an orphan in storage for every abandoned dialog.
 */
export interface AssetFileFieldProps {
  readonly label: string
  readonly required?: boolean
  /** The stored value, previewed until a new file is picked. */
  readonly current?: string | null | undefined
  readonly chosen: { readonly file: File; readonly badge: string } | null
  readonly hint: string
  readonly accept: string
  readonly disabled?: boolean
  /** 0–100 while uploading, otherwise `null`. */
  readonly progress: number | null
  readonly error: string | null
  readonly onChoose: (file: File | null) => void
}

export function AssetFileField({
  label,
  required = false,
  current,
  chosen,
  hint,
  accept,
  disabled = false,
  progress,
  error,
  onChoose,
}: AssetFileFieldProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const hasCurrent = Boolean(current?.trim())

  return (
    <div className="space-y-2">
      <p className="text-body font-medium" id={`${id}-label`}>
        {label}
        {required ? ' *' : ''}
      </p>
      <div className="flex items-center gap-3 rounded-md border border-border p-3">
        {chosen ? (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-caption font-medium">
            {chosen.badge}
          </span>
        ) : (
          <CatalogAsset value={current} />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-body">
            {chosen ? chosen.file.name : hasCurrent ? 'Current file' : 'No file chosen'}
          </p>
          <p className="text-caption text-foreground-muted">
            {chosen
              ? `${formatBytes(chosen.file.size)} · uploaded when you save`
              : hint}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-describedby={`${id}-label`}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" aria-hidden="true" />
          {chosen || hasCurrent ? 'Replace' : 'Choose file'}
        </Button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={`${label} file`}
          accept={accept}
          onChange={(event) => {
            onChoose(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      </div>

      {progress !== null ? <UploadProgress percent={progress} /> : null}

      {error ? (
        <p className="text-caption text-danger-foreground" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function UploadProgress({
  percent,
  label = 'Uploading to storage…',
}: {
  percent: number
  label?: string
}) {
  return (
    <div className="space-y-1" role="status">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-caption text-foreground-muted">
        {label} {percent}%
      </p>
    </div>
  )
}
