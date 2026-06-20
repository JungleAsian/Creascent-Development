// Multi-tenant clinic scoping (P08, extended Screen 6). Non-admin users may only
// touch their own clinic's data; ia_studio_admin may target any clinic. Returns the
// clinic id the request is allowed to act on, or null when access is forbidden.
//
// Screen 6 (clinic switching): when a route carries no explicit clinic id, fall
// back to the `X-Clinic-Id` header the panel sends — the "active clinic" the
// operator is working in. This lets an ia_studio_admin drive the operational inbox
// (and any clinic-scoped surface) for *any* clinic without every route growing a
// clinic_id param. Non-admins remain pinned to their own clinic below, so a spoofed
// header naming a foreign clinic is rejected (→ caller returns 403).
import type { FastifyRequest } from 'fastify'

function headerClinicId(request: FastifyRequest): string | undefined {
  const value = request.headers['x-clinic-id']
  const id = Array.isArray(value) ? value[0] : value
  return id && id.length > 0 ? id : undefined
}

export function resolveClinicScope(request: FastifyRequest, requestedClinicId?: string): string | null {
  const user = request.user
  if (!user) return null
  // An explicit route param/query wins; otherwise honour the active-clinic header.
  const requested = requestedClinicId ?? headerClinicId(request)
  if (user.role === 'ia_studio_admin') {
    return requested ?? user.clinicId
  }
  if (requested && requested !== user.clinicId) {
    return null
  }
  return user.clinicId
}
