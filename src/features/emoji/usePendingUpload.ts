import { useState } from 'react'

import type { UploadFolder } from '@/types/catalog'

import { checkCatalogFile, type FileVerdict } from './emojiForm'
import { uploadEmojiFile } from './useEmoji'

/**
 * One file picked in a dialog, uploaded on save (phase G4).
 *
 * The rules the gift editor established in G3, held in one place for the pack
 * and emoji editors:
 *
 *   - **checked on pick, uploaded on save** — never on pick, which would leave
 *     an orphan in storage for every abandoned dialog;
 *   - **an upload survives a failed save** — a retry reuses the `fileUrl`
 *     rather than sending the same bytes twice;
 *   - **an upload failure saves nothing**, and says so.
 */

type Folder = Extract<UploadFolder, 'emojis' | 'packs'>

export interface ChosenFile {
  readonly file: File
  readonly mimetype: string
  readonly impliedType: Extract<FileVerdict, { ok: true }>['impliedType']
}

export function usePendingUpload(folder: Folder) {
  const [chosen, setChosen] = useState<ChosenFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ file: File; url: string } | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  async function choose(file: File | null): Promise<ChosenFile | null> {
    setError(null)
    if (!file) return null
    const verdict = await checkCatalogFile(file, folder)
    if (!verdict.ok) {
      setChosen(null)
      setError(verdict.message)
      return null
    }
    const next = { file, mimetype: verdict.mimetype, impliedType: verdict.impliedType }
    setChosen(next)
    return next
  }

  /** The `fileUrl` to save, `null` when nothing was picked. Throws on failure. */
  async function upload(): Promise<string | null> {
    if (!chosen) return null
    if (uploaded?.file === chosen.file) return uploaded.url

    setProgress(0)
    try {
      const url = await uploadEmojiFile(
        chosen.file,
        chosen.mimetype,
        folder,
        setProgress,
      )
      setUploaded({ file: chosen.file, url })
      return url
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : 'The upload failed.'} Nothing was saved.`,
      )
      throw failure
    } finally {
      setProgress(null)
    }
  }

  return { chosen, error, setError, progress, choose, upload }
}
