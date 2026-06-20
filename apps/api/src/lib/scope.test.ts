import { describe, it, expect } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { resolveClinicScope } from './scope.js'
import type { JwtPayload } from '../auth/jwt.js'

// resolveClinicScope only reads request.user + request.headers, so a structural
// stub is enough — no Fastify instance required.
function req(user: JwtPayload | undefined, headers: Record<string, string> = {}): FastifyRequest {
  return { user, headers } as unknown as FastifyRequest
}

const secretary: JwtPayload = { userId: 'u-1', clinicId: 'c-1', role: 'secretary', email: 's@demo.test' }
const admin: JwtPayload = { userId: 'a-1', clinicId: 'c-1', role: 'ia_studio_admin', email: 'a@demo.test' }

describe('resolveClinicScope', () => {
  it('unauthenticated → null', () => {
    expect(resolveClinicScope(req(undefined))).toBeNull()
  })

  it('non-admin with no hint → own clinic', () => {
    expect(resolveClinicScope(req(secretary))).toBe('c-1')
  })

  it('non-admin requesting own clinic → own clinic', () => {
    expect(resolveClinicScope(req(secretary), 'c-1')).toBe('c-1')
  })

  it('non-admin requesting a foreign clinic → null (forbidden)', () => {
    expect(resolveClinicScope(req(secretary), 'c-2')).toBeNull()
  })

  it('non-admin with a foreign X-Clinic-Id header → null (no privilege escalation)', () => {
    expect(resolveClinicScope(req(secretary, { 'x-clinic-id': 'c-2' }))).toBeNull()
  })

  it('non-admin with own-clinic header → own clinic', () => {
    expect(resolveClinicScope(req(secretary, { 'x-clinic-id': 'c-1' }))).toBe('c-1')
  })

  it('admin with no hint → own clinic', () => {
    expect(resolveClinicScope(req(admin))).toBe('c-1')
  })

  it('admin may target any clinic via the active-clinic header', () => {
    expect(resolveClinicScope(req(admin, { 'x-clinic-id': 'c-9' }))).toBe('c-9')
  })

  it('an explicit route param wins over the header', () => {
    expect(resolveClinicScope(req(admin, { 'x-clinic-id': 'c-9' }), 'c-3')).toBe('c-3')
  })

  it('an empty header is ignored (falls back to own clinic)', () => {
    expect(resolveClinicScope(req(admin, { 'x-clinic-id': '' }))).toBe('c-1')
  })
})
