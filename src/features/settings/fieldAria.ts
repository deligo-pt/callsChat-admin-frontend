/**
 * ARIA wiring for a settings field.
 *
 * Pairs with `SettingsField`, which renders the hint and error nodes at the
 * ids this points at. Keeping the convention in one function means no caller
 * has to remember it, and a control can never end up describing an element
 * that was not rendered.
 */
export function fieldAria(id: string, hasHint: boolean, hasError: boolean) {
  const describedBy = [hasError ? `${id}-error` : null, hasHint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ')

  return {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(hasError ? { 'aria-invalid': true } : {}),
  }
}
