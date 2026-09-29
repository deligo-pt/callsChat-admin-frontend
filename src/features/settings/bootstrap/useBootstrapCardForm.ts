import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
} from 'react-hook-form'
import type { z } from 'zod'

import { applyServerFieldErrors } from '@/api/formErrors'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import type { BootstrapConfig, UpdateBootstrapPayload } from '@/types/bootstrap'

import { useUpdateBootstrapMutation } from './useBootstrap'

/**
 * One editable bootstrap card, wired the way every settings form in this panel
 * is wired (plan.md §5.3).
 *
 * Four cards need the identical arrangement, and re-deriving it four times is
 * how one of them quietly loses `keepDirtyValues` and starts eating
 * keystrokes. The two subtleties it carries forward from `GeneralTab`:
 *
 * - **Re-seed only when the record actually changed**, tracked by
 *   `configVersion`. Without it the effect re-seeds on every background
 *   refetch, and an operator typing while a save settles has their keystrokes
 *   reverted to the server's values.
 * - **`keepDirtyValues`**, so a refetch landing mid-sentence takes the
 *   server's value for every field the operator has *not* touched and leaves
 *   the ones they have.
 *
 * ⚠️ `configVersion` rather than `updatedAt` as the seed marker, unlike the
 * settings forms: this endpoint increments it on **every** write including a
 * no-op (§3.5), so it moves whenever the record does — and two writes inside
 * the same second would share an `updatedAt`.
 */
export interface BootstrapCardForm<TValues extends FieldValues> {
  readonly form: ReturnType<typeof useForm<TValues>>
  readonly isDirty: boolean
  readonly isSaving: boolean
  readonly error: unknown
  readonly savedMessage: string | null
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  readonly onDiscard: () => void
}

export function useBootstrapCardForm<TValues extends FieldValues>(options: {
  config: BootstrapConfig
  schema: z.ZodType<TValues>
  /** Values for the record as the server currently holds it. */
  toValues: (config: BootstrapConfig) => TValues
  buildPayload: (values: TValues) => UpdateBootstrapPayload
  /** Field names this card renders, so a rejection naming another is ignored. */
  fields: readonly string[]
  savedMessage?: string
  canEdit: boolean
}): BootstrapCardForm<TValues> {
  type Values = TValues

  const { config, schema, toValues, buildPayload, fields, canEdit } = options
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const form = useForm<Values>({
    /*
     * Cast through `unknown`: `zodResolver` is typed against a concrete schema
     * and this hook is generic over the values, so the two cannot be related
     * without naming every card's schema here. The schema and the values are
     * tied together by the parameter type above, which is where the safety
     * actually lives.
     */
    resolver: zodResolver(schema as never) as unknown as Resolver<Values>,
    defaultValues: toValues(config) as DefaultValues<Values>,
  })

  /** The revision the form currently reflects. */
  const seededVersion = useRef<number>(config.configVersion)

  const seed = useCallback(
    (record: BootstrapConfig) => {
      seededVersion.current = record.configVersion
      form.reset(toValues(record) as never, { keepDirtyValues: true })
    },
    [form, toValues],
  )

  useEffect(() => {
    if (seededVersion.current === config.configVersion) return
    seed(config)
  }, [config, seed])

  const mutation = useUpdateBootstrapMutation(config.platform, (saved) => {
    /* Re-seed from the SERVER's record, so its normalisation is what shows. */
    seed(saved)
    setSavedMessage(
      options.savedMessage ?? 'Saved. Mobile clients pick this up on their next start.',
    )
  })

  const isDirty = form.formState.isDirty
  useUnsavedChangesGuard(isDirty && canEdit)

  const onSubmit = form.handleSubmit(async (values) => {
    setSavedMessage(null)
    try {
      await mutation.mutateAsync(buildPayload(values as Values))
    } catch (error) {
      /*
       * Attribute what the server named. Anything left over renders in the
       * card-level alert through `mutation.error`, so nothing is swallowed —
       * and on this endpoint that matters, because a rejection naming a field
       * the card does not render would otherwise vanish entirely.
       */
      applyServerFieldErrors(error, form.setError, fields)
    }
  })

  const onDiscard = useCallback(() => {
    setSavedMessage(null)
    form.reset(toValues(config) as never)
  }, [form, toValues, config])

  return {
    form,
    isDirty,
    isSaving: mutation.isPending,
    error: mutation.error,
    savedMessage,
    onSubmit,
    onDiscard,
  }
}
