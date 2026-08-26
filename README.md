# CallChat Admin Panel

Internal operations console for CallChat — user management, Social Clubs, host
approvals, moderation, the Diamond economy, payments and withdrawals.

React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query · React Router ·
shadcn/ui + Radix · MSW · Vitest · Playwright

---

## Requirements

|      |                                  |
| ---- | -------------------------------- |
| Node | **20.19.5** (pinned in `.nvmrc`) |
| npm  | 10+ (ships with Node 20)         |

Node 23 is **not** supported — npm's dependency resolver crashes on it and
ESLint 10 rejects it. Run `nvm use` before any npm command.

---

## Run it

```bash
git clone <repo-url>
cd callschat-admin-frontend

nvm use        # switches to Node 20.19.5
npm install
npm run dev
```

Open **http://localhost:5173** — you land on `/login`.

**No `.env` setup is needed.** `.env.development` is committed and points at the
real backend (`https://api.callschat.com`), so sign in with your actual admin
credentials and you get real data.

To work offline against seeded mock data instead, create `.env.local`
(git-ignored) with `VITE_USE_MOCKS=true` — see `.env.example`.

### What exists today

Navigation shows only what the backend actually serves. Verified against the
live API:

| Module              | Backend         | Frontend                       |
| ------------------- | --------------- | ------------------------------ |
| Sign-in and session | ✅ 6 endpoints  | ✅ live                        |
| Account & security  | ✅ 2 endpoints  | ✅ live (`/account`)           |
| Users               | ✅ 20 endpoints | ✅ directory live; detail next |
| Dashboard           | ✅ 3 endpoints  | placeholder — screen not built |

Social Clubs, Hosts, Moderation, Diamonds, Payments, Withdrawals, Reports,
Announcements, Admin Users, Audit Logs and Configuration **all 404 server-side**
and are deliberately absent from the menu and the router. Forcing one of those
URLs gives a not-found page, which is the honest answer. Restore each one
alongside its endpoints — nav lives in `src/layouts/navigation.ts`, routes in
`src/app/router.tsx`.

---

## Environment variables

Validated at build time by `vite.config.ts` and again at boot by `src/env.ts`, so
a missing or malformed value fails the build with a readable error instead of
white-screening in the browser.

| Variable            | Required | Dev default                 | Purpose                                                                                             |
| ------------------- | -------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | yes      | `https://api.callschat.com` | Backend origin. **No trailing slash, no `/api/v1` suffix** — the client appends it.                 |
| `VITE_ENV_LABEL`    | yes      | `development`               | `local` \| `development` \| `staging` \| `production`. Drives the environment badge in the top bar. |
| `VITE_USE_MOCKS`    | yes      | `false`                     | `true` boots MSW and serves seeded data. `false` calls the real backend.                            |
| `VITE_RELEASE`      | no       | —                           | Release identifier attached to error reports.                                                       |

`.env.test` is committed and pins the automated suite to mocks, so tests never
depend on a developer's local settings or hit production.

Only `VITE_`-prefixed, browser-safe values belong in `.env`. Everything in this
file ships to the browser — **never put API secrets, payment provider keys or
database credentials here.**

To point at a real backend:

```dotenv
VITE_API_BASE_URL=https://api.staging.callchat.app
VITE_ENV_LABEL=staging
VITE_USE_MOCKS=false
```

---

## Signing in

Against the **real backend** (the dev default), use your actual CallChat admin
credentials in the **Email or phone** field — the API authenticates on an
`identifier` that accepts either an email or a phone number.

### Mock accounts

Only when `VITE_USE_MOCKS=true`. **Any non-empty password works** until you
change it on the account page.

| Email or phone       | Password | Role        | Sees                                            |
| -------------------- | -------- | ----------- | ----------------------------------------------- |
| `nadia@callchat.app` | anything | Super Admin | Everything                                      |
| `tomas@callchat.app` | anything | Admin       | All except admin-user / RBAC management         |
| `elena@callchat.app` | anything | Moderator   | Users (read + restrict), clubs, moderation only |

Sign in as different roles to see RBAC in action: nav items disappear and direct
URLs render a forbidden state.

The credentials live in `sessionStorage` under `callchat.admin.session` (so
they die with the tab); the mock backend keeps its own record in
`localStorage` under `callchat.mock.session`. Clearing the first forces a
sign-out.

**Account & security** (account menu → Account & security, or `/account`) lets
the signed-in admin change their own password and email address. Against the
mock, any password works until you change it — after that only the new one
does, so the flow is genuinely testable.

