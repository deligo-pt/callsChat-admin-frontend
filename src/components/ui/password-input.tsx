import { Eye, EyeOff } from 'lucide-react'
import { useId, useState, type ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

export type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type'>

/**
 * A password field with a show/hide toggle.
 *
 * Accessibility notes, because a naive toggle gets all of these wrong:
 *
 *   - the button is `type="button"`, so it cannot submit the form;
 *   - `aria-pressed` conveys the current state, and the label changes with it,
 *     so a screen-reader user knows whether the password is currently exposed;
 *   - `tabIndex={-1}` keeps it out of the tab order — tabbing from the password
 *     field should reach the submit button, not an icon;
 *   - a live region announces the change, since visually it is obvious and
 *     otherwise it would be silent.
 *
 * The field starts masked and never persists the revealed state: a password
 * left visible after a page change is exactly the shoulder-surfing risk the
 * masking exists to prevent.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const statusId = useId()

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        // Leave room for the toggle so a long password never runs under it.
        className={cn('pr-10', className)}
      />

      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-describedby={statusId}
        tabIndex={-1}
        className={cn(
          'absolute top-1/2 right-1 -translate-y-1/2 rounded-sm p-1.5',
          'text-foreground-subtle transition-colors hover:text-foreground',
        )}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>

      <span id={statusId} className="sr-only" role="status">
        {visible ? 'Password is visible' : 'Password is hidden'}
      </span>
    </div>
  )
}
