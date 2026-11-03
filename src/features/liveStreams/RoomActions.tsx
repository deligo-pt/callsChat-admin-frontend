import { AlertTriangle, MessageSquareX, Power, ShieldAlert } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import { ConfirmActionDialog, MIN_REASON_LENGTH } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  hostName,
  VIOLATION_CODES,
  type LiveRoomDetail,
  type ViolationCode,
} from '@/types/liveRooms'

import { VIOLATION_LABELS } from './labels'
import { useLiveWrite } from './useLiveModeration'

/**
 * The room's moderation actions (plan.md Live §5.3, phase L3).
 *
 * Shown only on a room that is still on air (Live or Paused) and only with
 * `live.moderate` — the page decides both. Each dialog is mounted fresh when
 * opened, so nothing typed for one room or one action leaks into the next.
 */

type Room = LiveRoomDetail['room']
type Open = 'warn' | 'lockdown' | 'purge' | 'terminate' | null

function roomTarget(room: Room): string {
  return `${room.title.trim() || 'Untitled stream'} — hosted by ${hostName(room.host)}`
}

export function RoomActions({ room }: { room: Room }) {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)

  return (
    <>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Moderation actions"
      >
        <Button variant="outline" size="sm" onClick={() => setOpen('warn')}>
          <AlertTriangle /> Warn
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen('lockdown')}>
          <ShieldAlert /> Lockdown
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen('purge')}>
          <MessageSquareX /> Purge chat
        </Button>
        <Button variant="danger" size="sm" onClick={() => setOpen('terminate')}>
          <Power /> Terminate
        </Button>
      </div>

      {open === 'warn' ? <WarnDialog room={room} onClose={close} /> : null}
      {open === 'lockdown' ? <LockdownDialog room={room} onClose={close} /> : null}
      {open === 'purge' ? <PurgeDialog room={room} onClose={close} /> : null}
      {open === 'terminate' ? <TerminateDialog room={room} onClose={close} /> : null}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Shared fields
 * ------------------------------------------------------------------ */

function NotesField({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  hint: string
}) {
  const id = useId()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        Admin notes{' '}
        <span className="font-normal text-foreground-muted">(optional)</span>
      </Label>
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-caption text-foreground-muted">
        {hint}
      </p>
    </div>
  )
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
  control = 'checkbox',
}: {
  id: string
  label: string
  description: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  control?: 'checkbox' | 'switch'
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      {control === 'switch' ? (
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={`${id}-desc`}
          className="mt-0.5"
        />
      ) : (
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onChange(next === true)}
          aria-describedby={`${id}-desc`}
          className="mt-0.5"
        />
      )}
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p id={`${id}-desc`} className="text-caption text-foreground-muted">
          {description}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Warn
 * ------------------------------------------------------------------ */

function WarnDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const write = useLiveWrite()
  const violationId = useId()
  const messageId = useId()
  const [violation, setViolation] = useState<ViolationCode>('COMMUNITY_GUIDELINES')
  const [message, setMessage] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState(false)

  const text = message.trim()
  const tooShort = text.length < MIN_REASON_LENGTH

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Warn the host"
      target={roomTarget(room)}
      effect="A warning banner appears on the host's screen and on the broadcast straight away. The stream keeps running. The warning is recorded in this room's moderation log."
      severity="warning"
      reason="none"
      confirmLabel="Send the warning"
      confirmDisabled={tooShort}
      loading={write.isPending}
      fields={
        <>
          <div className="space-y-2">
            <Label htmlFor={violationId}>
              Violation <span className="text-danger">*</span>
            </Label>
            <Select
              value={violation}
              onValueChange={(value) => setViolation(value as ViolationCode)}
            >
              <SelectTrigger id={violationId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIOLATION_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {VIOLATION_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={messageId}>
              Message the host sees <span className="text-danger">*</span>
            </Label>
            <Textarea
              id={messageId}
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onBlur={() => message.length > 0 && setTouched(true)}
              placeholder="Official warning: please keep the conversation within the community guidelines."
              aria-required="true"
              aria-invalid={(touched && tooShort) || undefined}
              aria-describedby={`${messageId}-hint`}
            />
            <p
              id={`${messageId}-hint`}
              className={
                touched && tooShort
                  ? 'text-caption text-danger-foreground'
                  : 'text-caption text-foreground-muted'
              }
              role={touched && tooShort ? 'alert' : undefined}
            >
              At least {MIN_REASON_LENGTH} characters. Shown to the host and everyone
              watching — write it for them.
            </p>
          </div>
          <NotesField
            value={notes}
            onChange={setNotes}
            hint="Only admins see this, in the moderation log."
          />
        </>
      }
      onConfirm={() =>
        write.mutate(
          {
            kind: 'warn',
            roomId: room.id,
            payload: { message: text, violationCode: violation, adminNotes: notes },
          },
          { onSuccess: onClose },
        )
      }
    />
  )
}

