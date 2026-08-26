import { expect, type Page } from '@playwright/test'

/**
 * Mock-backend admin accounts (src/mocks/handlers/auth.ts).
 * Any non-empty password is accepted; password policy is a backend concern.
 */
export const ACCOUNTS = {
  superAdmin: 'nadia@callchat.app',
  admin: 'tomas@callchat.app',
  moderator: 'elena@callchat.app',
} as const

/** Sign in and wait for the authenticated shell. */
export async function signIn(
  page: Page,
  identifier: string = ACCOUNTS.superAdmin,
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email or phone').fill(identifier)
  await page.getByLabel('Password', { exact: true }).fill('any-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}
