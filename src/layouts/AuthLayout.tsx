import { Outlet } from 'react-router'

/**
 * Shell for unauthenticated routes.
 *
 * plan.md §1E: a centred card on a navy field. Deliberately minimal — no
 * navigation, no product surface, nothing that hints at internal structure
 * before the admin has authenticated.
 */
export function AuthLayout() {
  return (
    /*
     * `overflow-y-auto`: the document no longer scrolls (globals.css), so this
     * shell has to scroll itself — otherwise the sign-in card would be
     * unreachable on a short window or with the keyboard open on a phone.
     */
    <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto auth-surface px-4 py-10">
      {/*
       * The mark, oversized and bleeding off the bottom-right corner.
       *
       * Cropped on purpose: a whole logo floating in the background reads as a
       * stray image, while one running off the edge reads as a deliberate
       * treatment. `fixed` rather than `absolute` so it stays put if the card
       * has to scroll on a short window, and 3% so it never competes with the
       * card — on a field this large that is still clearly visible.
       */}
      <img
        src="/logo-mark.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed -right-16 -bottom-20 hidden w-[26rem] opacity-[0.035] select-none sm:block lg:-right-24 lg:w-[34rem]"
      />

      <div className="relative w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          {/*
           * Decorative: the wordmark directly beneath already names the
           * product, so announcing the logo would repeat it.
           */}
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            width={64}
            height={64}
            className="mx-auto mb-3 size-16 object-contain"
          />
          <p className="text-h2 text-sidebar-foreground">
            CallsChat<span className="font-normal text-sidebar-muted"> Admin</span>
          </p>
          <p className="text-caption text-sidebar-muted">Internal operations console</p>
        </div>

        <div className="rounded-xl bg-surface p-6 shadow-lg sm:p-8">
          <Outlet />
        </div>

        <p className="text-center text-caption text-sidebar-muted">
          Authorised personnel only. All activity is recorded.
        </p>
      </div>
    </div>
  )
}
