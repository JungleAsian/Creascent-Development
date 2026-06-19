// calbot — the appointment scheduling agent. Pure flow logic with injected
// Google Calendar + persistence side effects (mirrors the botbase pattern).

export {
  getOAuth2Client,
  listAvailableSlots,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  computeFreeSlots,
  createGoogleCalendarOps,
  createGoogleCalendarClient,
  type CalendarOps,
  type TimeSlot,
  type CreateEventParams,
  type GoogleCalendarConfig,
  type RefreshedTokens,
} from './google-calendar-client.js'

export {
  parseDate,
  parseTime,
  isAffirmative,
  isNegative,
  matchProvider,
  formatSlotLabel,
  pick,
  type ClinicInfo,
  type ProviderRef,
  type UpcomingAppointment,
} from './shared.js'

export {
  advanceBookingFlow,
  initialBookingState,
  type BookingStep,
  type BookingState,
  type BookingContext,
  type BookingDeps,
  type FlowResult,
} from './booking-flow.js'

export {
  advanceRescheduleFlow,
  initialRescheduleState,
  type RescheduleStep,
  type RescheduleState,
  type RescheduleContext,
  type RescheduleDeps,
  type RescheduleResult,
} from './reschedule-flow.js'

export {
  advanceCancelFlow,
  initialCancelState,
  type CancelStep,
  type CancelState,
  type CancelContext,
  type CancelDeps,
  type CancelResult,
} from './cancel-flow.js'

export {
  buildStatusReply,
  advanceStatusFlow,
  type StatusContext,
  type StatusResult,
} from './status-flow.js'
