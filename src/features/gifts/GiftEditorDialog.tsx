import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle } from 'lucide-react'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
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
import { formatCount } from '@/lib/format'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import type { Gift, GiftCategory } from '@/types/catalog'

import {
  buildCreateGiftPayload,
  buildUpdateGiftPayload,
  checkGiftFile,
  giftFormSchema,
  GIFT_FILE_ACCEPT,
  GIFT_FORM_FIELDS,
  nextSortOrder,
  toGiftFormValues,
  type GiftFormValues,
  type UploadedAsset,
} from './giftForm'
import {
  uploadGiftFile,
  useCreateGiftMutation,
  useUpdateGiftMutation,
} from './useGifts'

/**
 * Create or edit a gift (plan.md §4, phase G3).
 *
 * ⚠️ **The file is uploaded on save, never on selection.** Storage has no
 * delete route the panel can reach, so uploading when a file is picked would
 * leave an orphan for every abandoned dialog — the announcement editor's rule,
 * for the same reason.
 *
 * ⚠️ **An upload survives a failed save.** If the bytes reached storage and
 * the record write then failed, a retry reuses the `fileUrl` rather than
 * uploading the same file a second time.
 *
 * ⚠️ **The upload leaves our API entirely** — a pre-signed PUT straight to
 * `media.callschat.com`. Its failures are storage failures, reported as such,
 * and nothing is saved when one happens.
 */
export interface GiftEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates. */
  gift: Gift | null
  categories: readonly GiftCategory[]
  /** Pre-selected category when creating from a category's own button. */
  defaultCategoryId?: string | undefined
}

type Phase = 'idle' | 'uploading' | 'saving'

interface ChosenFile {
  readonly file: File
  readonly mimetype: string
  readonly animationType: UploadedAsset['animationType']
}

