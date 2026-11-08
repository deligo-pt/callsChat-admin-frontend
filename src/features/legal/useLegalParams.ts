import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import { isLegalDocumentType, type LegalDocumentType } from '@/types/legal'

/**
 * The overview's state, owned by the URL (plan.md LG1): `?tab=drafts|history`
 * and `?type=PRIVACY_POLICY`. Unknown values fall back rather than erroring.
 */

export type LegalTab = 'drafts' | 'history'

export function readLegalTab(params: URLSearchParams): LegalTab {
  return params.get('tab') === 'history' ? 'history' : 'drafts'
}

export function readLegalType(params: URLSearchParams): LegalDocumentType | undefined {
  const raw = params.get('type')?.trim().toUpperCase()
  return isLegalDocumentType(raw) ? raw : undefined
}

export function useLegalParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = readLegalTab(searchParams)
  const type = readLegalType(searchParams)

  const update = useCallback(
    (next: { tab?: LegalTab; type?: LegalDocumentType | null }) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (next.tab) {
            if (next.tab === 'drafts') params.delete('tab')
            else params.set('tab', next.tab)
          }
          if (next.type === null) params.delete('type')
          else if (next.type) params.set('type', next.type)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return {
    tab,
    type,
    setTab: (value: LegalTab) => update({ tab: value }),
    setType: (value: LegalDocumentType | null) => update({ type: value }),
    /** Opens the history of one type — the cards' link. */
    showHistory: (value: LegalDocumentType) => update({ tab: 'history', type: value }),
  }
}
