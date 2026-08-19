import type { ReactNode } from 'react'

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

  return (
    <Tabs
      {...(value === undefined && initial ? { defaultValue: initial } : {})}
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      className={cn('w-full gap-6', className)}
    >
      <div className="-mx-1 scroll-x border-b border-border px-1 pb-px">
        <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-none bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'touch-target rounded-md px-3 py-2 text-body text-foreground-muted',
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
