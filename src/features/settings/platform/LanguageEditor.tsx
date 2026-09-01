import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { LANGUAGE_CODE_MIN_LENGTH } from '@/types/settings'

import { languageName } from './languageNames'

/**
 * Supported languages, and which one clients fall back to.
 *
 * The default is a `Select` populated **from the supported list**, so the
 * server's cross-field rule — *"Default language 'zz' must be included in
 * supported languages"* — is structurally unreachable rather than validated
 * after the fact. That rule is the one rejection this API returns with no
 * field prefix and no field name (system_settings_plan.md §3.2), so it is the
 * worst one to have to explain to an operator; the cheapest fix is to make it
 * impossible to trigger.
 *
 * The remaining route to it is removing the chip that is currently default,
 * which is refused inline.
 *
 * The server enforces only a 2-character minimum — there is no ISO check, and
 * `"english"` was accepted. The names below are a display convenience, not a
 * whitelist.
 */

export interface LanguageEditorProps {
  supported: readonly string[]
  defaultLanguage: string
  onChange: (next: { supported: readonly string[]; defaultLanguage: string }) => void
  disabled?: boolean
}

export function LanguageEditor({
  supported,
  defaultLanguage,
  onChange,
  disabled,
}: LanguageEditorProps) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const normalised = draft.trim().toLowerCase()

  function add() {
    if (normalised.length < LANGUAGE_CODE_MIN_LENGTH) {
      setProblem(`Use at least ${LANGUAGE_CODE_MIN_LENGTH} characters, for example en.`)
      return
    }
    if (supported.includes(normalised)) {
      setProblem(`${normalised} is already supported.`)
      return
    }

    onChange({ supported: [...supported, normalised], defaultLanguage })
    setDraft('')
    setProblem(null)
  }

  function remove(code: string) {
    if (code === defaultLanguage) {
      /*
       * The only remaining path to the server's cross-field rejection. Refusing
       * it here means that error can never be produced by this form.
       */
      setProblem(
        `${code} is the default language. Choose a different default before removing it.`,
      )
      return
    }
    if (supported.length === 1) {
      setProblem('At least one language must be supported.')
      return
    }

    onChange({
      supported: supported.filter((entry) => entry !== code),
      defaultLanguage,
    })
    setProblem(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={draft}
            disabled={disabled ?? false}
            onChange={(event) => {
              setDraft(event.target.value)
              setProblem(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              // Enter adds a language; it must not submit the surrounding form.
              event.preventDefault()
              add()
            }}
            placeholder="es"
            aria-label="Add a language code"
            autoComplete="off"
            spellCheck={false}
            className="max-w-40"
          />
          <Button
            type="button"
            variant="outline"
            onClick={add}
            disabled={disabled ?? false}
          >
            <Plus />
            Add
          </Button>
        </div>

        {problem ? (
          <p role="alert" className="text-caption text-danger">
            {problem}
          </p>
        ) : null}

        <ul className="flex flex-wrap gap-2">
          {supported.map((code) => {
            const isDefault = code === defaultLanguage
            const name = languageName(code)
            return (
              <li key={code}>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-sm border py-1 pr-1 pl-2.5 text-caption',
                    isDefault
                      ? 'border-primary bg-primary-soft text-primary-700'
                      : 'border-border bg-surface-muted',
                  )}
                >
                  <span className="font-medium">{code}</span>
                  {name ? (
                    <span className="text-foreground-muted">· {name}</span>
                  ) : null}
                  {isDefault ? <span className="text-overline">DEFAULT</span> : null}
                  <button
                    type="button"
                    onClick={() => remove(code)}
                    disabled={disabled ?? false}
                    aria-label={`Remove ${code}`}
                    className={cn(
                      'rounded-sm p-0.5 text-foreground-muted transition-colors',
                      'hover:bg-danger-soft hover:text-danger-foreground',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      'disabled:pointer-events-none disabled:opacity-50',
                    )}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="max-w-xs space-y-2">
        <label htmlFor="defaultLanguage" className="text-body-strong block">
          Default language
        </label>
        <Select
          value={defaultLanguage}
          disabled={disabled ?? false}
          onValueChange={(value) => onChange({ supported, defaultLanguage: value })}
        >
          <SelectTrigger id="defaultLanguage" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Only supported languages are offered — that is the whole point. */}
            {supported.map((code) => (
              <SelectItem key={code} value={code}>
                {languageName(code) ? `${code} · ${languageName(code)}` : code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-caption text-foreground-muted">
          Used when a client asks for a language that is not supported.
        </p>
      </div>
    </div>
  )
}