/* ------------------------------------------------------------------ *
 * Lockdown
 * ------------------------------------------------------------------ */

function LockdownDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const write = useLiveWrite()
  const id = useId()
  const [muteAllStage, setMute] = useState(true)
  const [disableChat, setChat] = useState(true)
  const [disableGifts, setGifts] = useState(true)
  const nothing = !muteAllStage && !disableChat && !disableGifts

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Lock down the room"
      target={roomTarget(room)}
      effect="Applied at once to everyone in the room. The stream keeps running. Speakers can be unmuted one by one from the stage afterwards, but chat and gifts cannot be turned back on from the panel — they stay off until the stream ends."
      severity="critical"
      confirmLabel="Apply the lockdown"
      confirmDisabled={nothing}
      loading={write.isPending}
      fields={
        <fieldset className="space-y-2">
          <legend className="mb-2 text-body font-medium">What to switch off</legend>
          <Toggle
            id={`${id}-mute`}
            label="Mute the whole stage"
            description="Every speaker's microphone is muted, the host's included."
            checked={muteAllStage}
            onChange={setMute}
          />
          <Toggle
            id={`${id}-chat`}
            label="Turn off chat"
            description="Nobody in the room can send chat messages."
            checked={disableChat}
            onChange={setChat}
          />
          <Toggle
            id={`${id}-gifts`}
            label="Turn off gifts"
            description="Nobody in the room can send gifts."
            checked={disableGifts}
            onChange={setGifts}
          />
          {nothing ? (
            <p role="alert" className="text-caption text-danger-foreground">
              Choose at least one thing to switch off.
            </p>
          ) : null}
        </fieldset>
      }
      onConfirm={(reason) =>
        write.mutate(
          {
            kind: 'lockdown',
            roomId: room.id,
            payload: { muteAllStage, disableChat, disableGifts, reason },
          },
          { onSuccess: onClose },
        )
      }
    />
  )
}

/* ------------------------------------------------------------------ *
 * Purge chat
 * ------------------------------------------------------------------ */

function PurgeDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const write = useLiveWrite()
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Purge the chat"
      target={roomTarget(room)}
      effect="Every chat message in this room is removed from every viewer's screen at once. Messages cannot be brought back. The stream keeps running and chat stays on."
      severity="warning"
      confirmLabel="Purge the chat"
      loading={write.isPending}
      onConfirm={(reason) =>
        write.mutate({ kind: 'purge', roomId: room.id, reason }, { onSuccess: onClose })
      }
    />
  )
}

/* ------------------------------------------------------------------ *
 * Terminate
 * ------------------------------------------------------------------ */

function TerminateDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const write = useLiveWrite()
  const id = useId()
  const name = hostName(room.host)
  const [notes, setNotes] = useState('')
  const [suspendHost, setSuspend] = useState(false)
  const [freezeEarnings, setFreeze] = useState(false)

  const effect = [
    'The stream ends immediately for everyone: the host, the stage and the audience are disconnected, and the room moves to Past streams. This cannot be undone.',
    suspendHost
      ? `${name} is also suspended and cannot go live again until reactivated in Live hosts.`
      : `${name} is not suspended and can go live again.`,
    freezeEarnings
      ? 'Their earnings are frozen.'
      : 'Their earnings are left as they are.',
  ].join(' ')

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Terminate the stream"
      target={roomTarget(room)}
      effect={effect}
      severity="critical"
      confirmLabel={suspendHost ? 'End the stream and suspend' : 'End the stream'}
      typedConfirmation={name}
      loading={write.isPending}
      fields={
        <>
          <div className="space-y-2">
            <Toggle
              id={`${id}-suspend`}
              control="switch"
              label="Suspend the host"
              description={`${name} cannot start another stream until an admin reactivates them.`}
              checked={suspendHost}
              onChange={setSuspend}
            />
            <Toggle
              id={`${id}-freeze`}
              control="switch"
              label="Freeze earnings"
              description="Their creator earnings are held instead of staying available."
              checked={freezeEarnings}
              onChange={setFreeze}
            />
          </div>
          <NotesField
            value={notes}
            onChange={setNotes}
            hint="Only admins see this, in the moderation log — an incident number, who confirmed it."
          />
        </>
      }
      onConfirm={(reason) =>
        write.mutate(
          {
            kind: 'terminate',
            roomId: room.id,
            payload: { reason, adminNotes: notes, suspendHost, freezeEarnings },
          },
          { onSuccess: onClose },
        )
      }
    />
  )
}
