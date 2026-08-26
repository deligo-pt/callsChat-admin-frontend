import { describe, expect, it } from 'vitest'

import { cn } from './cn'

/**
 * The custom type scale must not collide with text colours.
 *
 * tailwind-merge treats an unrecognised `text-*` class as a colour. Until the
 * scale was declared to it, `text-caption` and `text-primary-foreground` were
 * the same conflict group, so merging them dropped one — silently, with no
 * error and no warning. That is what made the "Add user" button render dark
 * text on a blue fill.
 */
describe('cn', () => {
  it('keeps a custom font size AND a text colour together', () => {
    const result = cn('text-primary-foreground', 'text-caption')
    expect(result).toContain('text-primary-foreground')
    expect(result).toContain('text-caption')
  })

  it('keeps both regardless of order', () => {
    const result = cn('text-caption', 'text-foreground-muted')
    expect(result).toContain('text-caption')
    expect(result).toContain('text-foreground-muted')
  })

  it.each(['overline', 'caption', 'body', 'display', 'h1', 'h2', 'h3', 'h4'])(
    'treats text-%s as a size, not a colour',
    (size) => {
      expect(cn(`text-${size}`, 'text-danger')).toContain(`text-${size}`)
    },
  )

  it('still collapses two genuinely conflicting sizes', () => {
    // The last size must win; this is the behaviour the fix must not break.
    const result = cn('text-body', 'text-caption')
    expect(result).toContain('text-caption')
    expect(result).not.toContain('text-body')
  })

  it('still collapses two genuinely conflicting colours', () => {
    const result = cn('text-foreground-muted', 'text-danger')
    expect(result).toContain('text-danger')
    expect(result).not.toContain('text-foreground-muted')
  })
})
