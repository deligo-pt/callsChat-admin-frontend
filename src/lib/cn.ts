import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The project's custom type scale (`--text-*` in `styles/tokens.css`).
 *
 * These MUST be declared to tailwind-merge. Its default configuration knows
 * Tailwind's own sizes (`text-sm`, `text-lg`, …) and treats every other
 * `text-*` class as a COLOUR — so `text-caption` and `text-primary-foreground`
 * landed in the same conflict group and merging kept only the last one.
 *
 * That silently stripped the text colour from every small button: the "Add
 * user" button rendered near-black on blue, because `size="sm"` appends
 * `text-caption` after the variant's `text-primary-foreground`. The same
 * collision ran the other way on labels written as `text-caption
 * text-foreground-muted`, where the colour won and the 12px size was dropped.
 *
 * Neither produced an error — the class simply vanished from the output.
 */
const FONT_SIZES = [
  'overline',
  'caption',
  'body',
  'display',
  'h1',
  'h2',
  'h3',
  'h4',
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
})

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier conflicting ones.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
