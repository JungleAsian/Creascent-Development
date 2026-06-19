// 8-step appointment booking state machine.
//
// One call = one inbound patient message → one reply, advancing the state by one
// (sometimes two) steps. The worker persists `nextState` between turns
// (conversations.metadata) and sends `reply`. Side effects — Google Calendar and
// the appointments table — are injected, so the whole flow is pure logic and is
// tested without a network or a database (and without an LLM: parsing is
// deterministic, see ./shared).
import type { CalendarOps, TimeSlot } from './google-calendar-client.js'
import {
  type Language,
  type ClinicInfo,
  type ProviderRef,
  parseDate,
  parseTime,
  isAffirmative,
  isNegative,
  matchProvider,
  pick,
} from './shared.js'

export type BookingStep =
  | 'confirm_doctor'
  | 'ask_reason'
  | 'ask_date'
  | 'ask_time'
  | 'check_availability'
  | 'confirm_details'
  | 'create_event'
  | 'send_confirmation'

export interface BookingState {
  step: BookingStep
  providerId?: string
  doctorName?: string
  specialty?: string | null
  reason?: string
  preferredDate?: string // YYYY-MM-DD
  preferredTime?: string // HH:MM
  confirmedSlot?: TimeSlot
  googleEventId?: string
}

export interface BookingContext {
  language: Language
  clinic: ClinicInfo
  providers: ProviderRef[]
  patientName: string | null
  serviceDurationMinutes?: number
}

export interface BookingDeps {
  calendar: CalendarOps
  // Req 10 (Patient Data Capture): the full intake collected during the flow is
  // handed to the worker so it can persist the doctor/specialty, reason and the
  // patient's preferred date/time onto the appointment and the patient record —
  // not just the calendar event.
  saveAppointment(input: {
    providerId: string
    doctorName: string | null
    specialty: string | null
    startTime: string
    endTime: string
    reason: string
    preferredDate: string
    preferredTime: string
    googleEventId: string
  }): Promise<void>
}

export interface FlowResult {
  nextState: BookingState
  reply: string
  /** Terminal: the appointment was created (or the flow handed off). */
  done: boolean
  /** Escalate to a human (e.g. no providers configured). */
  handoff?: boolean
}

export function initialBookingState(): BookingState {
  return { step: 'confirm_doctor' }
}

function slotStart(date: string, time: string): string {
  return `${date}T${time}:00`
}

function listProviderNames(providers: ProviderRef[]): string {
  return providers.map((p) => p.fullName).join(', ')
}

