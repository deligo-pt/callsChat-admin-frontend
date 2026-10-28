import { AlertTriangle, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { usePermission } from '@/auth/useAuth'
import { PERMISSIONS } from '@/auth/permissions'
import { ActiveBadge, MoveButtons, RowMenu } from '@/components/catalog/CatalogControls'
import { PageHeader } from '@/components/display'
import {
  ConfirmActionDialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/feedback'
import { CatalogAsset } from '@/components/media/CatalogAsset'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { formatCount } from '@/lib/format'
import type { Gift, GiftCategory } from '@/types/catalog'

import { CategoryEditorDialog } from './CategoryEditorDialog'
import { GiftEditorDialog } from './GiftEditorDialog'
import {
  byOrder,
  isActiveRow,
  moveBatch,
  type Direction,
  type Orderable,
} from '@/lib/ordering'
import {
  useCatalogVersionQuery,
  useGiftCatalogQuery,
  useReorderMutation,
  useSetCategoryActiveMutation,
  useSetGiftActiveMutation,
  type ReorderTarget,
} from './useGifts'

/**
 * The gift catalog — `/diamonds/gifts` (plan.md §4, phases G2–G3).
 *
 * ⚠️ **Everything on this page is live.** A reorder bumps `giftVersion` and
 * the apps pick it up on their next catalog check; there is no draft.
 *
 * ⚠️ **Reading and writing are different permissions** — `wallets.view` reads,
 * `gifts.configure` (Super-Admin-only, `doc/RBAC, Security, and
 * Privacy.md:52`) writes. The same split as diamond packages, for the same
 * reason: an ADMIN needs to see what a gift costs to answer a user, and pricing
 * is reserved with the rest of the finance class.
 */

type Visibility = 'all' | 'active' | 'inactive'

const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = {
  all: 'All gifts',
  active: 'Active only',
  inactive: 'Inactive only',
}

const isActive = isActiveRow

/** Which editor is open, if any. */
type Editor =
  | { readonly kind: 'gift'; readonly gift: Gift | null; readonly categoryId?: string }
  | { readonly kind: 'category'; readonly category: GiftCategory | null }

/** An active-state change waiting on confirmation. */
type Toggle =
  | { readonly kind: 'gift'; readonly record: Gift; readonly active: boolean }
  | {
      readonly kind: 'category'
      readonly record: GiftCategory
      readonly active: boolean
    }

/*
 * ⚠️ **Category deactivation takes every gift in it off sale — measured.**
 * On 2026-10-28 a probe gift was made active inside an inactive category, and
 * `GET /gifts/catalog` (what the apps read) did not list it. So the category
 * switch is the bigger of the two, and its dialog says so.
 */
const TOGGLE_COPY = {
  gift: {
    off: {
      title: 'Deactivate this gift',
      confirm: 'Deactivate gift',
      effect:
        'It disappears from the gift panel in the apps on their next catalog check. Gifts already sent keep their history, and you can reactivate it at any time.',
    },
    on: {
      title: 'Reactivate this gift',
      confirm: 'Reactivate gift',
      effect:
        'It goes back on sale at its current price on the apps’ next catalog check — unless its category is inactive.',
    },
  },
  category: {
    off: {
      title: 'Deactivate this category',
      confirm: 'Deactivate category',
      effect:
        'Every gift in it disappears from the apps, including gifts that are still marked Active. Nothing is deleted, and reactivating the category brings them back.',
    },
    on: {
      title: 'Reactivate this category',
      confirm: 'Reactivate category',
      effect:
        'It returns to the apps with every gift in it that is marked Active, at their current prices.',
    },
  },
} as const

function visible(row: { isActive?: boolean | null | undefined }, view: Visibility) {
  if (view === 'all') return true
  return view === 'active' ? isActive(row) : !isActive(row)
}

export function GiftCatalogPage() {
  const can = usePermission()
  const mayConfigure = can(PERMISSIONS.giftsConfigure)

  const catalog = useGiftCatalogQuery()
  const version = useCatalogVersionQuery()
  const reorder = useReorderMutation()
  const setGiftActive = useSetGiftActiveMutation()
  const setCategoryActive = useSetCategoryActiveMutation()
  const [view, setView] = useState<Visibility>('all')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [toggle, setToggle] = useState<Toggle | null>(null)

  const categories = byOrder(catalog.data ?? [])
  const gifts = categories.flatMap((category) => category.gifts ?? [])

  /*
   * ⚠️ **Counted on active gifts only.** An inactive gift at 0 is not on sale
   * and costs nobody anything; the warning is about what buyers can send.
   */
  const freeGifts = gifts.filter(
    (gift) => isActive(gift) && (gift.priceDiamonds ?? 0) <= 0,
  ).length

  /*
   * ⚠️ **Reordering is offered only on the unfiltered view.** "Move up" on a
   * filtered list would move a row past siblings the operator cannot see —
   * the batch renumbers the whole group, hidden rows included.
   */
  const mayReorder = mayConfigure && view === 'all'

  function move(
    target: ReorderTarget,
    siblings: readonly Orderable[],
    id: string,
    direction: Direction,
    name: string,
  ) {
    const payload = moveBatch(siblings, id, direction)
    if (!payload) return

    reorder.mutate(
      { target, payload },
      {
        onSuccess: () => toast.success(`${name} moved ${direction}.`),
        onError: (error) =>
          toast.error(
            isAppError(error) ? error.message : 'The new order could not be saved.',
          ),
      },
    )
  }

  function confirmToggle() {
    if (!toggle) return
    const { kind, record, active } = toggle
    const name = record.name?.trim() || (kind === 'gift' ? 'Gift' : 'Category')
    const options = {
      onSuccess: () => {
        toast.success(`${name} ${active ? 'reactivated' : 'deactivated'}.`)
        setToggle(null)
      },
      onError: (error: unknown) =>
        toast.error(
          isAppError(error) ? error.message : 'The change could not be saved.',
        ),
    }
    if (kind === 'gift') setGiftActive.mutate({ id: record.id, active }, options)
    else setCategoryActive.mutate({ id: record.id, active }, options)
  }

  const toggleCopy = toggle
    ? TOGGLE_COPY[toggle.kind][toggle.active ? 'on' : 'off']
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift catalog"
        description="What viewers can send to hosts, and what each gift costs. Changes reach the apps on their next catalog check — there is no draft."
        actions={
          mayConfigure ? (
            <span className="flex flex-wrap gap-2">
              {/*
               * ⚠️ Both wait for the list. A new row is appended after the
               * last one, and before the list loads there is no last one —
               * a category created then would land at 0, on top.
               */}
              <Button
                variant="outline"
                disabled={!catalog.isSuccess}
                onClick={() => setEditor({ kind: 'category', category: null })}
              >
                <Plus className="size-4" aria-hidden="true" />
                New category
              </Button>
              {/*
               * ⚠️ Disabled, not hidden, with no category to put a gift in —
               * the create route requires one, and the empty state below says
               * which comes first.
               */}
              <Button
                disabled={!catalog.isSuccess || categories.length === 0}
                onClick={() => setEditor({ kind: 'gift', gift: null })}
              >
                <Plus className="size-4" aria-hidden="true" />
                New gift
              </Button>
            </span>
          ) : undefined
        }
      />

      {freeGifts > 0 ? (
        /*
         * ⚠️ **The data is the problem, and the screen says so** (plan.md O1,
         * O2). Every live gift is at 0 diamonds, so gifting earns hosts
         * nothing — which is why the roster's lifetime earnings are zero.
         */
        <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-body text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {freeGifts === 1
              ? '1 gift on sale costs 0 diamonds.'
              : `${formatCount(freeGifts)} gifts on sale cost 0 diamonds.`}{' '}
            Sending a free gift earns the host nothing. A free gift can still be renamed
            or moved, but the server will not accept 0 as a new price — re-pricing one
            means at least 1.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="gift-visibility">Show</Label>
          <Select value={view} onValueChange={(value) => setView(value as Visibility)}>
            <SelectTrigger id="gift-visibility" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {VISIBILITY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/*
           * ⚠️ Says where the filter runs. `?isActive=` is ignored by the
           * server (plan.md O3), so this filters what was already loaded.
           */}
          <p className="text-caption text-foreground-muted">
            {view === 'all'
              ? 'Filtered in the panel; the server returns every gift.'
              : 'Filtered in the panel. Reordering is available on All gifts.'}
          </p>
        </div>

        {version.data ? (
          <p className="text-caption text-foreground-muted">
            Catalog version{' '}
            <span className="tabular font-medium text-foreground">
              {version.data.giftVersion}
            </span>
          </p>
        ) : null}
      </div>

      {catalog.isPending ? (
        <LoadingState variant="cards" rows={3} />
      ) : catalog.isError ? (
        <ErrorState
          title="The gift catalog could not be loaded"
          description={
            isAppError(catalog.error)
              ? catalog.error.message
              : 'The gift catalog could not be loaded.'
          }
          onRetry={() => void catalog.refetch()}
        />
      ) : categories.length === 0 ? (
        <EmptyState
          title="No gift categories yet"
          description="Viewers have nothing to send. Gifts belong to a category, so a category comes first."
        />
      ) : (
        <ol className="space-y-4" aria-label="Gift categories">
          {categories.map((category, index) => (
            <CategorySection
              key={category.id}
              category={category}
              view={view}
              mayReorder={mayReorder}
              busy={reorder.isPending}
              first={index === 0}
              last={index === categories.length - 1}
              onMoveCategory={(direction) =>
                move(
                  'categories',
                  categories,
                  category.id,
                  direction,
                  category.name || 'Category',
                )
              }
              onMoveGift={(siblings, gift, direction) =>
                move('gifts', siblings, gift.id, direction, gift.name || 'Gift')
              }
              actions={
                mayConfigure
                  ? {
                      onRename: () => setEditor({ kind: 'category', category }),
                      onAddGift: () =>
                        setEditor({
                          kind: 'gift',
                          gift: null,
                          categoryId: category.id,
                        }),
                      onToggle: () =>
                        setToggle({
                          kind: 'category',
                          record: category,
                          active: !isActive(category),
                        }),
                      onEditGift: (gift) => setEditor({ kind: 'gift', gift }),
                      onToggleGift: (gift) =>
                        setToggle({
                          kind: 'gift',
                          record: gift,
                          active: !isActive(gift),
                        }),
                    }
                  : null
              }
            />
          ))}
        </ol>
      )}

      {/*
       * ⚠️ Keyed on the record, so switching rows re-seeds the form instead of
       * saving one gift's values under another's name (the W4 lesson).
       */}
      {editor?.kind === 'gift' ? (
        <GiftEditorDialog
          key={editor.gift?.id ?? `new-${editor.categoryId ?? ''}`}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          gift={editor.gift}
          categories={categories}
          defaultCategoryId={editor.categoryId}
        />
      ) : null}

      {editor?.kind === 'category' ? (
        <CategoryEditorDialog
          key={editor.category?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          category={editor.category}
          categories={categories}
        />
      ) : null}

      <ConfirmActionDialog
        open={toggle !== null}
        onOpenChange={(open) => !open && setToggle(null)}
        title={toggleCopy?.title ?? ''}
        target={toggle?.record.name ?? ''}
        effect={toggleCopy?.effect ?? ''}
        severity={
          toggle?.active ? 'info' : toggle?.kind === 'category' ? 'critical' : 'warning'
        }
        confirmLabel={toggleCopy?.confirm ?? ''}
        reason="none"
        loading={setGiftActive.isPending || setCategoryActive.isPending}
        onConfirm={confirmToggle}
      />
    </div>
  )
}

interface CatalogActions {
  readonly onRename: () => void
  readonly onAddGift: () => void
  readonly onToggle: () => void
  readonly onEditGift: (gift: Gift) => void
  readonly onToggleGift: (gift: Gift) => void
}

function CategorySection({
  category,
  view,
  mayReorder,
  busy,
  first,
  last,
  onMoveCategory,
  onMoveGift,
  actions,
}: {
  category: GiftCategory
  view: Visibility
  mayReorder: boolean
  busy: boolean
  first: boolean
  last: boolean
  onMoveCategory: (direction: Direction) => void
  onMoveGift: (siblings: readonly Gift[], gift: Gift, direction: Direction) => void
  actions: CatalogActions | null
}) {
  const name = category.name?.trim() || 'Untitled category'
  const all = byOrder(category.gifts ?? [])
  const shown = all.filter((gift) => visible(gift, view))
  const headingId = `gift-category-${category.id}`

  return (
    <li
      className={cn(
        'rounded-lg border border-border bg-surface',
        !isActive(category) && 'border-dashed',
      )}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id={headingId} className="min-w-0 font-semibold wrap-anywhere">
            {name}
          </h2>
          <ActiveBadge active={isActive(category)} />
          <span className="text-caption text-foreground-muted">
            {all.length === 1 ? '1 gift' : `${formatCount(all.length)} gifts`}
          </span>
        </div>
        <span className="flex items-center gap-1">
          {mayReorder ? (
            <MoveButtons
              name={name}
              first={first}
              last={last}
              busy={busy}
              onMove={onMoveCategory}
            />
          ) : null}
          {actions ? (
            <RowMenu label={`Actions for ${name}`}>
              <DropdownMenuItem onSelect={actions.onAddGift}>
                Add a gift here
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onToggle}>
                {isActive(category) ? 'Deactivate' : 'Reactivate'}
              </DropdownMenuItem>
            </RowMenu>
          ) : null}
        </span>
      </div>

      {!isActive(category) ? (
        /*
         * ⚠️ Measured 2026-10-28: the apps' catalog omits every gift in an
         * inactive category, Active badges notwithstanding. Said here because
         * the badges below would otherwise say the opposite.
         */
        <p className="border-b border-border px-4 py-2 text-caption text-foreground-muted">
          This category is inactive, so none of its gifts are shown in the apps.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="px-4 py-4 text-body text-foreground-muted">
          {all.length === 0
            ? 'No gifts in this category.'
            : `No ${view === 'active' ? 'active' : 'inactive'} gifts in this category.`}
        </p>
      ) : (
        <ol className="divide-y divide-border" aria-label={`Gifts in ${name}`}>
          {shown.map((gift, index) => (
            <GiftRow
              key={gift.id}
              gift={gift}
              mayReorder={mayReorder}
              busy={busy}
              first={index === 0}
              last={index === shown.length - 1}
              onMove={(direction) => onMoveGift(all, gift, direction)}
              onEdit={actions ? () => actions.onEditGift(gift) : null}
              onToggle={actions ? () => actions.onToggleGift(gift) : null}
            />
          ))}
        </ol>
      )}
    </li>
  )
}

function GiftRow({
  gift,
  mayReorder,
  busy,
  first,
  last,
  onMove,
  onEdit,
  onToggle,
}: {
  gift: Gift
  mayReorder: boolean
  busy: boolean
  first: boolean
  last: boolean
  onMove: (direction: Direction) => void
  onEdit: (() => void) | null
  onToggle: (() => void) | null
}) {
  const [focused, setFocused] = useState(false)
  const name = gift.name?.trim() || 'Untitled gift'
  const price = gift.priceDiamonds
  const free = typeof price === 'number' && price <= 0

  return (
    <li
      className="flex items-center gap-3 px-4 py-3"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <CatalogAsset value={gift.iconUrl ?? gift.animationUrl} active={focused} />

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 font-medium wrap-anywhere" title={name}>
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'tabular text-caption',
              free ? 'font-medium text-warning-foreground' : 'text-foreground-muted',
            )}
          >
            {typeof price === 'number' && Number.isFinite(price)
              ? `${formatCount(Math.trunc(price))} diamonds`
              : 'No price'}
          </span>
          <ActiveBadge active={isActive(gift)} />
        </span>
      </span>

      {mayReorder ? (
        <MoveButtons
          name={name}
          first={first}
          last={last}
          busy={busy}
          onMove={onMove}
        />
      ) : null}
      {onEdit && onToggle ? (
        <RowMenu label={`Actions for ${name}`}>
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggle}>
            {isActive(gift) ? 'Deactivate' : 'Reactivate'}
          </DropdownMenuItem>
        </RowMenu>
      ) : null}
    </li>
  )
}
