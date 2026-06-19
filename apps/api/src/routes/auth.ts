// Auth routes (P08): login, refresh, logout.
//   POST /auth/login   { email, password }      → { accessToken, refreshToken, user }
//     user carries panelLanguage so the panel restores the saved ES/EN language on login.
//   POST /auth/refresh { refreshToken }          → { accessToken }
//   POST /auth/logout  { refreshToken }          → { success: true }
// Credentials are checked against clinic_users.password_hash (scrypt). Refresh
// tokens are revoked via the Redis blacklist on logout.
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createUsersRepository } from '@docmee/db'
import { verifyPassword } from '@docmee/shared'
import { withDb } from '../lib/db.js'
import { validate } from '../lib/validate.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../auth/jwt.js'
import { blacklistRefreshToken, isRefreshTokenBlacklisted } from '../auth/token-store.js'

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
const refreshSchema = z.object({ refreshToken: z.string().min(1) })
const logoutSchema = z.object({ refreshToken: z.string().min(1) })

const authRoute: FastifyPluginAsync = async (app) => {
  app.post('/login', async (request, reply) => {
    const parsed = validate(loginSchema, request.body, reply)
    if (!parsed.ok) return
    const { email, password } = parsed.data

    const auth = await withDb(async (sql) => createUsersRepository(sql).findAuthByEmail(email))

    // Same response for unknown user / inactive / bad password — no account enumeration.
    if (!auth || auth.status !== 'active' || !auth.passwordHash || !verifyPassword(password, auth.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const payload: JwtPayload = {
      userId: auth.id,
      clinicId: auth.clinicId,
      role: auth.role,
      email: auth.email,
    }
    return {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: {
        id: auth.id,
        email: auth.email,
        role: auth.role,
        clinicId: auth.clinicId,
        panelLanguage: auth.panelLanguage,
      },
    }
  })

  app.post('/refresh', async (request, reply) => {
    const parsed = validate(refreshSchema, request.body, reply)
    if (!parsed.ok) return
    const { refreshToken } = parsed.data

    if (await isRefreshTokenBlacklisted(refreshToken)) {
      return reply.code(401).send({ error: 'Invalid token' })
    }
    let payload: JwtPayload
    try {
      payload = verifyRefreshToken(refreshToken)
    } catch {
      return reply.code(401).send({ error: 'Invalid token' })
    }
    const accessToken = signAccessToken({
      userId: payload.userId,
      clinicId: payload.clinicId,
      role: payload.role,
      email: payload.email,
    })
    return { accessToken }
  })

  app.post('/logout', async (request, reply) => {
    const parsed = validate(logoutSchema, request.body, reply)
    if (!parsed.ok) return
    // Idempotent: revoke whatever was supplied; a malformed token is simply a no-op.
    try {
      verifyRefreshToken(parsed.data.refreshToken)
      await blacklistRefreshToken(parsed.data.refreshToken, REFRESH_TTL_SECONDS)
    } catch {
      // ignore invalid/expired tokens
    }
    return { success: true }
  })
}

export default authRoute
