import { announcementHandlers } from './announcements'
import { authHandlers } from './auth'
import { bootstrapHandlers } from './bootstrap'
import { feedbackHandlers } from './feedback'
import { hostHandlers } from './hosts'
import { resourceHandlers } from './resources'
import { searchHandlers } from './search'
import { settingsHandlers } from './settings'
import { staffHandlers } from './staff'
import { verificationHandlers } from './verifications'

export const handlers = [
  ...authHandlers,
  ...bootstrapHandlers,
  ...searchHandlers,
  ...settingsHandlers,
  /*
   * Before `resourceHandlers`, which carries a catch-all for the unbuilt
   * modules — a later generic handler would otherwise swallow `/admin/staff`.
   */
  ...staffHandlers,
  ...feedbackHandlers,
  ...verificationHandlers,
  /*
   * Also before `resourceHandlers`, and for a sharper reason than the others:
   * the catch-all there would answer `GET /admin/announcements/:id` with a
   * plausible record, hiding the fact that the route does not exist at all
   * (plan.md §3.2).
   */
  ...announcementHandlers,
  /*
   * Also before `resourceHandlers`, by the same convention. There is no
   * wildcard in that file today that would swallow `/admin/live/*` — checked —
   * but the four handlers this module replaces DID live there, on the wrong
   * route (`/admin/host-applications`), and registering here keeps the real
   * routes in front of anything generic that is added later.
   */
  ...hostHandlers,
  ...resourceHandlers,
]
