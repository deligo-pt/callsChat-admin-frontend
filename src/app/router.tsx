import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'

import { PERMISSIONS } from '@/auth/permissions'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { RequirePermission } from '@/auth/RequirePermission'
import { RouteFallback } from '@/components/feedback'
import { AdminLayout } from '@/layouts/AdminLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { isProduction } from '@/env'

import { ROUTES } from './routes'
import { RouteErrorBoundary } from './RouteErrorBoundary'

const LoginPage = lazy(() =>
  import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const DesignGallery = lazy(() =>
  import('@/features/design-system/DesignGallery').then((m) => ({
    default: m.DesignGallery,
  })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)
const Placeholder = lazy(() =>
  import('@/features/placeholder/ModulePlaceholder').then((m) => ({
    default: m.ModulePlaceholder,
  })),
)
const UsersListPage = lazy(() =>
  import('@/features/users/UsersListPage').then((m) => ({ default: m.UsersListPage })),
)
const UserDetailPage = lazy(() =>
  import('@/features/users/UserDetailPage').then((m) => ({
    default: m.UserDetailPage,
  })),
)
const AccountSecurityPage = lazy(() =>
  import('@/features/auth/AccountSecurityPage').then((m) => ({
    default: m.AccountSecurityPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const GeneralTab = lazy(() =>
  import('@/features/settings/general/GeneralTab').then((m) => ({
    default: m.GeneralTab,
  })),
)
const BrandingTab = lazy(() =>
  import('@/features/settings/general/BrandingTab').then((m) => ({
    default: m.BrandingTab,
  })),
)
const MaintenanceTab = lazy(() =>
  import('@/features/settings/general/MaintenanceTab').then((m) => ({
    default: m.MaintenanceTab,
  })),
)
const ChatTab = lazy(() =>
  import('@/features/settings/chat/ChatTab').then((m) => ({ default: m.ChatTab })),
)
const EconomyTab = lazy(() =>
  import('@/features/settings/economy/EconomyTab').then((m) => ({
    default: m.EconomyTab,
  })),
)

const PlatformTab = lazy(() =>
  import('@/features/settings/platform/PlatformTab').then((m) => ({
    default: m.PlatformTab,
  })),
)
const BootstrapTab = lazy(() =>
  import('@/features/settings/bootstrap/BootstrapTab').then((m) => ({
    default: m.BootstrapTab,
  })),
)
const DatabaseTab = lazy(() =>
  import('@/features/settings/database/DatabaseTab').then((m) => ({
    default: m.DatabaseTab,
  })),
)
const HostApplicationsPage = lazy(() =>
  import('@/features/hosts/HostApplicationsPage').then((m) => ({
    default: m.HostApplicationsPage,
  })),
)

const TopUpRequestsPage = lazy(() =>
  import('@/features/diamonds/TopUpRequestsPage').then((m) => ({
    default: m.TopUpRequestsPage,
  })),
)

const PackagesPage = lazy(() =>
  import('@/features/diamonds/PackagesPage').then((m) => ({
    default: m.PackagesPage,
  })),
)
const EmojiPacksPage = lazy(() =>
  import('@/features/emoji/EmojiPacksPage').then((m) => ({
    default: m.EmojiPacksPage,
  })),
)
const GiftTransactionsPage = lazy(() =>
  import('@/features/ledger/GiftTransactionsPage').then((m) => ({
    default: m.GiftTransactionsPage,
  })),
)
const GiftCatalogPage = lazy(() =>
  import('@/features/gifts/GiftCatalogPage').then((m) => ({
    default: m.GiftCatalogPage,
  })),
)
const HostsPage = lazy(() =>
  import('@/features/hosts/HostsPage').then((m) => ({ default: m.HostsPage })),
)
const FeedbackListPage = lazy(() =>
  import('@/features/feedback/FeedbackListPage').then((m) => ({
    default: m.FeedbackListPage,
  })),
)
const FeedbackDetailPage = lazy(() =>
  import('@/features/feedback/FeedbackDetailPage').then((m) => ({
    default: m.FeedbackDetailPage,
  })),
)
const VerificationQueuePage = lazy(() =>
  import('@/features/verifications/VerificationQueuePage').then((m) => ({
    default: m.VerificationQueuePage,
  })),
)
const VerificationDetailPage = lazy(() =>
  import('@/features/verifications/VerificationDetailPage').then((m) => ({
    default: m.VerificationDetailPage,
  })),
)
const AnnouncementsPage = lazy(() =>
  import('@/features/announcements/AnnouncementsPage').then((m) => ({
    default: m.AnnouncementsPage,
  })),
)
const StaffListPage = lazy(() =>
  import('@/features/staff/StaffListPage').then((m) => ({
    default: m.StaffListPage,
  })),
)
const StaffCreatePage = lazy(() =>
  import('@/features/staff/StaffCreatePage').then((m) => ({
    default: m.StaffCreatePage,
  })),
)
const StaffDetailPage = lazy(() =>
  import('@/features/staff/StaffDetailPage').then((m) => ({
    default: m.StaffDetailPage,
  })),
)

function suspended(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

/**
 * Routes for the modules the BACKEND actually serves.
 *
 * Verified 2026-08-25: only auth, users and dashboard/analytics exist. The
 * previous placeholder routes for Social Clubs, Hosts, Moderation, Diamonds,
 * Payments, Withdrawals, Announcements, Admin Users, Audit Logs and
 * Configuration have been removed — every one of them 404s server-side, so the
 * page could never have shown data.
 *
 * Forcing one of those URLs now falls through to the not-found route, which is
 * the honest answer: the module does not exist yet. A placeholder claiming
 * "coming in Phase 7" was worse, because it made an unbuilt backend look like a
 * built-but-broken frontend.
 *
 * **Restore a route the same day its endpoints ship**, alongside its nav entry
 * in `layouts/navigation.ts`.
 */
const moduleRoutes: RouteObject[] = [
  /*
   * `GET /admin/dashboard/snapshot`, `/trends` and `/admin/analytics` all
   * exist and are not consumed yet, so this screen shows **sample figures**
   * and says so on the page.
   *
   * It replaced a `Placeholder module="Dashboard" phase={9}`, which printed
   * "This module is delivered in Phase 9" — our build-plan vocabulary on an
   * operator's screen. A shaped preview communicates the same state without
   * asking anyone to know what a phase is.
   */
  {
    path: ROUTES.dashboard,
    element: (
      <RequirePermission permission={PERMISSIONS.analyticsView} resource="dashboard">
        {suspended(<DashboardPage />)}
      </RequirePermission>
    ),
  },

  /*
   * No permission guard: every signed-in admin may manage their OWN
   * credentials, regardless of role. Gating this would lock a Moderator out of
   * changing their own password.
   */
  { path: ROUTES.account, element: suspended(<AccountSecurityPage />) },

  /* Phase 3A — the first real module surface. */
  {
    path: ROUTES.users,
    element: (
      <RequirePermission permission={PERMISSIONS.usersView} resource="users">
        {suspended(<UsersListPage />)}
      </RequirePermission>
    ),
  },

  /* Phase 3B — the six read-only detail tabs. */
  {
    path: '/users/:userId',
    element: (
      <RequirePermission permission={PERMISSIONS.usersView} resource="users">
        {suspended(<UserDetailPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase S1 — System Settings (system_settings_plan.md §4.1).
   *
   * The shell is one guarded route with a child per section, so each section
   * is bookmarkable and a Super-Admin-only section can 403 on its own rather
   * than taking the whole page with it.
   *
   * Only the sections that exist are routed. `sms` falls through to the
   * not-found route until its phase ships, matching the tab rail in
   * `SettingsPage`.
   */
  {
    path: ROUTES.settings,
    element: (
      <RequirePermission
        permission={PERMISSIONS.configurationView}
        resource="system settings"
      >
        {suspended(<SettingsPage />)}
      </RequirePermission>
    ),
    children: [
      { index: true, element: <Navigate to={ROUTES.settingsGeneral} replace /> },
      { path: 'general', element: suspended(<GeneralTab />) },
      { path: 'branding', element: suspended(<BrandingTab />) },
      { path: 'maintenance', element: suspended(<MaintenanceTab />) },
      { path: 'chat', element: suspended(<ChatTab />) },
      { path: 'platform', element: suspended(<PlatformTab />) },
      { path: 'economy', element: suspended(<EconomyTab />) },
      /*
       * Bootstrap — what mobile clients actually read at cold start
       * (plan.md §4.1). Same guard as every other section; the API's own
       * `SYSTEM_SETTINGS_EDIT` bridges to these two panel permissions.
       */
      { path: 'bootstrap', element: suspended(<BootstrapTab />) },
      /*
       * Super Admin only, matching the route's `verifySuperAdmin` guard. Gated
       * here as well as in the sidebar so a typed URL gets the standard 403
       * rather than a screen that fails on its first request.
       */
      {
        path: 'database',
        element: (
          <RequirePermission
            permission={PERMISSIONS.settingsDatabase}
            resource="database backups"
          >
            {suspended(<DatabaseTab />)}
          </RequirePermission>
        ),
      },
    ],
  },

  /*
   * Phase F1 — Feedback & Support (feedback_management_plan.md §4.1).
   *
   * Super Admin only, and for a reason unlike every other guard in this file:
   * `/admin/feedbacks/*` is gated by
   * `requirePermission('FEEDBACK_MANAGEMENT')`, a key the staff write routes
   * refuse to grant to anybody (§3.1). The module is reachable only through
   * the SUPER_ADMIN wildcard, so guarding here as well as in the sidebar means
   * a typed URL gets the standard 403 rather than a screen that 403s on its
   * first request.
   */
  {
    path: ROUTES.feedback,
    element: (
      <RequirePermission permission={PERMISSIONS.feedbackManage} resource="feedback">
        {suspended(<FeedbackListPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase H4 — Host applications (plan.md §4.2).
   *
   * Guarded here as well as in the sidebar so a typed URL gets the standard
   * 403 rather than a screen that 403s on its first request.
   *
   * ⚠️ `hostApplicationsView` was already granted to ADMIN in
   * `auth/permissions.ts` before this module existed, and the doc agrees —
   * `ADMIN` or `SUPER_ADMIN` with `status: ACTIVE`. That the grant predates the
   * feature is not evidence it is right: it has **never been measured**,
   * because the only credential available is a SUPER_ADMIN that bypasses
   * module permissions entirely (plan.md O2).
   */
  /*
   * Phase W2 — the manual top-up queue (plan.md §5).
   *
   * ⚠️ Gated on `walletsView`, which ADMIN holds, and **not** on
   * `diamondsAdjust`, which is Super-Admin-only. Approving a request credits
   * diamonds — the act `diamonds.adjust` reserves — but the backend enforces
   * only `ADMIN | SUPER_ADMIN` on this route, so a stricter client gate would
   * hide the screen while leaving the endpoint open to the same token. That is
   * theatre, and it would make the queue unusable for the operations tier it
   * exists for. Recorded as plan.md O2 for the backend.
   */
  {
    path: ROUTES.topUps,
    element: (
      <RequirePermission
        permission={PERMISSIONS.walletsView}
        resource="top-up requests"
      >
        {suspended(<TopUpRequestsPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase W4 — the diamond price list (plan.md §5).
   *
   * ⚠️ Gated on `walletsView` for **reading**, which ADMIN holds, while every
   * write inside is gated on `diamondPackagesConfigure`, which is
   * Super-Admin-only. That split is deliberate and is not the top-up queue's
   * situation: there, a stricter client gate would have been theatre because
   * the backend enforces only `ADMIN | SUPER_ADMIN`. Here
   * `doc/RBAC, Security, and Privacy.md:52` reserves pricing for Super Admin
   * with the rest of the finance class, so hiding the controls reflects the
   * policy rather than inventing one. An ADMIN still needs to read the list —
   * it is how they answer "what did this person buy".
   */
  {
    path: ROUTES.diamondPackages,
    element: (
      <RequirePermission
        permission={PERMISSIONS.walletsView}
        resource="diamond packages"
      >
        {suspended(<PackagesPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase G2 — the gift catalog (plan.md §3.1).
   *
   * ⚠️ The same read/write split as diamond packages: `walletsView` reads,
   * and every write inside gates itself on `giftsConfigure`, which is
   * Super-Admin-only by RBAC policy.
   */
  {
    path: ROUTES.gifts,
    element: (
      <RequirePermission
        permission={PERMISSIONS.walletsView}
        resource="the gift catalog"
      >
        {suspended(<GiftCatalogPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase G5 — the gift ledger (plan.md §3.1). `ledgerView`, which ADMIN
   * holds: the operations tier reads who sent what to whom.
   */
  {
    path: ROUTES.diamondTransactions,
    element: (
      <RequirePermission
        permission={PERMISSIONS.ledgerView}
        resource="gift transactions"
      >
        {suspended(<GiftTransactionsPage />)}
      </RequirePermission>
    ),
  },

  {
    path: ROUTES.hostApplications,
    element: (
      <RequirePermission
        permission={PERMISSIONS.hostApplicationsView}
        resource="host applications"
      >
        {suspended(<HostApplicationsPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase H6 — the live host roster (plan.md §4.4).
   *
   * ⚠️ **Gated on `hostApplicationsView`, which is wider than it should be.**
   * Suspending or banning a host ends their income and tears down their live
   * room — a materially more severe act than reviewing an application — but
   * the backend exposes **no roster-specific permission**. The only keys that
   * exist are `host_applications.{view,approve,reject}`.
   *
   * Inventing `PERMISSIONS.hostsSuspend` here would be a frontend fiction with
   * nothing behind it: every role would still be judged by the server on the
   * key it actually checks, and the panel would be enforcing a boundary that
   * does not exist. That is exactly what `types/clubs.ts` did and H1 deleted.
   * Logged as plan.md O11 for the backend owner instead.
   */
  {
    path: ROUTES.hosts,
    element: (
      <RequirePermission
        permission={PERMISSIONS.hostApplicationsView}
        resource="live hosts"
      >
        {suspended(<HostsPage />)}
      </RequirePermission>
    ),
  },

  /* Phase F2 — the ticket. Guarded identically; there is no `/feedback/new`. */
  {
    path: '/feedback/:id',
    element: (
      <RequirePermission permission={PERMISSIONS.feedbackManage} resource="feedback">
        {suspended(<FeedbackDetailPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase V1 — Verification & Compliance (plan.md §4.1).
   *
   * Guarded by `verifications.review`, which — unlike every other guard in this
   * file — is a permission a colleague can actually be granted. `BUSINESS_VERIFY`
   * is in the staff enum, so `features/staff/permissionMap.ts` bridges it, and
   * the day `GET /admin/auth/me` returns `adminPermissions` a granted ADMIN
   * reaches this route with no change here (plan.md §4.3).
   *
   * Until then only a SUPER_ADMIN holds it, through the wildcard. Guarding here
   * as well as in the sidebar means a typed URL gets the standard 403 rather
   * than a vault screen that 403s on its first request.
   */
  {
    path: ROUTES.verifications,
    element: (
      <RequirePermission
        permission={PERMISSIONS.verificationsReview}
        resource="verifications"
      >
        {suspended(<VerificationQueuePage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase B2 — Official Announcements (plan.md §4.1).
   *
   * Guarded by `notifications.broadcast`, which **B4 granted to `ADMIN`** to
   * match the backend: `broadcast.md` §4 admits `ADMIN` or `SUPER_ADMIN`, and
   * there is no announcement module in the staff permission enum, so these
   * routes are role-guarded rather than grant-guarded (§3.6).
   *
   * That makes this the one route in this file whose guard is a *role* decision
   * rather than a per-account grant — the opposite of `/verifications` below,
   * where the API needs the role AND `BUSINESS_VERIFY`.
   *
   * ⚠️ An ADMIN actually being admitted by the live service is read from the
   * doc, not measured: it needs an ADMIN bearer token and none exists
   * (plan.md O3). If the route turns out to be Super-Admin-only, the fix is to
   * drop one line from `ADMIN_PERMISSIONS`, and
   * `features/announcements/navigation.test.ts` is what will have to change
   * with it.
   */
  {
    path: ROUTES.announcements,
    element: (
      <RequirePermission
        permission={PERMISSIONS.notificationsBroadcast}
        resource="announcements"
      >
        {suspended(<AnnouncementsPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase G4 — emoji packs (plan.md §3.4).
   *
   * ⚠️ `giftsConfigure` for reading too (plan.md §3.1). The page has no
   * read-only mode: every control on it is a write.
   */
  {
    path: ROUTES.emojiPacks,
    element: (
      <RequirePermission permission={PERMISSIONS.giftsConfigure} resource="emoji packs">
        {suspended(<EmojiPacksPage />)}
      </RequirePermission>
    ),
  },

  /* Phase V2 — the application. Guarded identically; there is no `/new`. */
  {
    path: '/verifications/:id',
    element: (
      <RequirePermission
        permission={PERMISSIONS.verificationsReview}
        resource="verifications"
      >
        {suspended(<VerificationDetailPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase A1 — Staff & Access Control (staff_management_plan.md §4.1).
   *
   * Super Admin only. All eight `/admin/staff/*` routes are guarded with
   * `verifySuperAdmin` and answer `403 "Requires SUPER_ADMIN privileges"` to
   * anyone else, so guarding here as well as in the sidebar means a typed URL
   * gets the standard 403 rather than a screen that fails on its first request.
   */
  {
    path: ROUTES.staff,
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffListPage />)}
      </RequirePermission>
    ),
  },

  /*
   * Phase A2 — provisioning. Guarded identically, and declared **before**
   * `/staff/:id`: React Router prefers a static segment over a dynamic one, but
   * relying on that silently is how `new` ends up being looked up as a staff id.
   */
  {
    path: ROUTES.staffNew,
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffCreatePage />)}
      </RequirePermission>
    ),
  },

  /* Phase A3 — the record, and its permission grid. */
  {
    path: '/staff/:id',
    element: (
      <RequirePermission permission={PERMISSIONS.staffManage} resource="staff">
        {suspended(<StaffDetailPage />)}
      </RequirePermission>
    ),
  },
]

if (!isProduction) {
  moduleRoutes.push({ path: ROUTES.design, element: suspended(<DesignGallery />) })
}

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ path: ROUTES.login, element: suspended(<LoginPage />) }],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AdminLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
          ...moduleRoutes,
          {
            path: '*',
            element: suspended(<Placeholder module="Not found" phase={0} />),
          },
        ],
      },
    ],
  },
])
