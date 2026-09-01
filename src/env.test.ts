import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

const VALID = {
  VITE_API_BASE_URL: 'https://staging-api.callschat.app',
  VITE_ENV_LABEL: 'staging',
  VITE_USE_MOCKS: 'false',
}

describe('environment contract', () => {
  it('accepts a valid configuration', () => {
    const env = parseEnv(VALID)
    expect(env.VITE_API_BASE_URL).toBe('https://staging-api.callschat.app')
    expect(env.VITE_ENV_LABEL).toBe('staging')
  })

  it('coerces VITE_USE_MOCKS to a boolean', () => {
    expect(parseEnv({ ...VALID, VITE_USE_MOCKS: 'true' }).VITE_USE_MOCKS).toBe(true)
    expect(parseEnv({ ...VALID, VITE_USE_MOCKS: 'false' }).VITE_USE_MOCKS).toBe(false)
  })

  it('fails loudly when the API base URL is missing', () => {
    expect(() => parseEnv({ ...VALID, VITE_API_BASE_URL: '' })).toThrow(
      /VITE_API_BASE_URL/,
    )
  })

  it('fails loudly when the API base URL is not a URL', () => {
    expect(() => parseEnv({ ...VALID, VITE_API_BASE_URL: 'not-a-url' })).toThrow(
      /valid URL/,
    )
  })

  it('rejects an unknown environment label', () => {
    expect(() => parseEnv({ ...VALID, VITE_ENV_LABEL: 'bogus' })).toThrow(
      /VITE_ENV_LABEL/,
    )
  })

  it('rejects a non-boolean mock flag', () => {
    expect(() => parseEnv({ ...VALID, VITE_USE_MOCKS: 'yes' })).toThrow(
      /VITE_USE_MOCKS/,
    )
  })
})
