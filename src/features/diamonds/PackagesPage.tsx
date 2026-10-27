import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { usePermission } from '@/auth/useAuth'
import { PERMISSIONS } from '@/auth/permissions'
import { DataList, type AdminColumn } from '@/components/data'
import { PageHeader } from '@/components/display'
import { ConfirmActionDialog } from '@/components/feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import type { DiamondPackage } from '@/types/wallet'

import { formatDiamondAmount, formatWholeCurrency } from './money'
import { PackageEditorDialog } from './PackageEditorDialog'
import { useDeletePackageMutation, useDiamondPackagesQuery } from './useWallet'

/**
 * The diamond price list (plan.md §5, phase W4).
 *
 * ⚠️ **This page is the storefront.** Everything on it is live: there is no
 * draft, no scheduling and no preview, so a saved change reaches every buyer
 * on their next app open.
 *
 * ⚠️ **Reading and writing are different permissions, and the split is not
 * decoration.** `wallets.view` is granted to ADMIN; `diamond_packages.configure`
 * is Super-Admin-only because `doc/RBAC, Security, and Privacy.md:52` reserves
 * pricing with the rest of the finance class. So an ADMIN sees the price list —
 * which they need, to answer "what did this person buy" — and cannot change it.
 * Unlike the top-up queue, hiding the controls here is **not** theatre: the
 * backend's own policy is the one being reflected.
 *
 * ⚠️ **No pagination.** `GET /admin/wallet/packages` answers a bare array
 * (measured), and a price list is a handful of tiers by nature. A pager would
 * be furniture.
 */

export function PackagesPage() {
  const can = usePermission()
  const mayConfigure = can(PERMISSIONS.diamondPackagesConfigure)

  const list = useDiamondPackagesQuery()
  const remove = useDeletePackageMutation()

  const [editing, setEditing] = useState<DiamondPackage | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleting, setDeleting] = useState<DiamondPackage | null>(null)

  const rows = list.data ?? []

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(record: DiamondPackage) {
    setEditing(record)
    setEditorOpen(true)
  }

  const columns: readonly AdminColumn<DiamondPackage>[] = [
    {
      id: 'title',
      header: 'Package',
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium wrap-anywhere">{row.title || 'Untitled'}</span>
          {row.badgeText ? (
            <Badge className="w-fit bg-info-soft text-info-foreground">
              {row.badgeText}
            </Badge>
          ) : null}
        </span>
      ),
      card: 'title',
    },
    {
      id: 'diamonds',
      header: 'Diamonds',
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <span className="tabular font-medium">
            {formatDiamondAmount(row.diamonds)}
          </span>
          {typeof row.bonusDiamonds === 'number' && row.bonusDiamonds > 0 ? (
            <span className="tabular text-caption text-success-foreground">
              +{formatDiamondAmount(row.bonusDiamonds)} bonus
            </span>
          ) : null}
        </span>
      ),
      card: 'meta',
    },
    {
      id: 'price',
      header: 'Price',
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <span className="tabular">{formatWholeCurrency(row.priceBdt, 'BDT')}</span>
          {typeof row.priceUsd === 'number' ? (
            <span className="tabular text-caption text-foreground-muted">
              {formatWholeCurrency(row.priceUsd, 'USD')}
            </span>
          ) : null}
        </span>
      ),
      card: 'meta',
    },
    {
      id: 'sortOrder',
      header: 'Order',
      cell: (row) => (
        <span className="tabular text-foreground-muted">
          {typeof row.sortOrder === 'number' ? row.sortOrder : '—'}
        </span>
      ),
      card: 'meta',
    },
    {
      id: 'isActive',
      header: 'Store',
      cell: (row) => (
        /*
         * ⚠️ "Hidden" rather than an absent badge. An inactive tier still
         * exists and is still purchasable history — a blank cell would read
         * as "no data" on the one column that decides whether people can buy.
         */
        <Badge
          className={cn(
            'w-fit',
            row.isActive === true
              ? 'bg-success-soft text-success-foreground'
              : 'bg-neutral-soft text-neutral-foreground',
          )}
        >
          {row.isActive === true ? 'On sale' : 'Hidden'}
        </Badge>
      ),
      card: 'status',
    },
    ...(mayConfigure
      ? [
          {
            id: 'actions',
            header: 'Actions',
            cell: (row: DiamondPackage) => (
              <span className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Edit ${row.title || 'package'}`}
                  onClick={() => openEdit(row)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Delete ${row.title || 'package'}`}
                  onClick={() => setDeleting(row)}
                >
                  Delete
                </Button>
              </span>
            ),
            card: 'meta' as const,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diamond packages"
        description="What buyers can purchase. Every change here is live on the next app open — there is no draft."
        actions={
          mayConfigure ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              New package
            </Button>
          ) : undefined
        }
      />

      <DataList
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.title ?? row.id}
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The package list could not be loaded.',
              }
            : null
        }
        onRetry={() => void list.refetch()}
        emptyTitle="No packages yet"
        emptyDescription={
          mayConfigure
            ? 'Nothing is on sale. Buyers have no way to add diamonds until a package exists.'
            : 'Nothing is on sale. Buyers have no way to add diamonds until a Super Admin creates a package.'
        }
        emptyAction={
          /*
           * ⚠️ Not "New package" — that is the header action's name, and two
           * buttons with one accessible name are indistinguishable in a rotor
           * list even though they sit far apart on screen.
           */
          mayConfigure ? (
            <Button onClick={openCreate}>Create the first package</Button>
          ) : undefined
        }
      />

      {/*
       * ⚠️ Keyed on the record so the form re-seeds when the operator switches
       * rows. Without the key, react-hook-form keeps the first row's
       * `defaultValues` and the second row opens showing the first one's
       * prices — an edit that saves the wrong numbers under the right name.
       */}
      <PackageEditorDialog
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        record={editing}
      />

      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this package"
        target={deleting?.title ?? ''}
        /*
         * ⚠️ The alternative is stated, because it is almost always the right
         * one. Deleting removes the tier outright; switching it off withdraws
         * it from sale and keeps the record attached to the purchases people
         * already made against it.
         */
        effect="This removes the package outright. If you only want to stop selling it, switch it off instead — that keeps the record attached to every purchase already made against it."
        severity="critical"
        confirmLabel="Delete package"
        reason="none"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Package deleted.')
              setDeleting(null)
            },
            onError: (error) =>
              toast.error(
                isAppError(error) ? error.message : 'The package could not be deleted.',
              ),
          })
        }}
      />
    </div>
  )
}
