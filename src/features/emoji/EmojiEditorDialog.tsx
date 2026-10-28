import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { applyServerFieldErrors, formLevelMessage } from '@/api/formErrors'
import { FormField } from '@/components/form'
import { AssetFileField } from '@/components/media/AssetFileField'
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
import type { Emoji, EmojiPack } from '@/types/catalog'

import {
  buildUpdateEmojiPayload,
  describeOwner,
  fileBadge,
  EMOJI_FILE_ACCEPT,
  EMOJI_FORM_FIELDS,
  emojiFormSchema,
  nextSortOrder,
  shortcodeOwner,
  suggestShortcode,
  TAKEN_MESSAGE,
  toEmojiFormValues,
  type EmojiFormValues,
} from './emojiForm'
import { useCreateEmojiMutation, useUpdateEmojiMutation } from './useEmoji'
import { usePendingUpload } from './usePendingUpload'

/**
 * Add or edit one emoji (plan.md §4, phase G4).
 *
 * ⚠️ **The shortcode is checked against every pack before anything is
 * sent.** Shortcodes are unique platform-wide and a deactivated emoji keeps
 * its own (measured), and the server's refusal names nothing — *"A record with
 * this unknown field already exists."* The list the page already holds can
 * name the owner; the server cannot.
 */
export interface EmojiEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pack: EmojiPack
  /** `null` adds a new one to `pack`. */
  emoji: Emoji | null
  /** Every pack, for the shortcode check. */
  packs: readonly EmojiPack[]
}

export function EmojiEditorDialog({
  open,
  onOpenChange,
  pack,
  emoji,
  packs,
}: EmojiEditorDialogProps) {
  const returnFocus = useReturnFocus(open)
  const create = useCreateEmojiMutation()
  const update = useUpdateEmojiMutation()
  const file = usePendingUpload('emojis')
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<EmojiFormValues>({
    resolver: zodResolver(emojiFormSchema),
    defaultValues: toEmojiFormValues(emoji),
  })

  const typeLocked = file.chosen?.impliedType !== null && file.chosen !== null

  async function choose(next: File | null) {
    const picked = await file.choose(next)
    if (!picked) return
    /* Filled in from the file only where the operator has not typed. */
    if (!getValues('name').trim()) setValue('name', nameFromFile(picked.file.name))
    if (!getValues('shortcode').trim()) {
      setValue('shortcode', suggestShortcode(picked.file.name))
    }
    if (picked.impliedType) setValue('type', picked.impliedType)
  }

  async function onSubmit(values: EmojiFormValues) {
    setFormError(null)

    const shortcode = values.shortcode.trim()
    const owner = shortcodeOwner(shortcode, packs, emoji?.id)
    if (owner) {
      setError('shortcode', { type: 'taken', message: describeOwner(owner) })
      return
    }
    if (!emoji && !file.chosen) {
      file.setError('Choose the emoji file.')
      return
    }

    setBusy(true)
    try {
      let fileUrl: string | null
      try {
        fileUrl = await file.upload()
      } catch {
        return
      }

      if (emoji) {
        const payload = buildUpdateEmojiPayload(values, emoji, fileUrl)
        if (Object.keys(payload).length === 0) {
          toast.info('Nothing changed.')
          onOpenChange(false)
          return
        }
        await update.mutateAsync({ id: emoji.id, payload })
        toast.success('Emoji updated.')
      } else if (fileUrl) {
        /* `type` and `sortOrder` always sent: omitted, the server stores STATIC at 0. */
        await create.mutateAsync({
          packId: pack.id,
          name: values.name.trim(),
          shortcode,
          fileUrl,
          type: values.type,
          sortOrder: nextSortOrder(pack.emojis ?? []),
        })
        toast.success('Emoji added.')
      }
      onOpenChange(false)
    } catch (error) {
      if (isAppError(error) && error.status === 409) {
        setError('shortcode', { type: 'server', message: TAKEN_MESSAGE })
      } else if (!applyServerFieldErrors(error, setError, EMOJI_FORM_FIELDS)) {
        setFormError(formLevelMessage(error) ?? 'The emoji could not be saved.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>{emoji ? 'Edit emoji' : 'Add an emoji'}</DialogTitle>
          <DialogDescription>
            {emoji ? 'In ' : 'To '}
            {pack.name || 'this pack'}. Changes reach the apps on their next catalog
            check.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <AssetFileField
            label="Emoji"
            required={!emoji}
            current={emoji?.fileUrl}
            chosen={
              file.chosen
                ? { file: file.chosen.file, badge: fileBadge(file.chosen.mimetype) }
                : null
            }
            hint="Lottie (.json), PNG or WebP."
            accept={EMOJI_FILE_ACCEPT}
            disabled={busy}
            progress={file.progress}
            error={file.error}
            onChoose={(next) => void choose(next)}
          />

          <FormField
            id={`${id}-name`}
            label="Name"
            required
            hint="Up to 100 characters."
            error={errors.name?.message}
          >
            <Input id={`${id}-name`} maxLength={100} {...register('name')} />
          </FormField>

          <FormField
            id={`${id}-shortcode`}
            label="Shortcode"
            required
            hint="Like :heart_eyes: — unique across every pack."
            error={errors.shortcode?.message}
          >
            <Input
              id={`${id}-shortcode`}
              className="font-mono"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              {...register('shortcode')}
            />
          </FormField>

          <FormField
            id={`${id}-type`}
            label="Type"
            required
            hint={
              typeLocked
                ? 'Set by the file: a Lottie animates, a PNG cannot.'
                : 'A WebP can be either; say which this one is.'
            }
            error={errors.type?.message}
          >
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={typeLocked}
                >
                  <SelectTrigger id={`${id}-type`} className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANIMATED">Animated</SelectItem>
                    <SelectItem value="STATIC">Static</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          {formError ? (
            <p
              className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-body text-danger-foreground"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : emoji ? 'Save changes' : 'Add emoji'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
