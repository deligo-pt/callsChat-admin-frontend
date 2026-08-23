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

nvm use                 # switches to Node 20.19.5
npm install
cp .env.example .env    # defaults work as-is
npm run dev
```

Open **http://localhost:5173** — you land on `/login`.

The default `.env` runs against the in-browser mock backend, so **no backend,
database or network access is required** to run the app.

Feature modules are still being built; those routes currently render a
placeholder. The shell, authentication, RBAC, global search and the component
library are live.

---

## Environment variables

All variables are validated at boot by `src/env.ts` — a missing or malformed
value fails immediately with a readable error instead of an `undefined` later.

| Variable            | Required | Default                 | Purpose                                                                                             |
| ------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | yes      | `http://localhost:4000` | Backend origin. **No trailing slash, no `/api/v1` suffix** — the client appends it.                 |
| `VITE_ENV_LABEL`    | yes      | `local`                 | `local` \| `development` \| `staging` \| `production`. Drives the environment badge in the top bar. |
| `VITE_USE_MOCKS`    | yes      | `true`                  | `true` boots MSW and serves seeded data. `false` calls the real backend.                            |
| `VITE_RELEASE`      | no       | —                       | Release identifier attached to error reports.                                                       |

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

## Test accounts

Available when `VITE_USE_MOCKS=true`. **Any non-empty password works** — the mock
does not enforce a password policy, because that is a backend concern.

| Email                | Password | Role             | Sees                                            |
| -------------------- | -------- | ---------------- | ----------------------------------------------- |
| `nadia@callchat.app` | anything | Super Admin      | Everything                                      |
| `tomas@callchat.app` | anything | Operations Admin | All except admin-user / RBAC management         |
| `elena@callchat.app` | anything | Moderator        | Users (read + restrict), clubs, moderation only |

Sign in as different roles to see RBAC in action: nav items disappear and direct
URLs render a forbidden state.

The session lives in `localStorage` under `callchat.mock.session` — clear it to
force a sign-out.

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
