import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'

export interface DetailTab {
  readonly value: string
  readonly label: string
  /** Optional count badge, e.g. number of open reports. */
  readonly count?: number
  readonly content: ReactNode
}

export interface DetailTabsProps {
  tabs: readonly DetailTab[]
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  className?: string
}

/**
 * Detail-page tab set.
 *
 * plan.md §6.2: below md the tab list becomes a horizontally scrollable pill
 * row rather than wrapping or shrinking — the row scrolls on its own axis so
 * the page never gains a horizontal scrollbar (§6.3).
 */
export function DetailTabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
  className,
}: DetailTabsProps) {
  const firstTab = tabs[0]
  const initial = defaultValue ?? firstTab?.value
  const scroller = useRef<HTMLDivElement>(null)
  const [moreRight, setMoreRight] = useState(false)
  const [moreLeft, setMoreLeft] = useState(false)
  const layoutKey = tabs.map((tab) => `${tab.label}:${tab.count ?? ''}`).join('|')

  /* Which edges hide tabs — they get a fade, so a cut-off label reads as "scroll". */
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      setMoreLeft(el.scrollLeft > 1)
      setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [layoutKey])

  /*
   * Keep the selected tab on screen. Scrolls the tab row only — never the page,
   * which `scrollIntoView` would also do.
   */
  useEffect(() => {
    const el = scroller.current
    const active = el?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!el || !active) return
    const box = el.getBoundingClientRect()
    const tab = active.getBoundingClientRect()
    const pad = 24
    if (tab.left < box.left + pad) el.scrollLeft -= box.left + pad - tab.left
    else if (tab.right > box.right - pad) el.scrollLeft += tab.right - (box.right - pad)
    // Re-run when labels or counts change: counts arrive later and widen tabs.
  }, [value, layoutKey])

  return (
    <Tabs
      {...(value === undefined && initial ? { defaultValue: initial } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      className={cn('w-full gap-6', className)}
    >
      <div
        ref={scroller}
        className={cn(
          '-mx-1 scroll-x border-b border-border px-1 pb-px',
          moreLeft && moreRight
            ? 'mask-[linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]'
            : moreRight
              ? 'mask-[linear-gradient(to_right,black_calc(100%-2rem),transparent)]'
              : moreLeft
                ? 'mask-[linear-gradient(to_right,transparent,black_2rem)]'
                : undefined,
        )}
      >
        <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-none bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                /*
                 * `flex-auto shrink-0`, not the primitive's `flex-1`: a zero
                 * basis made the `w-max` list measure itself too narrow, and
                 * at tablet widths the labels ran into each other. Sized by
                 * their text, they never overlap and still fill the row.
                 */
                'touch-target flex-auto shrink-0 rounded-md px-3 py-2 text-body text-foreground-muted',
                'data-[state=active]:bg-primary-soft data-[state=active]:text-primary-700',
                'data-[state=active]:shadow-none',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span className="ml-1.5 rounded-full bg-neutral-soft px-1.5 py-0.5 text-overline text-neutral-foreground">
                  {tab.count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
