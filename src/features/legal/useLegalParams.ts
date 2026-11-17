import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import {
  isLegalDocumentType,
  type LegalAppType,
  type LegalDocumentType,
} from '@/types/legal'

/**
 * The overview's state, owned by the URL (plan.md LG1, LB2): `?app=business`,
 * `?tab=drafts|history` and `?type=PRIVACY_POLICY`. Unknown values fall back
 * rather than erroring — an unknown app means Personal, the default.
 */

export type LegalTab = 'drafts' | 'history'

export function readLegalTab(params: URLSearchParams): LegalTab {
  return params.get('tab') === 'history' ? 'history' : 'drafts'
}

export function readLegalApp(params: URLSearchParams): LegalAppType {
  return params.get('app')?.trim().toUpperCase() === 'BUSINESS'
    ? 'BUSINESS'
    : 'PERSONAL'
}

export function readLegalType(params: URLSearchParams): LegalDocumentType | undefined {
  const raw = params.get('type')?.trim().toUpperCase()
  return isLegalDocumentType(raw) ? raw : undefined
}

export function useLegalParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const app = readLegalApp(searchParams)
  const tab = readLegalTab(searchParams)
  const type = readLegalType(searchParams)

  const update = useCallback(
    (next: { app?: LegalAppType; tab?: LegalTab; type?: LegalDocumentType | null }) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (next.app === 'BUSINESS') params.set('app', 'business')
          else if (next.app === 'PERSONAL') params.delete('app')
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
    app,
    tab,
    type,
    setApp: (value: LegalAppType) => update({ app: value }),
    setTab: (value: LegalTab) => update({ tab: value }),
    setType: (value: LegalDocumentType | null) => update({ type: value }),
    /** Opens the history of one type — the cards' link. */
    showHistory: (value: LegalDocumentType) => update({ tab: 'history', type: value }),
  }
}
