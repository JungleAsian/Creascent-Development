import type { Sql } from '../client.js'
import { toJson } from '../client.js'
import type {
  Appointment,
  AppointmentStatus,
  AppointmentEvent,
  AppointmentEventType,
  Provider,
  Service,
  ProviderAvailability,
} from '../types/index.js'

export interface CreateAppointmentInput {
  clinicId: string
  patientId: string
  providerId: string
  serviceId?: string
  conversationId?: string
  startTime: string
  endTime: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface UpdateAppointmentInput {
  status?: AppointmentStatus
  googleEventId?: string
  startTime?: string
  endTime?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface CreateProviderInput {
  clinicId: string
  fullName: string
  email?: string
  specialty?: string
  googleCalendarId?: string
  metadata?: Record<string, unknown>
}

export interface CreateServiceInput {
  clinicId: string
  name: string
  description?: string
  durationMinutes?: number
  price?: number
  currency?: string
  metadata?: Record<string, unknown>
}

export interface AppointmentsRepository {
  findById(clinicId: string, id: string): Promise<Appointment | null>
  listByClinic(clinicId: string, status?: AppointmentStatus): Promise<Appointment[]>
  listByPatient(clinicId: string, patientId: string): Promise<Appointment[]>
  listByProvider(clinicId: string, providerId: string, from: string, to: string): Promise<Appointment[]>
  create(data: CreateAppointmentInput): Promise<Appointment>
  update(clinicId: string, id: string, data: UpdateAppointmentInput): Promise<Appointment>
  addEvent(clinicId: string, appointmentId: string, eventType: AppointmentEventType, actorId?: string): Promise<AppointmentEvent>
  listEvents(clinicId: string, appointmentId: string): Promise<AppointmentEvent[]>

  listProviders(clinicId: string): Promise<Provider[]>
  createProvider(data: CreateProviderInput): Promise<Provider>
  listAvailability(clinicId: string, providerId: string): Promise<ProviderAvailability[]>

  listServices(clinicId: string): Promise<Service[]>
  createService(data: CreateServiceInput): Promise<Service>
}

export function createAppointmentsRepository(sql: Sql): AppointmentsRepository {
  return {
    async findById(clinicId, id) {
      const rows = await sql<Appointment[]>`
        SELECT * FROM appointments WHERE clinic_id = ${clinicId} AND id = ${id} LIMIT 1
      `
      return rows[0] ?? null
    },

    async listByClinic(clinicId, status) {
      if (status) {
        return sql<Appointment[]>`
          SELECT * FROM appointments WHERE clinic_id = ${clinicId} AND status = ${status}
          ORDER BY start_time
        `
      }
      return sql<Appointment[]>`
        SELECT * FROM appointments WHERE clinic_id = ${clinicId} ORDER BY start_time
      `
    },

    async listByPatient(clinicId, patientId) {
      return sql<Appointment[]>`
        SELECT * FROM appointments WHERE clinic_id = ${clinicId} AND patient_id = ${patientId}
        ORDER BY start_time DESC
      `
    },

    async listByProvider(clinicId, providerId, from, to) {
      return sql<Appointment[]>`
        SELECT * FROM appointments
        WHERE clinic_id   = ${clinicId}
          AND provider_id = ${providerId}
          AND start_time >= ${from}::timestamptz
          AND end_time   <= ${to}::timestamptz
        ORDER BY start_time
      `
    },

    async create(data) {
      const rows = await sql<Appointment[]>`
        INSERT INTO appointments
          (clinic_id, patient_id, provider_id, service_id, conversation_id, start_time, end_time, notes, metadata)
        VALUES (
          ${data.clinicId},
          ${data.patientId},
          ${data.providerId},
          ${data.serviceId      ?? null},
          ${data.conversationId ?? null},
          ${data.startTime}::timestamptz,
          ${data.endTime}::timestamptz,
          ${data.notes          ?? null},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      const appt = rows[0]!
      await this.addEvent(data.clinicId, appt.id, 'created')
      return appt
    },

    async update(clinicId, id, data) {
      const rows = await sql<Appointment[]>`
        UPDATE appointments SET
          status          = COALESCE(${data.status          ?? null}, status),
          google_event_id = COALESCE(${data.googleEventId  ?? null}, google_event_id),
          start_time      = COALESCE(${data.startTime      ?? null}::timestamptz, start_time),
          end_time        = COALESCE(${data.endTime        ?? null}::timestamptz, end_time),
          notes           = COALESCE(${data.notes          ?? null}, notes),
          metadata        = CASE WHEN ${data.metadata !== undefined} THEN ${sql.json(toJson(data.metadata ?? {}))} ELSE metadata END
        WHERE clinic_id = ${clinicId} AND id = ${id}
        RETURNING *
      `
      if (!rows[0]) throw new Error(`Appointment not found: ${id}`)
      return rows[0]
    },

    async addEvent(clinicId, appointmentId, eventType, actorId) {
      const rows = await sql<AppointmentEvent[]>`
        INSERT INTO appointment_events (appointment_id, clinic_id, event_type, actor_id)
        VALUES (${appointmentId}, ${clinicId}, ${eventType}, ${actorId ?? null})
        RETURNING *
      `
      return rows[0]!
    },

    async listEvents(clinicId, appointmentId) {
      return sql<AppointmentEvent[]>`
        SELECT * FROM appointment_events
        WHERE clinic_id = ${clinicId} AND appointment_id = ${appointmentId}
        ORDER BY created_at
      `
    },

    async listProviders(clinicId) {
      return sql<Provider[]>`
        SELECT * FROM providers WHERE clinic_id = ${clinicId} AND is_active = TRUE ORDER BY full_name
      `
    },

    async createProvider(data) {
      const rows = await sql<Provider[]>`
        INSERT INTO providers (clinic_id, full_name, email, specialty, google_calendar_id, metadata)
        VALUES (
          ${data.clinicId},
          ${data.fullName},
          ${data.email            ?? null},
          ${data.specialty        ?? null},
          ${data.googleCalendarId ?? null},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },

    async listAvailability(clinicId, providerId) {
      return sql<ProviderAvailability[]>`
        SELECT * FROM provider_availability
        WHERE clinic_id = ${clinicId} AND provider_id = ${providerId} AND is_active = TRUE
        ORDER BY day_of_week, start_time
      `
    },

    async listServices(clinicId) {
      return sql<Service[]>`
        SELECT * FROM services WHERE clinic_id = ${clinicId} AND is_active = TRUE ORDER BY name
      `
    },

    async createService(data) {
      const rows = await sql<Service[]>`
        INSERT INTO services (clinic_id, name, description, duration_minutes, price, currency, metadata)
        VALUES (
          ${data.clinicId},
          ${data.name},
          ${data.description     ?? null},
          ${data.durationMinutes ?? 30},
          ${data.price           ?? null},
          ${data.currency        ?? 'GTQ'},
          ${sql.json(toJson(data.metadata ?? {}))}
        )
        RETURNING *
      `
      return rows[0]!
    },
  }
}
