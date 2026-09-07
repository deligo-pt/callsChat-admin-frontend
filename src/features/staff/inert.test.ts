import { describe, expect, it } from 'vitest'

/**
 * The permission bridge must stay inert until phase A5.
 *
 * `modulePermissionsToPanel` translates the backend's module keys into the
 * panel's own permissions, and it is correct — but consuming it today would
 * break the panel, because `GET /admin/auth/me` returns `adminPermissions: []`
 * for every account, including one that demonstrably holds two keys
 * (staff_management_plan.md §3.2).
 *
 * `AuthProvider` bootstraps from `/me` on every reload. So an ADMIN would sign
 * in, see their modules, press F5, and watch the navigation empty out.
 *
 * The dangerous version of this is the *partial* wiring: reading real
 * permissions on login and falsely-empty ones on reload is worse than reading
 * neither, because it looks like it works. This test is the tripwire — it
 * fails the moment anything outside this feature imports the bridge, which is
 * exactly when someone should be reading §3.2 before continuing.
 *
 * Delete it in A5, together with `permissionsForRole`, once the backend
 * returns the array.
 */

/*
 * `import.meta.glob` rather than `node:fs`: this file is compiled by the app
 * tsconfig, which has no Node types, and a Vite-native read keeps it that way.
 */
const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const IMPORTS_BRIDGE = /from ['"][^'"]*permissionMap['"]/

describe('permission bridge inertness', () => {
  it('finds the source files it is meant to be scanning', () => {
    // A glob that silently matched nothing would make every check below vacuous.
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(Object.keys(SOURCES)).toContain('/src/auth/permissions.ts')
  })

  it('is imported by nothing outside features/staff', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.startsWith('/src/features/staff/'))
      .filter(([, source]) => IMPORTS_BRIDGE.test(source))
      .map(([path]) => path)

    expect(
      offenders,
      "modulePermissionsToPanel is wired somewhere. Read staff_management_plan.md §3.2 first — GET /admin/auth/me still returns an empty array, so this blanks an ADMIN's navigation on page reload.",
    ).toEqual([])
  })

  it('still has permissionsForRole as the live source of truth', () => {
    /*
     * The two are mutually exclusive. If the bridge is ever wired while this
     * still exists, the panel has two disagreeing permission sources.
     */
    expect(SOURCES['/src/auth/permissions.ts']).toContain(
      'export function permissionsForRole',
    )
  })
})
