import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { ActiveBadge, MoveButtons, RowMenu } from '@/components/catalog/CatalogControls'
import { PageHeader } from '@/components/display'
import {
  ConfirmActionDialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/feedback'
import { CatalogAsset } from '@/components/media/CatalogAsset'
import { Badge } from '@/components/ui/badge'
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
import {
  byOrder,
  isActiveRow,
  moveBatch,
  type Direction,
  type Orderable,
} from '@/lib/ordering'
import type { Emoji, EmojiPack } from '@/types/catalog'

import { BulkEmojiDialog } from './BulkEmojiDialog'
import { EmojiEditorDialog } from './EmojiEditorDialog'
import { PackEditorDialog } from './PackEditorDialog'
import {
  useEmojiPacksQuery,
  useEmojiVersionQuery,
  useReorderMutation,
  useSetEmojiActiveMutation,
  useSetPackActiveMutation,
  type ReorderTarget,
} from './useEmoji'

/**
 * Emoji packs — `/emoji-packs`, in Platform (plan.md §3.4, phase G4).
 *
 * ⚠️ **In Platform, not Diamonds.** A pack has no price, only `isPremium`,
 * and nothing in this contract sells one for diamonds. It shares an upload
 * route and a version endpoint with the gift catalog, and a types module —
 * not a screen.
 *
 * ⚠️ **Gated on `gifts.configure` for reading as well as writing** (plan.md
 * §3.1), unlike the gift catalog, which ADMIN may read.
 */

type Visibility = 'all' | 'active' | 'inactive'

const VISIBILITY_LABEL: Readonly<Record<Visibility, string>> = {
  all: 'All emojis',
  active: 'Active only',
  inactive: 'Inactive only',
}

const isActive = isActiveRow

function visible(row: { isActive?: boolean | null | undefined }, view: Visibility) {
  if (view === 'all') return true
  return view === 'active' ? isActive(row) : !isActive(row)
}

type Editor =
  | { readonly kind: 'pack'; readonly pack: EmojiPack | null }
  | { readonly kind: 'emoji'; readonly pack: EmojiPack; readonly emoji: Emoji | null }
  | { readonly kind: 'bulk'; readonly pack: EmojiPack }

type Toggle =
  | { readonly kind: 'pack'; readonly record: EmojiPack; readonly active: boolean }
  | { readonly kind: 'emoji'; readonly record: Emoji; readonly active: boolean }

/*
 * ⚠️ **Both consequences measured** against `GET /emoji/packs`, the route the
 * apps read, on 2026-10-28: an inactive pack is absent with every emoji in
 * it, and inside an active pack an inactive emoji is absent.
 *
 * ⚠️ **A deactivated emoji keeps its shortcode** — measured, and said here,
 * because "deactivate it and reuse the name" is the obvious plan and fails.
 */
const TOGGLE_COPY = {
  pack: {
    off: {
      title: 'Deactivate this pack',
      confirm: 'Deactivate pack',
      effect:
        'The pack and every emoji in it disappear from the apps on their next catalog check, including emojis still marked Active. Nothing is deleted, and reactivating brings them back.',
    },
    on: {
      title: 'Reactivate this pack',
      confirm: 'Reactivate pack',
      effect: 'It returns to the apps with every emoji in it that is marked Active.',
    },
  },
  emoji: {
    off: {
      title: 'Deactivate this emoji',
      confirm: 'Deactivate emoji',
      effect:
        'It disappears from the apps on their next catalog check. It keeps its shortcode — no other emoji can use it while this one exists, active or not.',
    },
    on: {
      title: 'Reactivate this emoji',
      confirm: 'Reactivate emoji',
      effect: 'It returns to the apps, unless its pack is inactive.',
    },
  },
} as const

export function EmojiPacksPage() {
  const list = useEmojiPacksQuery()
  const version = useEmojiVersionQuery()
  const reorder = useReorderMutation()
  const setPackActive = useSetPackActiveMutation()
  const setEmojiActive = useSetEmojiActiveMutation()

  const [view, setView] = useState<Visibility>('all')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [toggle, setToggle] = useState<Toggle | null>(null)

  const packs = byOrder(list.data ?? [])
  const mayReorder = view === 'all'

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
    const name = record.name?.trim() || (kind === 'pack' ? 'Pack' : 'Emoji')
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
    if (kind === 'pack') setPackActive.mutate({ id: record.id, active }, options)
    else setEmojiActive.mutate({ id: record.id, active }, options)
  }

  const toggleCopy = toggle
    ? TOGGLE_COPY[toggle.kind][toggle.active ? 'on' : 'off']
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emoji packs"
        description="The emoji sets every app offers in chat. Changes reach the apps on their next catalog check — there is no draft."
        actions={
          <Button
            /* Waits for the list: a new pack is appended after the last one. */
            disabled={!list.isSuccess}
            onClick={() => setEditor({ kind: 'pack', pack: null })}
          >
            <Plus className="size-4" aria-hidden="true" />
            New pack
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="emoji-visibility">Show</Label>
          <Select value={view} onValueChange={(value) => setView(value as Visibility)}>
            <SelectTrigger id="emoji-visibility" className="w-full sm:w-44">
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
          <p className="text-caption text-foreground-muted">
            {view === 'all'
              ? 'Every pack and emoji, inactive ones included.'
              : 'Filtered in the panel. Reordering is available on All emojis.'}
          </p>
        </div>

        {version.data ? (
          <p className="text-caption text-foreground-muted">
            Emoji version{' '}
            <span className="tabular font-medium text-foreground">
              {version.data.emojiVersion}
            </span>
          </p>
        ) : null}
      </div>

      {list.isPending ? (
        <LoadingState variant="cards" rows={2} />
      ) : list.isError ? (
        <ErrorState
          title="The emoji packs could not be loaded"
          description={
            isAppError(list.error)
              ? list.error.message
              : 'The emoji packs could not be loaded.'
          }
          onRetry={() => void list.refetch()}
        />
      ) : packs.length === 0 ? (
        <EmptyState
          title="No emoji packs yet"
          description="The apps have no emojis to offer. Create a pack, then add its emojis."
          action={
            <Button onClick={() => setEditor({ kind: 'pack', pack: null })}>
              Create the first pack
            </Button>
          }
        />
      ) : (
        <ol className="space-y-4" aria-label="Emoji packs">
          {packs.map((pack, index) => (
            <PackSection
              key={pack.id}
              pack={pack}
              view={view}
              mayReorder={mayReorder}
              busy={reorder.isPending}
              first={index === 0}
              last={index === packs.length - 1}
              onMovePack={(direction) =>
                move('packs', packs, pack.id, direction, pack.name || 'Pack')
              }
              onMoveEmoji={(siblings, emoji, direction) =>
                move('emojis', siblings, emoji.id, direction, emoji.name || 'Emoji')
              }
              onAddEmoji={() => setEditor({ kind: 'emoji', pack, emoji: null })}
              onAddSeveral={() => setEditor({ kind: 'bulk', pack })}
              onEditPack={() => setEditor({ kind: 'pack', pack })}
              onTogglePack={() =>
                setToggle({ kind: 'pack', record: pack, active: !isActive(pack) })
              }
              onEditEmoji={(emoji) => setEditor({ kind: 'emoji', pack, emoji })}
              onToggleEmoji={(emoji) =>
                setToggle({ kind: 'emoji', record: emoji, active: !isActive(emoji) })
              }
            />
          ))}
        </ol>
      )}

      {/* Keyed on the record, so switching rows re-seeds the form. */}
      {editor?.kind === 'pack' ? (
        <PackEditorDialog
          key={editor.pack?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          pack={editor.pack}
          packs={packs}
        />
      ) : null}

      {editor?.kind === 'emoji' ? (
        <EmojiEditorDialog
          key={editor.emoji?.id ?? `new-${editor.pack.id}`}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          pack={editor.pack}
          emoji={editor.emoji}
          packs={packs}
        />
      ) : null}

      {editor?.kind === 'bulk' ? (
        <BulkEmojiDialog
          key={`bulk-${editor.pack.id}`}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          pack={editor.pack}
          packs={packs}
        />
      ) : null}

      <ConfirmActionDialog
        open={toggle !== null}
        onOpenChange={(open) => !open && setToggle(null)}
        title={toggleCopy?.title ?? ''}
        target={toggle?.record.name ?? ''}
        effect={toggleCopy?.effect ?? ''}
        severity={
          toggle?.active ? 'info' : toggle?.kind === 'pack' ? 'critical' : 'warning'
        }
        confirmLabel={toggleCopy?.confirm ?? ''}
        reason="none"
        loading={setPackActive.isPending || setEmojiActive.isPending}
        onConfirm={confirmToggle}
      />
    </div>
  )
}

function PackSection({
  pack,
  view,
  mayReorder,
  busy,
  first,
  last,
  onMovePack,
  onMoveEmoji,
  onAddEmoji,
  onAddSeveral,
  onEditPack,
  onTogglePack,
  onEditEmoji,
  onToggleEmoji,
}: {
  pack: EmojiPack
  view: Visibility
  mayReorder: boolean
  busy: boolean
  first: boolean
  last: boolean
  onMovePack: (direction: Direction) => void
  onMoveEmoji: (siblings: readonly Emoji[], emoji: Emoji, direction: Direction) => void
  onAddEmoji: () => void
  onAddSeveral: () => void
  onEditPack: () => void
  onTogglePack: () => void
  onEditEmoji: (emoji: Emoji) => void
  onToggleEmoji: (emoji: Emoji) => void
}) {
  const name = pack.name?.trim() || 'Untitled pack'
  const all = byOrder(pack.emojis ?? [])
  const shown = all.filter((emoji) => visible(emoji, view))
  const headingId = `emoji-pack-${pack.id}`

  return (
    <li
      className={cn(
        'rounded-lg border border-border bg-surface',
        !isActive(pack) && 'border-dashed',
      )}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <CatalogAsset value={pack.coverUrl} className="size-10" />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 id={headingId} className="min-w-0 font-semibold wrap-anywhere">
              {name}
            </h2>
            <ActiveBadge active={isActive(pack)} />
            {pack.isPremium === true ? (
              <Badge className="w-fit bg-info-soft text-info-foreground">Premium</Badge>
            ) : null}
            <span className="text-caption text-foreground-muted">
              {all.length === 1 ? '1 emoji' : `${formatCount(all.length)} emojis`}
            </span>
          </div>
        </div>
        <span className="flex items-center gap-1">
          {mayReorder ? (
            <MoveButtons
              name={name}
              first={first}
              last={last}
              busy={busy}
              onMove={onMovePack}
            />
          ) : null}
          <RowMenu label={`Actions for ${name}`}>
            <DropdownMenuItem onSelect={onAddEmoji}>Add an emoji</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddSeveral}>Add several</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEditPack}>Edit pack</DropdownMenuItem>
            <DropdownMenuItem onSelect={onTogglePack}>
              {isActive(pack) ? 'Deactivate' : 'Reactivate'}
            </DropdownMenuItem>
          </RowMenu>
        </span>
      </div>

      {!isActive(pack) ? (
        <p className="border-b border-border px-4 py-2 text-caption text-foreground-muted">
          This pack is inactive, so none of its emojis are shown in the apps.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="px-4 py-4 text-body text-foreground-muted">
          {all.length === 0
            ? 'No emojis in this pack yet.'
            : `No ${view === 'active' ? 'active' : 'inactive'} emojis in this pack.`}
        </p>
      ) : (
        <ol className="divide-y divide-border" aria-label={`Emojis in ${name}`}>
          {shown.map((emoji, index) => (
            <EmojiRow
              key={emoji.id}
              emoji={emoji}
              mayReorder={mayReorder}
              busy={busy}
              first={index === 0}
              last={index === shown.length - 1}
              onMove={(direction) => onMoveEmoji(all, emoji, direction)}
              onEdit={() => onEditEmoji(emoji)}
              onToggle={() => onToggleEmoji(emoji)}
            />
          ))}
        </ol>
      )}
    </li>
  )
}

function EmojiRow({
  emoji,
  mayReorder,
  busy,
  first,
  last,
  onMove,
  onEdit,
  onToggle,
}: {
  emoji: Emoji
  mayReorder: boolean
  busy: boolean
  first: boolean
  last: boolean
  onMove: (direction: Direction) => void
  onEdit: () => void
  onToggle: () => void
}) {
  const [focused, setFocused] = useState(false)
  const name = emoji.name?.trim() || 'Untitled emoji'

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <CatalogAsset value={emoji.fileUrl} active={focused} className="size-11" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 font-medium wrap-anywhere" title={name}>
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-caption text-foreground-muted">
            {emoji.shortcode || '—'}
          </code>
          <span className="text-caption text-foreground-muted">
            {emoji.type === 'STATIC'
              ? 'Static'
              : emoji.type === 'ANIMATED'
                ? 'Animated'
                : emoji.type || ''}
          </span>
          <ActiveBadge active={isActive(emoji)} />
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
      <RowMenu label={`Actions for ${name}`}>
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          {isActive(emoji) ? 'Deactivate' : 'Reactivate'}
        </DropdownMenuItem>
      </RowMenu>
    </li>
  )
}