export async function advanceBookingFlow(
  state: BookingState,
  message: string,
  ctx: BookingContext,
  deps: BookingDeps,
): Promise<FlowResult> {
  const L = ctx.language
  const duration = ctx.serviceDurationMinutes ?? 30

  switch (state.step) {
    case 'confirm_doctor': {
      if (ctx.providers.length === 0) {
        return {
          nextState: state,
          reply: pick(L, 'Un miembro de nuestro equipo le ayudará a agendar su cita.', 'A team member will help you schedule your appointment.'),
          done: true,
          handoff: true,
        }
      }
      let provider: ProviderRef | null =
        ctx.providers.find((p) => p.id === state.providerId) ?? matchProvider(message, ctx.providers)
      if (!provider && ctx.providers.length === 1) provider = ctx.providers[0]!

      if (!provider) {
        return {
          nextState: { ...state, step: 'confirm_doctor' },
          reply: pick(
            L,
            `¿Con qué doctor desea agendar? Disponibles: ${listProviderNames(ctx.providers)}.`,
            `Which doctor would you like to see? Available: ${listProviderNames(ctx.providers)}.`,
          ),
          done: false,
        }
      }
      return {
        nextState: {
          ...state,
          step: 'ask_reason',
          providerId: provider.id,
          doctorName: provider.fullName,
          specialty: provider.specialty ?? null,
        },
        reply: pick(
          L,
          `Perfecto, ${provider.fullName}. ¿Cuál es el motivo de la consulta?`,
          `Great, ${provider.fullName}. What is the reason for your visit?`,
        ),
        done: false,
      }
    }

    case 'ask_reason': {
      const reason = message.trim()
      if (!reason) {
        return {
          nextState: state,
          reply: pick(L, '¿Cuál es el motivo de la consulta?', 'What is the reason for your visit?'),
          done: false,
        }
      }
      return {
        nextState: { ...state, step: 'ask_date', reason },
        reply: pick(L, '¿Qué día prefiere? (formato AAAA-MM-DD)', 'Which day do you prefer? (format YYYY-MM-DD)'),
        done: false,
      }
    }

    case 'ask_date': {
      const date = parseDate(message)
      if (!date) {
        return {
          nextState: state,
          reply: pick(
            L,
            'No entendí la fecha. Por favor indíquela como AAAA-MM-DD.',
            "I didn't understand the date. Please send it as YYYY-MM-DD.",
          ),
          done: false,
        }
      }
      return {
        nextState: { ...state, step: 'ask_time', preferredDate: date },
        reply: pick(L, '¿A qué hora le gustaría? (por ejemplo 10:00)', 'What time would you like? (e.g. 10:00)'),
        done: false,
      }
    }

    case 'ask_time':
    case 'check_availability': {
      const time = parseTime(message)
      const date = state.preferredDate
      if (!time || !date) {
        return {
          nextState: { ...state, step: 'ask_time' },
          reply: pick(L, '¿A qué hora le gustaría? (por ejemplo 10:00)', 'What time would you like? (e.g. 10:00)'),
          done: false,
        }
      }

      // Double-booking protection: only times that are actually free this day pass.
      const slots = await deps.calendar.listSlots(date)
      const wantStart = slotStart(date, time)
      const match = slots.find((s) => s.start === wantStart)

      if (!match) {
        const alternatives = slots.slice(0, 4).map((s) => s.start.slice(11, 16))
        const altText = alternatives.length
          ? alternatives.join(', ')
          : pick(L, 'no hay horarios libres ese día', 'no free times that day')
        return {
          nextState: { ...state, step: 'ask_time', preferredTime: undefined },
          reply: pick(
            L,
            `Esa hora no está disponible. Horarios libres: ${altText}. ¿Cuál prefiere?`,
            `That time isn't available. Free times: ${altText}. Which works for you?`,
          ),
          done: false,
        }
      }

      return {
        nextState: { ...state, step: 'confirm_details', preferredTime: time, confirmedSlot: match },
        reply: pick(
          L,
          `Confirmo: ${state.doctorName} el ${date} a las ${time}. ¿Está correcto? (sí/no)`,
          `To confirm: ${state.doctorName} on ${date} at ${time}. Is that correct? (yes/no)`,
        ),
        done: false,
      }
    }

    case 'confirm_details':
    case 'create_event':
    case 'send_confirmation': {
      if (isNegative(message) && !isAffirmative(message)) {
        return {
          nextState: { ...state, step: 'ask_date', preferredTime: undefined, confirmedSlot: undefined },
          reply: pick(L, 'Sin problema. ¿Qué otro día prefiere? (AAAA-MM-DD)', 'No problem. Which other day do you prefer? (YYYY-MM-DD)'),
          done: false,
        }
      }
      if (!isAffirmative(message)) {
        return {
          nextState: state,
          reply: pick(L, 'Por favor confirme con "sí" o "no".', 'Please confirm with "yes" or "no".'),
          done: false,
        }
      }

      const slot = state.confirmedSlot
      if (!slot || !state.providerId || !state.preferredDate || !state.preferredTime) {
        // Defensive: lost state → restart date selection rather than book garbage.
        return {
          nextState: { ...state, step: 'ask_date' },
          reply: pick(L, '¿Qué día prefiere? (AAAA-MM-DD)', 'Which day do you prefer? (YYYY-MM-DD)'),
          done: false,
        }
      }

      const title = pick(
        L,
        `Cita: ${ctx.patientName ?? 'Paciente'} con ${state.doctorName}`,
        `Appointment: ${ctx.patientName ?? 'Patient'} with ${state.doctorName}`,
      )
      const eventId = await deps.calendar.createEvent({
        title,
        date: state.preferredDate,
        time: state.preferredTime,
        durationMinutes: duration,
        description: state.reason,
      })
      await deps.saveAppointment({
        providerId: state.providerId,
        doctorName: state.doctorName ?? null,
        specialty: state.specialty ?? null,
        startTime: slot.start,
        endTime: slot.end,
        reason: state.reason ?? '',
        preferredDate: state.preferredDate,
        preferredTime: state.preferredTime,
        googleEventId: eventId,
      })

      return {
        nextState: { ...state, step: 'send_confirmation', googleEventId: eventId },
        reply: pick(
          L,
          `¡Listo! Su cita con ${state.doctorName} quedó agendada para el ${state.preferredDate} a las ${state.preferredTime}. Le esperamos en ${ctx.clinic.name}.`,
          `Done! Your appointment with ${state.doctorName} is booked for ${state.preferredDate} at ${state.preferredTime}. We look forward to seeing you at ${ctx.clinic.name}.`,
        ),
        done: true,
      }
    }
  }
}
