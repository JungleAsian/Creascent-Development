// Only file permitted to import googleapis (enforced by ESLint no-direct-googleapis rule)
import type { CalendarClient } from '../index.js'

export function createGoogleCalendarClient(_config: {
  clientId: string
  clientSecret: string
}): CalendarClient {
  throw new Error('GoogleCalendarClient: not implemented — add googleapis in P07+')
}
