import { PERMISSIONS, type Permission } from '@/auth/permissions'

import { ROUTES } from './routes'

/**
 * The System Settings sections, in the order they appear.
 *
 * Lives in `app/` beside the route table because two layers need it and they
 * are not allowed to import each other: `layouts/navigation.ts`, which renders
 * them as a sub-menu in the sidebar, and `features/settings/SettingsPage.tsx`,
 * which names the current one in the breadcrumb. Lint forbids a layout from
 * importing a feature, and one list is the only way the sidebar and the page
 * can never disagree about what exists.
 */
export interface SettingsSection {
  readonly value: string
  readonly label: string
  readonly to: string
  /**
   * One line under the page title, describing what this section controls.
   *
   * Per-section rather than one line for the whole area: with the heading now
   * naming the section, a generic "configuration that applies to every client"
   * beneath it described something the operator was not looking at.
   */
  readonly description: string
  /** Omitted where every admin who can see the page can see the section. */
  readonly permission?: Permission
  /**
   * Whether the section has actually been built.
   *
   * Same rule as the modules in `navigation.ts`: an entry that navigates to
   * nothing looks like a broken product rather than an unfinished one, and
   * gives an operator no way to tell the two apart. **Each phase flips its own
   * flag when it ships** — S3 chat and platform, S4 releases, S5 database,
   * S6 SMS — never before.
   */
  readonly shipped: boolean
  /**
   * Render at the full page width instead of the `max-w-3xl` reading column.
   *
   * Forms read better narrow; a six-column table does not — at 768px the last
   * columns are simply cut off.
   */
  readonly wide?: boolean
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    value: 'general',
    label: 'General',
    to: ROUTES.settingsGeneral,
    description: 'Brand name and the support contacts every CallsChat client displays.',
    shipped: true,
  },
  {
    value: 'branding',
    label: 'Branding',
    to: ROUTES.settingsBranding,
    description: 'The logo shown on the sign-in screen and in the mobile app.',
    shipped: true,
  },
  {
    value: 'maintenance',
    label: 'Maintenance',
    to: ROUTES.settingsMaintenance,
    description: 'Take the product offline for users while work is in progress.',
    shipped: true,
  },
  {
    value: 'chat',
    label: 'Chat & media',
    to: ROUTES.settingsChat,
    description: 'Attachment size limit and the file types users may send.',
    shipped: true,
  },
  {
    value: 'platform',
    label: 'Platform',
    to: ROUTES.settingsPlatform,
    description: 'Languages, store links and the payment placeholder flags.',
    shipped: true,
  },
  {
    value: 'releases',
    label: 'Releases',
    to: ROUTES.settingsReleases,
    description: 'Backend build information and the mobile app version policy.',
    shipped: true,
  },
  {
    value: 'database',
    label: 'Database',
    to: ROUTES.settingsDatabase,
    description: 'Trigger a database backup and download previous ones.',
    permission: PERMISSIONS.settingsDatabase,
    shipped: true,
    wide: true,
  },
  {
    value: 'sms',
    label: 'SMS gateway',
    to: ROUTES.settingsSms,
    description: 'The provider that delivers one-time codes to users.',
    permission: PERMISSIONS.settingsSms,
    shipped: false,
  },
]

/** The sections a given admin can actually reach today. */
export function visibleSettingsSections(
  can: (permission: Permission) => boolean,
): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section) => section.shipped && (!section.permission || can(section.permission)),
  )
}
