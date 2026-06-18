// JWT signing/verification for the panel auth flow (P08).
// Access tokens are short-lived (15m); refresh tokens last 7d and can be
// revoked via the Redis blacklist (see token-store.ts).
//
// Keys are resolved lazily from the environment so importing this module never
// throws when JWT_SECRET is unset (tests, tooling). The dev fallbacks mirror the
// defaults in plugins/env.ts; production deployments must set real secrets.
import { createSigner, createVerifier } from 'fast-jwt'

// Treat an unset OR empty env var as "use the dev fallback" — an empty key would
// otherwise be passed straight to fast-jwt, which rejects it.
function accessKey(): string {
  const key = process.env['JWT_SECRET']
  return key && key.length > 0 ? key : 'dev-access-secret-change-me'
}
function refreshKey(): string {
  const key = process.env['JWT_REFRESH_SECRET']
  return key && key.length > 0 ? key : 'dev-refresh-secret-change-me'
}

export interface JwtPayload {
  userId: string
  clinicId: string
  role: 'secretary' | 'doctor' | 'clinic_admin' | 'ia_studio_admin'
  email: string
}

export function signAccessToken(payload: JwtPayload): string {
  return createSigner({ key: accessKey(), expiresIn: '15m' })(payload)
}

export function signRefreshToken(payload: JwtPayload): string {
  return createSigner({ key: refreshKey(), expiresIn: '7d' })(payload)
}

export function verifyAccessToken(token: string): JwtPayload {
  return createVerifier({ key: accessKey() })(token) as JwtPayload
}

export function verifyRefreshToken(token: string): JwtPayload {
  return createVerifier({ key: refreshKey() })(token) as JwtPayload
}
