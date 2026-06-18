export type AgentRoute = 'booking' | 'reschedule' | 'cancel' | 'faq' | 'handoff'

export interface AgentContext {
  clinicId: string
  conversationId: string
  patientPhone: string
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AgentResult {
  route: AgentRoute
  response: string
  requiresHandoff: boolean
  appointmentData?: AppointmentData
}

export interface AppointmentData {
  date: string
  time: string
  doctorId: string
  patientName?: string
}

export interface CalendarClient {
  listSlots(doctorId: string, date: string): Promise<string[]>
  bookAppointment(data: AppointmentData): Promise<string>
  cancelAppointment(appointmentId: string): Promise<void>
  rescheduleAppointment(appointmentId: string, newData: AppointmentData): Promise<string>
}

export { createGoogleCalendarClient } from './calbot/google-calendar-client.js'

export async function routeMessage(_context: AgentContext): Promise<AgentResult> {
  throw new Error('routeMessage: not implemented — wire LLM router in P05+')
}
