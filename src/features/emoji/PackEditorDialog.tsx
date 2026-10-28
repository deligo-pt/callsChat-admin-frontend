import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import type { EmojiPack } from '@/types/catalog'

import {
  buildUpdatePackPayload,
  COVER_FILE_ACCEPT,
  nextSortOrder,
  packFormSchema,
  toPackFormValues,
  type PackFormValues,
} from './emojiForm'
import { useCreatePackMutation, useUpdatePackMutation } from './useEmoji'
import { usePendingUpload } from './usePendingUpload'

/**
 * Create or edit an emoji pack (plan.md §4, phase G4).
 *
 * ⚠️ **Premium is a flag, not a price.** Nothing in this contract sells a
 * pack for diamonds (plan.md §3.4), so the switch says what it marks and
 * claims nothing about what it charges.
 */
export interface PackEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates. */
  pack: EmojiPack | null
  packs: readonly EmojiPack[]
}

export function PackEditorDialog({
  open,
  onOpenChange,
  pack,
  packs,
}: PackEditorDialogProps) {
  const returnFocus = useReturnFocus(open)
  const create = useCreatePackMutation()
  const update = useUpdatePackMutation()
  const cover = usePendingUpload('packs')
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<PackFormValues>({
    resolver: zodResolver(packFormSchema),
    defaultValues: toPackFormValues(pack),
  })

  async function onSubmit(values: PackFormValues) {
    setFormError(null)
    if (!pack && !cover.chosen) {
      cover.setError('Choose a cover image.')
      return
    }

    setBusy(true)
    try {
      let coverUrl: string | null
      try {
        coverUrl = await cover.upload()
      } catch {
        return
      }

      if (pack) {
        const payload = buildUpdatePackPayload(values, pack, coverUrl)
        if (Object.keys(payload).length === 0) {
          toast.info('Nothing changed.')
          onOpenChange(false)
          return
        }
        await update.mutateAsync({ id: pack.id, payload })
        toast.success('Pack updated.')
      } else if (coverUrl) {
        /* Sent explicitly — an emoji with none is stored at 0 (measured). */
        await create.mutateAsync({
          name: values.name.trim(),
          coverUrl,
          isPremium: values.isPremium,
          sortOrder: nextSortOrder(packs),
        })
        toast.success('Pack created.')
      }
      onOpenChange(false)
    } catch (error) {
      if (!applyServerFieldErrors(error, setError, ['name', 'isPremium'])) {
        setFormError(formLevelMessage(error) ?? 'The pack could not be saved.')
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
          <DialogTitle>{pack ? 'Edit pack' : 'New emoji pack'}</DialogTitle>
          <DialogDescription>
            {pack
              ? 'Saved changes reach the apps on their next catalog check.'
              : 'Added at the end of the list, active. Add its emojis once it exists.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <FormField
            id={`${id}-name`}
            label="Name"
            required
            hint="2 to 100 characters."
            error={errors.name?.message}
          >
            <Input id={`${id}-name`} maxLength={100} {...register('name')} />
          </FormField>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${id}-premium`}>Premium</Label>
              <p className="text-caption text-foreground-muted">
                Marks the pack as premium for the apps. It sets no price — nothing in
                the catalog charges diamonds for a pack.
              </p>
            </div>
            <Controller
              control={control}
              name="isPremium"
              render={({ field }) => (
                <Switch
                  id={`${id}-premium`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          <AssetFileField
            label="Cover"
            required={!pack}
            current={pack?.coverUrl}
            chosen={cover.chosen ? { file: cover.chosen.file, badge: 'IMAGE' } : null}
            hint="PNG, WebP or JPEG — the upload service takes only images for covers."
            accept={COVER_FILE_ACCEPT}
            disabled={busy}
            progress={cover.progress}
            error={cover.error}
            onChoose={(file) => void cover.choose(file)}
          />

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
              {busy ? 'Saving…' : pack ? 'Save changes' : 'Create pack'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
