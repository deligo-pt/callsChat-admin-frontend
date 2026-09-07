import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

import { normaliseFileType } from '../serialize'

/**
 * The list of extensions users may attach.
 *
 * Three server behaviours shape this control, all verified live
 * (system_settings_plan.md §2.3):
 *
 * 1. The server **normalises** — lowercase, trimmed, leading dot stripped — so
 *    the chip shows the normalised form the moment it is added. What you see
 *    is what gets stored, rather than `.PDF` going in and `pdf` coming back.
 * 2. The server does **not** deduplicate. `["jpg","png","jpg","jpg"]` was
 *    persisted verbatim, so the list would grow every time somebody saved.
 *    Duplicates are refused here.
 * 3. The array **replaces** the stored list. Removing every chip is therefore
 *    a real way to disable all attachments, which is why the last one cannot
 *    be removed by accident.
 *
 * There is no server-side allow-list of extensions — `.EXE` normalises to
 * `exe` and is stored. The grouping below is presentational only; it does not
 * restrict what can be added.
 */

const GROUPS: readonly { label: string; members: ReadonlySet<string> }[] = [
  {
    label: 'Images',
    members: new Set([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'bmp',
      'svg',
      'ico',
      'avif',
      'heic',
      'heif',
      'tif',
      'tiff',
    ]),
  },
  {
    label: 'Video',
    members: new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'mpeg']),
  },
  {
    label: 'Audio',
    members: new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'amr']),
  },
  {
    label: 'Documents',
    members: new Set([
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'txt',
      'csv',
      'rtf',
      'odt',
      'ods',
      'odp',
    ]),
  },
]

function groupOf(extension: string): string {
  return GROUPS.find((group) => group.members.has(extension))?.label ?? 'Other'
}

export interface FileTypeEditorProps {
  value: readonly string[]
  onChange: (next: readonly string[]) => void
  disabled?: boolean
}

export function FileTypeEditor({ value, onChange, disabled }: FileTypeEditorProps) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const normalisedDraft = normaliseFileType(draft)

  function add() {
    if (normalisedDraft.length === 0) {
      setProblem('Type an extension first, for example pdf.')
      return
    }
    if (value.includes(normalisedDraft)) {
      setProblem(`${normalisedDraft} is already allowed.`)
      return
    }

    onChange([...value, normalisedDraft])
    setDraft('')
    setProblem(null)
  }

  function remove(extension: string) {
    if (value.length === 1) {
      // The server's own wording, so the rule reads the same from either side.
      setProblem('At least one file extension must be allowed.')
      return
    }
    onChange(value.filter((entry) => entry !== extension))
    setProblem(null)
  }

  // Preserve the stored order within each group rather than re-sorting.
  const grouped = [...GROUPS.map((group) => group.label), 'Other']
    .map((label) => ({
      label,
      items: value.filter((extension) => groupOf(extension) === label),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={disabled ?? false}
          onChange={(event) => {
            setDraft(event.target.value)
            setProblem(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // Enter adds a chip; it must not submit the surrounding form.
            event.preventDefault()
            add()
          }}
          placeholder="pdf"
          aria-label="Add a file extension"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={disabled ?? false}
        >
          <Plus />
          Add
        </Button>
      </div>

      {/*
       * The normalisation is shown before the chip is created, so nobody has to
       * discover that `.PDF` and `pdf` are the same entry by trying both.
       */}
      {normalisedDraft.length > 0 && normalisedDraft !== draft.trim() ? (
        <p className="text-caption text-foreground-muted">
          Will be added as <span className="font-medium">{normalisedDraft}</span>.
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="text-caption text-danger">
          {problem}
        </p>
      ) : null}

      <div className="space-y-3">
        {grouped.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-overline text-foreground-muted">{group.label}</p>
            <ul className="flex flex-wrap gap-2">
              {group.items.map((extension) => (
                <li key={extension}>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-sm border border-border',
                      'bg-surface-muted py-1 pr-1 pl-2.5 text-caption',
                    )}
                  >
                    <span className="font-medium">{extension}</span>
                    <button
                      type="button"
                      onClick={() => remove(extension)}
                      disabled={disabled ?? false}
                      aria-label={`Remove ${extension}`}
                      className={cn(
                        'rounded-sm p-0.5 text-foreground-muted transition-colors',
                        'hover:bg-danger-soft hover:text-danger-foreground',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        'disabled:pointer-events-none disabled:opacity-50',
                      )}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-caption text-foreground-muted">
        {value.length} {value.length === 1 ? 'type' : 'types'} allowed. Anything not
        listed is rejected on upload.
      </p>
    </div>
  )
}
