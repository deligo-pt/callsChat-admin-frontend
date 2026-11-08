import type { LegalSection } from '@/types/legal'

/**
 * The backend's `legal-parser.ts`, as observed on staging (plan.md §1.8, LG2).
 *
 * This is a **copy of the server's behaviour, bugs included**, not a Markdown
 * renderer. The preview must show what the apps and website will receive:
 * - text before the first `## ` is the intro (a `# Title` line is dropped and
 *   is NOT used as the title);
 * - every `## ` line starts a section; its id is the heading lower-cased, with
 *   anything but letters, digits, spaces and hyphens removed, spaces → `-`;
 * - paragraphs split on blank lines; everything else — `###`, lists, `**`,
 *   links, inline HTML — stays as raw text inside the paragraph;
 * - `<script>`, `<iframe>` and `<object>` (with their content) are removed.
 *
 * Alongside the result it returns warnings: things that will look wrong to a
 * reader, so the author can fix them before saving.
 */

export type LegalWarningKind =
  | 'no-sections'
  | 'duplicate-heading'
  | 'empty-section'
  | 'empty-anchor'
  | 'title-line'
  | 'stripped-html'
  | 'raw-markdown'
  | 'too-short'

export interface LegalWarning {
  readonly kind: LegalWarningKind
  readonly message: string
}

export interface ParsedLegalMarkdown {
  readonly intro: string | null
  readonly sections: readonly LegalSection[]
  readonly warnings: readonly LegalWarning[]
  /** The Markdown as the server will store it (dangerous tags removed). */
  readonly sanitized: string
}

const DANGEROUS_BLOCK = /<(script|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const DANGEROUS_TAG = /<\/?(script|iframe|object)\b[^>]*>/gi

/** Server minimum for `contentMarkdown`. */
const MIN_LENGTH = 10

export function sanitizeLegalMarkdown(markdown: string): string {
  return markdown.replace(DANGEROUS_BLOCK, '').replace(DANGEROUS_TAG, '')
}

export function legalAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/* Syntax the website shows literally. Checked per line so code-like text in
   a sentence ("2 * 3") is not over-reported. */
const RAW_SYNTAX: readonly { pattern: RegExp; name: string }[] = [
  { pattern: /^#{3,6}\s/m, name: 'sub-headings (###)' },
  { pattern: /^\s*[-*+]\s+\S/m, name: 'bullet lists' },
  { pattern: /^\s*\d+[.)]\s+\S/m, name: 'numbered lists' },
  { pattern: /\*\*[^*\n]+\*\*|__[^_\n]+__/, name: 'bold' },
  { pattern: /\[[^\]\n]+\]\([^)\n]+\)/, name: 'links' },
  { pattern: /<\/?[a-z][^>\n]*>/i, name: 'HTML tags' },
  { pattern: /^>\s/m, name: 'quotes (>)' },
  { pattern: /^\|.*\|\s*$/m, name: 'tables' },
  { pattern: /`[^`\n]+`/, name: 'code' },
]

export function parseLegalMarkdown(markdown: string): ParsedLegalMarkdown {
  const warnings: LegalWarning[] = []
  const sanitized = sanitizeLegalMarkdown(markdown)
  if (sanitized !== markdown) {
    warnings.push({
      kind: 'stripped-html',
      message:
        'Script, iframe or object tags will be removed by the server, with everything inside them.',
    })
  }

  const before: string[] = []
  const raw: { heading: string; lines: string[] }[] = []
  let titleLine = false
  for (const line of sanitized.split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match?.[1]) raw.push({ heading: match[1], lines: [] })
    else if (raw.length > 0) raw.at(-1)?.lines.push(line)
    else if (/^#\s+/.test(line)) titleLine = true
    else before.push(line)
  }

  const intro = paragraphs(before.join('\n')).join('\n\n') || null
  const sections: LegalSection[] = raw.map((section) => ({
    id: legalAnchor(section.heading),
    heading: section.heading,
    body: paragraphs(section.lines.join('\n')),
  }))

  if (sanitized.trim().length < MIN_LENGTH) {
    warnings.push({
      kind: 'too-short',
      message: `The content must be at least ${MIN_LENGTH} characters.`,
    })
  }
  if (sections.length === 0 && sanitized.trim()) {
    warnings.push({
      kind: 'no-sections',
      message:
        'No "## " headings, so there are no sections or table of contents. Everything becomes the intro.',
    })
  }
  if (titleLine) {
    warnings.push({
      kind: 'title-line',
      message:
        'The "# " title line is dropped. The page title comes from the Title field.',
    })
  }

  const seen = new Map<string, string>()
  const duplicates = new Set<string>()
  for (const section of sections) {
    if (!section.id) {
      warnings.push({
        kind: 'empty-anchor',
        message: `"${section.heading}" has no letters or digits, so it gets no link.`,
      })
      continue
    }
    if (seen.has(section.id)) duplicates.add(section.heading)
    else seen.set(section.id, section.heading)
  }
  for (const heading of duplicates) {
    warnings.push({
      kind: 'duplicate-heading',
      message: `"${heading}" is used more than once. Links to it will all jump to the first one.`,
    })
  }

  const empty = sections.filter((section) => section.body.length === 0)
  if (empty.length > 0) {
    warnings.push({
      kind: 'empty-section',
      message: `${empty.length === 1 ? 'A section has' : `${empty.length} sections have`} a heading but no text: ${empty
        .map((section) => `"${section.heading}"`)
        .join(', ')}.`,
    })
  }

  const text = [intro ?? '', ...sections.flatMap((section) => section.body)].join('\n')
  const found = RAW_SYNTAX.filter(({ pattern }) => pattern.test(text)).map(
    ({ name }) => name,
  )
  if (found.length > 0) {
    warnings.push({
      kind: 'raw-markdown',
      message: `Shown as plain text, not formatted: ${found.join(', ')}. Only "## " headings and blank-line paragraphs are understood.`,
    })
  }

  return { intro, sections, warnings, sanitized }
}