---

## Simulating failure states

With mocks on, drive the loading / empty / error / forbidden states from the
browser console:

```js
__mockScenario.set('empty') // list endpoints return zero rows
__mockScenario.set('error') // list endpoints return 500
__mockScenario.set('forbidden') // every request returns 403
__mockScenario.set('unauthorized') // every request returns 401
__mockScenario.set('slow') // 3s latency
__mockScenario.set('normal') // back to seeded data
```

Mock data is seeded deterministically (500 users, 60 clubs, 40 host
applications, 5,000 ledger entries, 300 payments, 80 withdrawals, 120 moderation
cases), so a given URL renders the same rows on every reload.

---

## Scripts

| Command                           | Does                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                     | Dev server on :5173                                             |
| `npm run build`                   | Typecheck + production build to `dist/`                         |
| `npm run preview`                 | Serve the built bundle                                          |
| `npm run verify`                  | **typecheck → lint → format:check → test** — run before pushing |
| `npm test`                        | Unit + integration tests (Vitest)                               |
| `npm run test:watch`              | Vitest in watch mode                                            |
| `npm run test:coverage`           | Coverage report                                                 |
| `npm run test:e2e`                | Playwright across 5 viewports (360/768/1024/1440/1920)          |
| `npm run lint` / `lint:fix`       | ESLint                                                          |
| `npm run format` / `format:check` | Prettier                                                        |

The first Playwright run needs browsers: `npx playwright install`.

The e2e suite starts its own dev server on **:5174** pinned to `VITE_USE_MOCKS=true`,
so it never collides with your dev server on :5173 and never runs against
production — several specs sign out, and Phase 3C adds suspend/ban.

---

## Component gallery

`/_design` (dev and preview only, excluded from production) renders every shared
component with its states — buttons, tables, cards, badges, money and diamond
formatting, masked values, loaders, dialogs. Check a component there before
wiring it into a feature.

---

## Project layout

```
src/
  api/         HTTP client, typed errors, query keys
  app/         Router, route paths, query client
  auth/        Session, permissions, route guards
  components/
    ui/        shadcn/Radix primitives
    display/   Typography, badges, money, dates, masking
    data/      DataTable, cards, filters, pagination, export
    feedback/  Loading / empty / error states, confirm dialog
  features/    One directory per module — never import across siblings
  layouts/     Admin shell, sidebar, top bar, global search
  lib/         Formatting, masking, dates, status map, hooks
  mocks/       MSW handlers, seed data, scenarios
  styles/      Design tokens, global CSS
  types/       Zod entity contracts
tests/         Test helpers, a11y assertions, e2e specs
```

ESLint enforces the boundaries: shared components cannot import from
`features/`, and features cannot import each other.

---

## Deploying to Vercel

Push to GitHub, import the repository in Vercel, and accept the detected Vite
preset — `vercel.json` already sets the build command, output directory, SPA
routing and cache/security headers.

Set **Node.js Version → 20.x** in Project Settings → General, matching `.nvmrc`.

### Environment variables to add in Vercel

Add these under Project Settings → Environment Variables for every environment
you deploy (Production / Preview / Development):

| Variable            | Value                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Backend origin, e.g. `https://api.callchat.app` — no trailing slash, no `/api/v1` |
| `VITE_ENV_LABEL`    | `production`, `staging` or `development`                                          |
| `VITE_USE_MOCKS`    | `false` against a real backend, `true` for a mock-data preview                    |
| `VITE_RELEASE`      | optional, e.g. the commit SHA                                                     |

These are read at **build** time, not runtime — changing one requires a
redeploy. The build fails with a readable error if any are missing or invalid,
so a misconfigured deploy never reaches users.

Nothing secret belongs here: every `VITE_` value is embedded in the JavaScript
bundle and readable by anyone who opens the site.

### Before making a deployment public

- `VITE_USE_MOCKS=true` ships the mock backend, where **any password signs you
  in as Super Admin**. Only use it behind Vercel's Deployment Protection.
- With `VITE_USE_MOCKS=false`, MSW and the mock service worker are stripped from
  the build entirely, and the app talks only to `VITE_API_BASE_URL`.
- The backend must allow the Vercel domain via CORS and accept the session
  cookie (`SameSite=None; Secure` for a cross-origin API).
- `VITE_ENV_LABEL=production` also hides the `/_design` component gallery.
