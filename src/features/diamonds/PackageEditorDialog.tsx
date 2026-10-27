import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useReturnFocus } from '@/lib/hooks/useReturnFocus'
import type { DiamondPackage } from '@/types/wallet'

import {
  buildCreatePayload,
  buildUpdatePayload,
  packageFormSchema,
  PACKAGE_FORM_DEFAULTS,
  PACKAGE_FORM_FIELDS,
  toFormValues,
  type PackageFormValues,
} from './packageForm'
import { useCreatePackageMutation, useUpdatePackageMutation } from './useWallet'

/**
 * Create or edit a diamond package (plan.md §5, phase W4).
 *
 * ⚠️ **This is the platform's price list, and it is live the moment it
 * saves.** There is no draft state, no scheduled activation and no preview:
 * `isActive: true` puts a tier in front of every buyer on the next app open.
 * Two fields carry the risk and both are explicit controls rather than free
 * text — `sortOrder`, where a typo silently reorders the storefront, and
 * `isActive`, where a stray toggle withdraws a tier people are mid-purchase on.
 *
 * ⚠️ **No detail route exists** (`GET /admin/wallet/packages/:id` is
 * `ROUTE_NOT_FOUND`), so the form is seeded from the list row it was opened
 * from and the list is refetched afterwards rather than patched from the write
 * response.
 */
export interface PackageEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `null` creates; a record edits it. */
  record: DiamondPackage | null
}

export function PackageEditorDialog({
  open,
  onOpenChange,
  record,
}: PackageEditorDialogProps) {
  const returnFocus = useReturnFocus(open)
  const create = useCreatePackageMutation()
  const update = useUpdatePackageMutation()

  const baseId = useId()
  const field = (name: string) => `${baseId}-${name}`

  const editing = record !== null

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: record ? toFormValues(record) : PACKAGE_FORM_DEFAULTS,
  })

  const pending = create.isPending || update.isPending

  function onSubmit(values: PackageFormValues) {
    const onError = (error: unknown) => {
      /*
       * ⚠️ Server field errors land under their own fields. This backend
       * reports several at once — `body/title Title is required,
       * body/diamonds Base diamonds must be positive, …` — and collapsing
       * them into one toast makes an operator hunt for which input it meant.
       */
      if (!applyServerFieldErrors(error, setError, PACKAGE_FORM_FIELDS)) {
        toast.error(formLevelMessage(error) ?? 'The package could not be saved.')
      }
    }

    const onSuccess = () => {
      toast.success(editing ? 'Package updated.' : 'Package created.')
      onOpenChange(false)
    }

    if (editing && record) {
      update.mutate(
        { id: record.id, payload: buildUpdatePayload(values) },
        { onSuccess, onError },
      )
    } else {
      create.mutate(buildCreatePayload(values), { onSuccess, onError })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={returnFocus}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit package' : 'New package'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes reach the store on the next app open. There is no draft state.'
              : 'An active package is on sale immediately. Leave it inactive to set it up first.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        >
          <FormField
            id={field('title')}
            label="Title"
            required
            error={errors.title?.message}
          >
            <Input id={field('title')} {...register('title')} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={field('diamonds')}
              label="Diamonds"
              required
              hint="What the buyer receives before any bonus."
              error={errors.diamonds?.message}
            >
              <Input
                id={field('diamonds')}
                inputMode="numeric"
                {...register('diamonds')}
              />
            </FormField>

            <FormField
              id={field('bonusDiamonds')}
              label="Bonus diamonds"
              hint="Added on top. Leave empty for none."
              error={errors.bonusDiamonds?.message}
            >
              <Input
                id={field('bonusDiamonds')}
                inputMode="numeric"
                {...register('bonusDiamonds')}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={field('priceBdt')}
              label="Price (BDT)"
              required
              /*
               * ⚠️ Said out loud because the panel's own `formatMoney` takes
               * minor units and every other financial surface here is in
               * paisa. This field is not.
               */
              hint="Whole taka, not paisa."
              error={errors.priceBdt?.message}
            >
              <Input
                id={field('priceBdt')}
                inputMode="decimal"
                {...register('priceBdt')}
              />
            </FormField>

            <FormField
              id={field('priceUsd')}
              label="Price (USD)"
              hint="Optional. May have decimals."
              error={errors.priceUsd?.message}
            >
              <Input
                id={field('priceUsd')}
                inputMode="decimal"
                {...register('priceUsd')}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={field('badgeText')}
              label="Badge"
              hint="Shown on the tier, e.g. POPULAR. Clearing it removes the badge."
              error={errors.badgeText?.message}
            >
              <Input id={field('badgeText')} {...register('badgeText')} />
            </FormField>

            <FormField
              id={field('sortOrder')}
              label="Sort order"
              required
              /*
               * ⚠️ The field a typo silently reorders the storefront with. The
               * hint states the direction so nobody has to infer it from the
               * existing rows.
               */
              hint="Lower numbers appear first in the store."
              error={errors.sortOrder?.message}
            >
              <Input
                id={field('sortOrder')}
                inputMode="numeric"
                {...register('sortOrder')}
              />
            </FormField>
          </div>

          {/*
           * ⚠️ A switch with its consequence spelled out, not a bare toggle.
           * "Inactive" is the only way to withdraw a tier — there is no delete
           * that preserves history — so an operator needs to know that the
           * switch is the storefront.
           */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={field('isActive')}>On sale</Label>
              <p className="text-caption text-foreground-muted">
                Active packages are purchasable in the app right away. Inactive ones
                stay here but disappear from the store.
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field: control }) => (
                <Switch
                  id={field('isActive')}
                  checked={control.value}
                  onCheckedChange={control.onChange}
                />
              )}
            />
          </div>

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
              {editing ? 'Save changes' : 'Create package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
