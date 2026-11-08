import type { LegalDocument } from '@/types/legal'

import { compareVersions } from './legalForm'

/**
 * What changed between two versions of a policy, by section (plan.md LG5).
 *
 * Sections are matched by heading text, not by id — ids collide on duplicate
 * headings (O5) and a renumbered heading changes both anyway. A heading that
 * appears twice is matched in order. This is a reading aid for reviewers, not
 * a legal redline: wording changes inside a section are reported as "changed",
 * not shown word by word.
 */

export interface VersionChanges {
  readonly against: LegalDocument
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: readonly string[]
  readonly introChanged: boolean
  readonly unchanged: number
}

function grouped(doc: LegalDocument): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const section of doc.sections) {
    const list = map.get(section.heading) ?? []
    list.push(section.body.join('\n\n'))
    map.set(section.heading, list)
  }
  return map
}

export function diffVersions(
  doc: LegalDocument,
  against: LegalDocument,
): VersionChanges {
  const now = grouped(doc)
  const before = grouped(against)
  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []
  let unchanged = 0

  for (const [heading, bodies] of now) {
    const old = before.get(heading) ?? []
    bodies.forEach((body, index) => {
      const previous = old[index]
      if (previous === undefined) added.push(heading)
      else if (previous !== body) changed.push(heading)
      else unchanged += 1
    })
  }
  for (const [heading, bodies] of before) {
    const count = now.get(heading)?.length ?? 0
    for (let index = count; index < bodies.length; index += 1) removed.push(heading)
  }

  return {
    against,
    added,
    removed,
    changed,
    introChanged: (doc.intro ?? '') !== (against.intro ?? ''),
    unchanged,
  }
}

/** The version of the same type just below this one, in any status but DRAFT. */
export function previousVersion(
  doc: LegalDocument,
  docs: readonly LegalDocument[],
): LegalDocument | undefined {
  return docs
    .filter(
      (row) =>
        row.documentType === doc.documentType &&
        row.id !== doc.id &&
        row.status !== 'DRAFT' &&
        compareVersions(row.version, doc.version) < 0,
    )
    .sort((a, b) => compareVersions(a.version, b.version))
    .at(-1)
}
