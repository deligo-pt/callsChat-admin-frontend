import { apiClient } from '@/api/client'
import { currentAdminSchema, type CurrentAdmin } from '@/types/identity'

/** Session bootstrap — plan.md §2.5. */
export async function fetchCurrentAdmin(signal?: AbortSignal): Promise<CurrentAdmin> {
  return apiClient.get<CurrentAdmin>('/admin/me', {
    schema: currentAdminSchema,
    resource: 'current admin',
    ...(signal ? { signal } : {}),
  })
}

export interface SignInPayload {
  readonly email: string
  readonly password: string
}

export async function signIn(payload: SignInPayload): Promise<CurrentAdmin> {
  return apiClient.post<CurrentAdmin>('/admin/auth/login', {
    body: payload,
    schema: currentAdminSchema,
    resource: 'current admin',
  })
}

export async function signOut(): Promise<void> {
  await apiClient.post<void>('/admin/auth/logout')
}
