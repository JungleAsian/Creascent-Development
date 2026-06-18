// Multi-tenant clinic scoping (P08). Non-admin users may only touch their own
// clinic's data; ia_studio_admin may target any clinic. Returns the clinic id the
// request is allowed to act on, or null when access is forbidden.
import type { FastifyRequest } from 'fastify'

export function resolveClinicScope(request: FastifyRequest, requestedClinicId?: string): string | null {
  const user = request.user
  if (!user) return null
  if (user.role === 'ia_studio_admin') {
    return requestedClinicId ?? user.clinicId
  }
  if (requestedClinicId && requestedClinicId !== user.clinicId) {
    return null
  }
  return user.clinicId
}
