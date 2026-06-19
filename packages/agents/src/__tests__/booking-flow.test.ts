import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  advanceBookingFlow,
  initialBookingState,
  type BookingContext,
  type BookingDeps,
  type BookingState,
} from '../calbot/booking-flow.js'
import type { CalendarOps, TimeSlot } from '../calbot/google-calendar-client.js'

const DATE = '2026-07-01'

function slotsFor(times: string[]): TimeSlot[] {
  return times.map((t) => ({ start: `${DATE}T${t}:00`, end: `${DATE}T${t}:30` }))
}

function makeCalendar(over: Partial<CalendarOps> = {}): CalendarOps {
  return {
    listSlots: vi.fn().mockResolvedValue(slotsFor(['09:00', '10:00', '10:30'])),
    createEvent: vi.fn().mockResolvedValue('evt_123'),
    updateEvent: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

function makeDeps(calendar: CalendarOps): BookingDeps {
  return { calendar, saveAppointment: vi.fn().mockResolvedValue(undefined) }
}

const ctx: BookingContext = {
  language: 'es',
  clinic: { name: 'Clínica Demo', timezone: 'America/Guatemala' },
  providers: [{ id: 'prov-1', fullName: 'Dra. García', specialty: 'Pediatría' }],
  patientName: 'Ana',
}

beforeEach(() => vi.clearAllMocks())

describe('advanceBookingFlow (LLM_STUB)', () => {
  beforeEach(() => {
    process.env['LLM_STUB'] = 'true'
  })

  it('advances through all 8 steps and books the appointment', async () => {
    const calendar = makeCalendar()
    const deps = makeDeps(calendar)
    let state: BookingState = initialBookingState()

    // confirm_doctor (single provider auto-picked) → asks reason
    let r = await advanceBookingFlow(state, 'quiero una cita', ctx, deps)
    expect(r.nextState.step).toBe('ask_reason')
    expect(r.nextState.providerId).toBe('prov-1')
    state = r.nextState

    // ask_reason → ask_date
    r = await advanceBookingFlow(state, 'control general', ctx, deps)
    expect(r.nextState.step).toBe('ask_date')
    expect(r.nextState.reason).toBe('control general')
    state = r.nextState

    // ask_date → ask_time
    r = await advanceBookingFlow(state, `el ${DATE}`, ctx, deps)
    expect(r.nextState.step).toBe('ask_time')
    expect(r.nextState.preferredDate).toBe(DATE)
    state = r.nextState

    // ask_time → check availability → confirm_details
    r = await advanceBookingFlow(state, '10:00', ctx, deps)
    expect(r.nextState.step).toBe('confirm_details')
    expect(r.nextState.confirmedSlot?.start).toBe(`${DATE}T10:00:00`)
    state = r.nextState

    // confirm_details → creates event + persists + confirmation
    r = await advanceBookingFlow(state, 'sí, confirmo', ctx, deps)
    expect(r.done).toBe(true)
    expect(r.nextState.googleEventId).toBe('evt_123')
    expect(calendar.createEvent).toHaveBeenCalledTimes(1)
    expect(deps.saveAppointment).toHaveBeenCalledTimes(1)
    // Req 10: the full intake collected during the flow is handed to the worker —
    // doctor + specialty, the reason, and the patient's preferred date/time.
    expect((deps.saveAppointment as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      providerId: 'prov-1',
      doctorName: 'Dra. García',
      specialty: 'Pediatría',
      reason: 'control general',
      preferredDate: DATE,
      preferredTime: '10:00',
      startTime: `${DATE}T10:00:00`,
      googleEventId: 'evt_123',
    })
  })

  it('prompts to choose when multiple providers and none named', async () => {
    const calendar = makeCalendar()
    const deps = makeDeps(calendar)
    const multi: BookingContext = {
      ...ctx,
      providers: [
        { id: 'prov-1', fullName: 'Dra. García' },
        { id: 'prov-2', fullName: 'Dr. López' },
      ],
    }
    const r = await advanceBookingFlow(initialBookingState(), 'hola', multi, deps)
    expect(r.nextState.step).toBe('confirm_doctor')
    expect(r.reply).toContain('García')
    expect(r.reply).toContain('López')
  })
})

describe('double-booking protection', () => {
  it('detects a conflict and offers alternative slots', async () => {
    // The requested 10:00 is NOT free; only 09:00 and 11:00 are.
    const calendar = makeCalendar({ listSlots: vi.fn().mockResolvedValue(slotsFor(['09:00', '11:00'])) })
    const deps = makeDeps(calendar)
    const state: BookingState = {
      step: 'ask_time',
      providerId: 'prov-1',
      doctorName: 'Dra. García',
      reason: 'control',
      preferredDate: DATE,
    }
    const r = await advanceBookingFlow(state, '10:00', ctx, deps)
    expect(r.done).toBe(false)
    expect(r.nextState.step).toBe('ask_time')
    expect(r.reply).toMatch(/09:00/)
    expect(r.reply).toMatch(/11:00/)
    expect(calendar.createEvent).not.toHaveBeenCalled()
    expect(deps.saveAppointment).not.toHaveBeenCalled()
  })
})
