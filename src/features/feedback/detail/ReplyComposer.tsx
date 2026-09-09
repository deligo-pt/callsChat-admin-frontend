import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { formLevelMessage } from '@/api/formErrors'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUnsavedChangesGuard } from '@/lib/hooks/useUnsavedChangesGuard'
import { parseFieldErrors } from '@/types/common'
import type { Feedback } from '@/types/feedback'

import { useReplyMutation } from '../useFeedback'

/**
 * Answer the reporter — `POST /:id/reply` (feedback_management_plan.md §5.5).
 *
 * **The most consequential control in this module, and the plainest.** It is a
 * textarea and one button, because everything that could go wrong here is
 * about what the operator *sends*, not about how hard it is to send.
 *
 * Four rules, each a consequence of §1 rather than a style choice:
 *
 * 1. **The button says "Send reply", never "Save".** This publishes text to a
 *    named person's phone. "Save" would describe a draft, and there is no such
 *    thing on this route.
 * 2. **The consequence is stated every time, as a hint and not a banner.** A
 *    dismissible warning is read once and dismissed forever; a line of muted
 *    text under the button is present at the moment of the decision, every
 *    time, and costs nothing to an operator who already knows.
 * 3. **A non-empty draft blocks navigation.** Losing a half-written reply to a
 *    stray back-navigation is a small disaster, and the hook already exists.
 * 4. **Success invalidates the whole ticket rather than appending.** The reply
 *    route silently rewrites `adminResponse` to this message (§3.3) — a field
 *    rendered a few centimetres above this box, which the operator did not
 *    knowingly edit. An optimistic append would leave it showing the value the
 *    reply had just destroyed.
 */

/**
 * Client-side floor: a message with nothing in it.
 *
 * Deliberately *not* the ten-character floor `ConfirmActionDialog` imposes on a
 * status note. That note is an internal record justifying a decision, and ten
 * characters is a fair ask. This is a reply to a member of the public, and
 * "Fixed in 2.3.0." is a perfectly good one at fifteen — while "Yes." is a
 * perfectly good answer to a yes/no question at four. The server's own rule is
 * `body/message Message is required`, and the panel matches it rather than
 * inventing a stricter one it would have to defend.
 */
function isSendable(message: string): boolean {
  return message.trim().length > 0
}

export function ReplyComposer({ ticket }: { ticket: Feedback }) {
  const [message, setMessage] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const mutation = useReplyMutation(ticket.id)

  const draft = message.trim()
  useUnsavedChangesGuard(
    draft.length > 0,
    'This reply has not been sent. Leave without sending it?',
  )

  const reporter = ticket.user?.profile?.displayName ?? 'the reporter'
  const formError = mutation.error ? formLevelMessage(mutation.error) : null

  function send() {
    if (!isSendable(message)) {
      /*
       * The same wording the server uses, so an operator who somehow reaches
       * both sees one message rather than two descriptions of one rule.
       */
      setFieldError('Message is required.')
      return
    }

    setFieldError(null)
    mutation.mutate(draft, {
      onSuccess: () => {
        setMessage('')
        toast.success(`Your reply has been sent to ${reporter}.`)
      },
      onError: (error) => {
        /*
         * `body/message Message is required` maps onto the field; anything
         * else — a 403, a 500, a cross-field rejection with no `body/` prefix
         * — falls through to `formLevelMessage` below, because a failed send
         * with no explanation anywhere on screen is the worst outcome this
         * control has.
         *
         * `parseFieldErrors` directly rather than `applyServerFieldErrors`:
         * that helper takes a react-hook-form `setError`, and this composer is
         * one uncontrolled textarea with no form library behind it. Faking the
         * signature to reuse the wrapper would be worse than calling the
         * primitive both of them are built on.
         *
         * Only `message` is honoured, so a rejection naming a field this
         * control does not render cannot produce an error nobody can clear.
         */
        if (!isAppError(error)) return
        const named = parseFieldErrors(error.message).find(
          (entry) => entry.field === 'message',
        )
        if (named) setFieldError(named.message)
      },
    })
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="feedback-reply">Reply to {reporter}</Label>

      <Textarea
        id="feedback-reply"
        value={message}
        onChange={(event) => {
          setMessage(event.target.value)
          if (fieldError) setFieldError(null)
        }}
        rows={4}
        placeholder="Write your reply…"
        disabled={mutation.isPending}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? 'feedback-reply-error' : 'feedback-reply-hint'}
        className={fieldError ? 'border-danger' : undefined}
      />

      {fieldError ? (
        <p
          id="feedback-reply-error"
          className="text-caption text-danger-foreground"
          role="alert"
        >
          {fieldError}
        </p>
      ) : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/*
         * A statement of fact sized like a hint, not a warning banner — and it
         * is rendered before the button in the source so a screen reader
         * reaching the button has already heard it.
         */}
        <p id="feedback-reply-hint" className="text-caption text-foreground-muted">
          This is sent to {reporter} and appears in their app. It cannot be edited or
          withdrawn.
        </p>

        <Button
          type="button"
          onClick={send}
          disabled={mutation.isPending || !isSendable(message)}
          className="w-full sm:w-auto"
        >
          {mutation.isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </div>
  )
}
