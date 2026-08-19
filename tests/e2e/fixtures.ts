import { expect, type Page } from '@playwright/test'

/**
 * Mock-backend admin accounts (src/mocks/handlers/auth.ts).
 * Any non-empty password is accepted; password policy is a backend concern.
 */
export const ACCOUNTS = {
  superAdmin: 'nadia@callchat.app',
  operationsAdmin: 'tomas@callchat.app',
  moderator: 'elena@callchat.app',
} as const

/** Sign in and wait for the authenticated shell. */
export async function signIn(
  page: Page,
  email: string = ACCOUNTS.superAdmin,
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('any-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}
