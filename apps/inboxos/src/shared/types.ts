// Frontend-facing shapes. These mirror the API JSON responses (a subset of the
// @docmee/db row types) — kept local so the Next app has no workspace dependency
// on the database package.

export type PanelRole = 'secretary' | 'doctor' | 'clinic_admin' | 'ia_studio_admin'
export type PanelLanguage = 'es' | 'en'

export interface AuthUser {
  id: string
  email: string
  role: PanelRole
  clinicId: string
}

export type ConversationStatus = 'open' | 'assigned' | 'resolved' | 'handoff'
export type Channel = 'whatsapp' | 'messenger' | 'instagram'
export type MessageRole = 'user' | 'assistant' | 'system' | 'agent'
export type ContentType = 'text' | 'audio' | 'image' | 'template' | 'interactive'

export interface Conversation {
  id: string
  clinicId: string
  patientId: string | null
  channel: Channel
  channelContactHandle: string
  status: ConversationStatus
  assignedTo: string | null
  iaProfileId: string | null
  lastMessageAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  clinicId: string
  role: MessageRole
  content: string
  contentType: ContentType
  transcription: string | null
  createdAt: string
  metadata: Record<string, unknown>
}

export interface Tag {
  id: string
  clinicId: string
  name: string
  color: string
  createdAt: string
}

export interface Note {
  id: string
  conversationId: string
  clinicId: string
  authorId: string
  content: string
  createdAt: string
}

export interface TeamMember {
  id: string
  fullName: string | null
  email: string
  status: string
}

// ── Quick reply templates (P16 — Gap #25) ──────────────────────────────────────
export interface QuickReplyTemplate {
  id: string
  clinicId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

// ── WhatsApp message templates (P16 — Gap #29) ─────────────────────────────────
export type MessageTemplateStatus = 'pending' | 'approved' | 'rejected'
export type MessageTemplateCategory =
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'human_handoff_notification'

export interface MessageTemplate {
  id: string
  clinicId: string
  name: string
  category: MessageTemplateCategory
  language: string
  body: string
  status: MessageTemplateStatus
  createdAt: string
  updatedAt: string
}

// ── Patient history (P16 — Gap #26) ────────────────────────────────────────────
export type PatientStatus = 'new' | 'returning' | 'archived'

export interface Patient {
  id: string
  clinicId: string
  fullName: string | null
  status: PatientStatus
  notes: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export interface Appointment {
  id: string
  clinicId: string
  patientId: string
  providerId: string
  status: AppointmentStatus
  startTime: string
  endTime: string
  notes: string | null
  createdAt: string
}

// ── Metrics dashboard (P16 — Gap #27) ──────────────────────────────────────────
export interface ClinicMetrics {
  conversationsToday: number
  messagesToday: number
  botReplyRate: number
  avgResponseSeconds: number
  conversationsPerDay: Array<{ date: string; count: number }>
  topIntents: Array<{ intent: string; count: number }>
}

export type ClinicPlan = 'starter' | 'pro' | 'enterprise'
export type ClinicStatus = 'active' | 'suspended' | 'cancelled'

export interface Clinic {
  id: string
  name: string
  slug: string
  plan: ClinicPlan
  status: ClinicStatus
  timezone: string
  settings: Record<string, unknown>
  // P14 — Facebook Messenger connection. The access token is write-only and is
  // never sent back to the panel, so it is not exposed here.
  messengerPageId?: string | null
  messengerWebhookVerifyToken?: string | null
  messengerEnabled?: boolean
  // P15 — Instagram Direct connection. The access token is write-only and is
  // never sent back to the panel, so it is not exposed here.
  instagramAccountId?: string | null
  instagramWebhookVerifyToken?: string | null
  instagramEnabled?: boolean
  createdAt: string
  updatedAt: string
}

export type DocumentType = 'faq' | 'policy' | 'service_info' | 'custom'
export type DocumentStatus = 'active' | 'draft' | 'archived'

export interface KnowledgeDocument {
  id: string
  clinicId: string
  title: string
  content: string
  documentType: DocumentType
  status: DocumentStatus
  createdAt: string
  updatedAt: string
}

export type ErrorReviewStatus = 'open' | 'reviewed' | 'resolved' | 'ignored'

export interface ErrorReview {
  id: string
  clinicId: string | null
  errorType: string
  errorMessage: string
  stackTrace: string | null
  context: Record<string, unknown>
  status: ErrorReviewStatus
  createdAt: string
}

export interface ClinicStats {
  activeConversations: number
  totalPatients: number
  activeClinics?: number
}

// ── Bot configuration (stored in clinic.settings) ──────────────────────────────
export type BotTone = 'professional' | 'friendly' | 'brief'

export interface DayHours {
  open: string // 'HH:mm'
  close: string // 'HH:mm'
  closed?: boolean
}

/** Map of lowercase weekday ('monday' … 'sunday') → hours. Mirrors @docmee/agents. */
export type BusinessHours = Record<string, DayHours>

/** The subset of clinic.settings the IA Studio reads/writes. All keys optional. */
export interface ClinicSettings {
  botTone?: BotTone
  clinicRules?: string
  businessHours?: BusinessHours
  googleCalendar?: { calendarId?: string } & Record<string, unknown>
  license_key?: string
  [key: string]: unknown
}

// ── License (decoded by the API, display-only) ─────────────────────────────────
export type LicenseState = 'none' | 'active' | 'expired' | 'invalid'

export interface ClinicLicense {
  state: LicenseState
  clinicName?: string
  seats?: number
  issuedAt?: string
  expiresAt?: string
}

// ── AI usage (from ai_usage_events) ────────────────────────────────────────────
export interface ClinicUsage {
  clinicId: string
  totalCostUsd: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  eventCount: number
  byModel: Array<{ model: string; costUsd: number; totalTokens: number; eventCount: number }>
}

export interface ClinicUsageRow {
  clinicId: string
  clinicName: string
  totalCostUsd: number
  totalTokens: number
  eventCount: number
}

// ── P18 — Phase 3 ────────────────────────────────────────────────────────────────

/** A doctor (redacted — calendar tokens are never returned to the panel). */
export interface Doctor {
  id: string
  clinicId: string
  name: string
  specialty: string | null
  googleCalendarId: string | null
  availableDays: Record<string, unknown>
  isActive: boolean
  calendarConnected: boolean
  createdAt: string
  updatedAt: string
}

export type CustomFlowAction = 'book' | 'handoff' | 'end'
export type CustomFlowLanguage = 'es' | 'en' | 'both'

export interface CustomFlow {
  id: string
  clinicId: string
  name: string
  triggerKeywords: string[]
  messages: string[]
  action: CustomFlowAction | null
  language: CustomFlowLanguage
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AdvancedAnalytics {
  totalConversations: number
  resolutionRate: number
  avgConversationLength: number
  handoffRate: number
  kbHitRate: number
  newPatients: number
  returningPatients: number
  peakHours: Array<{ dayOfWeek: number; hour: number; count: number }>
}
