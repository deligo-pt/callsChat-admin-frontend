import { Construction } from 'lucide-react'

import { PageHeader } from '@/components/display'
import { EmptyState } from '@/components/feedback'

export interface ModulePlaceholderProps {
  module: string
  /** The plan.md phase that will implement this module. */
  phase: number
}

/**
 * Stand-in for a module not yet built.
 *
 * Exists so the Phase 1 shell can be navigated and its responsive behaviour
 * verified across all twelve nav entries. Each is replaced by its real feature
 * in the phase named here.
 */
export function ModulePlaceholder({ module, phase }: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={module}
        description={
          phase > 0
            ? `This module is delivered in Phase ${phase}.`
            : 'The page you requested does not exist.'
        }
        breadcrumbs={[{ label: 'Admin', to: '/' }, { label: module }]}
      />

      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          title={phase > 0 ? 'Not built yet' : 'Page not found'}
          description={
            phase > 0
              ? `The application shell, design system and data components are in place. Phase ${phase} adds this module's screens against the mock API.`
              : 'Check the address, or pick a module from the navigation.'
          }
          action={
            phase > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-caption text-foreground-subtle">
                <Construction className="size-3.5" /> Phase {phase}
              </span>
            ) : null
          }
        />
      </div>
    </div>
  )
}
