import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { applyServerFieldErrors, formLevelMessage } from '@/api/formErrors'
import { FormField } from '@/components/form'
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
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import type { GiftCategory } from '@/types/catalog'

import { categoryFormSchema, type CategoryFormValues } from './giftForm'
import { byOrder } from '@/lib/ordering'
import { useCreateCategoryMutation, useUpdateCategoryMutation } from './useGifts'

/**
 * Create or rename a gift category (plan.md §4, phase G3).
 *
 * A name is the whole record an operator controls here: order is set on the
 * page with Move up / Move down, and active state with its own confirmed
 * action, because deactivating a category takes every gift in it off sale —
 * measured, not assumed.
 */
export interface CategoryEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates. */
  category: GiftCategory | null
  categories: readonly GiftCategory[]
}

export function CategoryEditorDialog({
  open,
  onOpenChange,
  category,
  categories,
}: CategoryEditorDialogProps) {
  const returnFocus = useReturnFocus(open)
  const create = useCreateCategoryMutation()
  const update = useUpdateCategoryMutation()
  const id = useId()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category?.name ?? '' },
  })

  const pending = create.isPending || update.isPending

  function onSubmit(values: CategoryFormValues) {
    const name = values.name.trim()
    const onError = (error: unknown) => {
      if (!applyServerFieldErrors(error, setError, ['name'])) {
        toast.error(formLevelMessage(error) ?? 'The category could not be saved.')
      }
    }

    if (category) {
      if (name === (category.name ?? '')) {
        onOpenChange(false)
        return
      }
      update.mutate(
        { id: category.id, payload: { name } },
        {
          onSuccess: () => {
            toast.success('Category renamed.')
            onOpenChange(false)
          },
          onError,
        },
      )
      return
    }

    /* Appended after the last category, matching what Move down produces. */
    const last = byOrder(categories).at(-1)?.sortOrder
    create.mutate(
      { name, sortOrder: typeof last === 'number' ? last + 1 : 0 },
      {
        onSuccess: () => {
          toast.success('Category created.')
          onOpenChange(false)
        },
        onError,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{category ? 'Rename category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'The new name reaches the apps on their next catalog check.'
              : 'Added at the end of the list, active.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <FormField
            id={id}
            label="Name"
            required
            hint="2 to 100 characters."
            error={errors.name?.message}
          >
            <Input id={id} maxLength={100} {...register('name')} />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {category ? 'Save name' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