export function GiftEditorDialog({
  open,
  onOpenChange,
  gift,
  categories,
  defaultCategoryId,
}: GiftEditorDialogProps) {
  const returnFocus = useReturnFocus(open)
  const create = useCreateGiftMutation()
  const update = useUpdateGiftMutation()

  const baseId = useId()
  const field = (name: string) => `${baseId}-${name}`

  const editing = gift !== null
  const storedPrice =
    gift && typeof gift.priceDiamonds === 'number' ? gift.priceDiamonds : null

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<GiftFormValues>({
    resolver: zodResolver(giftFormSchema(editing ? storedPrice : null)),
    defaultValues: toGiftFormValues(gift, defaultCategoryId),
  })

  const [chosen, setChosen] = useState<ChosenFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<{ file: File; asset: UploadedAsset } | null>(
    null,
  )
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  const busy = phase !== 'idle'
  const typedPrice = (useWatch({ control, name: 'priceDiamonds' }) ?? '').trim()

  async function choose(file: File | null) {
    setFileError(null)
    if (!file) return
    const verdict = await checkGiftFile(file)
    if (!verdict.ok) {
      setChosen(null)
      setFileError(verdict.message)
      return
    }
    setChosen({
      file,
      mimetype: verdict.mimetype,
      animationType: verdict.animationType,
    })
  }

  async function upload(): Promise<UploadedAsset | null> {
    if (!chosen) return null
    if (uploaded?.file === chosen.file) return uploaded.asset

    setPhase('uploading')
    setProgress(0)
    try {
      const fileUrl = await uploadGiftFile(chosen.file, chosen.mimetype, setProgress)
      const asset = { fileUrl, animationType: chosen.animationType }
      setUploaded({ file: chosen.file, asset })
      return asset
    } catch (error) {
      setFileError(
        `${isAppError(error) || error instanceof Error ? error.message : 'The upload failed.'} Nothing was saved.`,
      )
      throw error
    }
  }

  function saveFailed(error: unknown) {
    if (isAppError(error) && error.code === 'FOREIGN_KEY_CONSTRAINT') {
      /* ⚠️ Prisma's wording, re-said in the operator's terms. */
      setError('categoryId', {
        type: 'server',
        message: 'That category no longer exists. Choose another.',
      })
      return
    }
    if (!applyServerFieldErrors(error, setError, GIFT_FORM_FIELDS)) {
      setFormError(formLevelMessage(error) ?? 'The gift could not be saved.')
    }
  }

  async function onSubmit(values: GiftFormValues) {
    setFormError(null)

    if (!editing && !chosen) {
      setFileError('Choose the gift’s animation file.')
      return
    }

    let asset: UploadedAsset | null
    try {
      asset = await upload()
    } catch {
      setPhase('idle')
      return
    }

    setPhase('saving')
    try {
      if (gift) {
        const payload = buildUpdateGiftPayload(values, gift, asset)
        if (Object.keys(payload).length === 0) {
          toast.info('Nothing changed.')
          onOpenChange(false)
          return
        }
        await update.mutateAsync({ id: gift.id, payload })
        toast.success('Gift updated.')
      } else if (asset) {
        const siblings =
          categories.find((category) => category.id === values.categoryId)?.gifts ?? []
        await create.mutateAsync(
          buildCreateGiftPayload(values, asset, nextSortOrder(siblings)),
        )
        toast.success('Gift created.')
      }
      onOpenChange(false)
    } catch (error) {
      saveFailed(error)
    } finally {
      setPhase('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit gift' : 'New gift'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Saved changes reach the apps on their next catalog check. There is no draft.'
              : 'A new gift is on sale as soon as it is saved, if its category is active.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <FormField
            id={field('name')}
            label="Name"
            required
            hint="Up to 100 characters."
            error={errors.name?.message}
          >
            <Input id={field('name')} maxLength={100} {...register('name')} />
          </FormField>

          <FormField
            id={field('categoryId')}
            label="Category"
            required
            error={errors.categoryId?.message}
          >
            <Controller
              control={control}
              name="categoryId"
              render={({ field: control }) => (
                <Select value={control.value} onValueChange={control.onChange}>
                  <SelectTrigger id={field('categoryId')} className="w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name || 'Untitled category'}
                        {category.isActive === true ? '' : ' (inactive)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField
            id={field('priceDiamonds')}
            label="Price in diamonds"
            required
            hint={
              editing && storedPrice === 0 && typedPrice === '0' ? (
                /*
                 * ⚠️ **States the 0, does not replace it** (plan.md O1). The
                 * server refuses to *save* a 0, but leaving it unchanged sends
                 * nothing — measured — so a rename stays a rename.
                 */
                <span className="flex items-start gap-1.5 text-warning-foreground">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  This gift is free. Left at 0 the price is not sent and stays as it is;
                  a new price must be at least 1.
                </span>
              ) : /^\d+$/.test(typedPrice) ? (
                /*
                 * Spelled back with separators: there is no upper bound
                 * server-side (`100000000` saved), so a slipped zero is a
                 * real price.
                 */
                `${formatCount(Number(typedPrice))} diamonds per gift. Whole numbers, at least 1.`
              ) : (
                'Whole numbers, at least 1.'
              )
            }
            error={errors.priceDiamonds?.message}
          >
            <Input
              id={field('priceDiamonds')}
              inputMode="numeric"
              {...register('priceDiamonds')}
            />
          </FormField>

          <AssetFileField
            label="Animation"
            required={!editing}
            current={gift?.animationUrl ?? gift?.iconUrl}
            chosen={chosen ? { file: chosen.file, badge: chosen.animationType } : null}
            hint="Lottie (.json), WebP or MP4. Used as both icon and animation."
            accept={GIFT_FILE_ACCEPT}
            disabled={busy}
            progress={phase === 'uploading' ? progress : null}
            error={fileError}
            onChoose={(file) => void choose(file)}
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
              {phase === 'uploading'
                ? 'Uploading…'
                : phase === 'saving'
                  ? 'Saving…'
                  : editing
                    ? 'Save changes'
                    : 'Create gift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
