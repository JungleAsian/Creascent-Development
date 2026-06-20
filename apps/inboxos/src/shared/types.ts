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

// Req 11: 7-state conversation lifecycle (mirrors @docmee/db).
export type ConversationStatus =
  | 'open'
  | 'pending'
  | 'assigned'
  | 'handoff'
  | 'snoozed'
  | 'resolved'
  | 'archived'
export type Channel = 'whatsapp' | 'messenger' | 'instagram'
export type MessageRole = 'user' | 'assistant' | 'system' | 'agent'
export type ContentType = 'text' | 'audio' | 'image' | 'template' | 'interactive'
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

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
  // Req 20: tag names linked to the thread, attached by GET /conversations so the
  // list can flag urgent/safety threads without a per-row fetch. Absent on the
  // single-conversation detail endpoint (the tag panel fetches those separately).
  tags?: string[]
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
  // Req 3: latest delivery state for an outbound message (sent/delivered/read/
  // failed). null/absent for inbound messages and sends with no receipt yet.
  deliveryStatus?: DeliveryStatus | null
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
  updatedAt: string
}

export interface TeamMember {
  id: string
  fullName: string | null
  email: string
  status: string
}

// ── Clinic users (Req 1 — IA Studio user management) ───────────────────────────
export type ClinicUserStatus = 'active' | 'inactive' | 'invited'
/** Roles assignable through per-clinic user management (ia_studio_admin excluded). */
export type AssignableRole = 'secretary' | 'doctor' | 'clinic_admin'

export interface ClinicUser {
  id: string
  clinicId: string
  email: string
  fullName: string | null
  status: ClinicUserStatus
  role: PanelRole
  panelLanguage: PanelLanguage
  lastSeen: string | null
  createdAt: string
  updatedAt: string
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
  | 'review_request'

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
  totalConversations: number
  conversationsByChannel: Array<{ channel: string; count: number }>
  leads: number
  bookings: number
  bookingConversionRate: number
  transferRate: number
  noResponseRate: number
  peakHours: Array<{ dayOfWeek: number; hour: number; count: number }>
}

// ── Quality of Service monitoring (Req 32) ─────────────────────────────────────
export interface QosAttentionItem {
  conversationId: string
  patientName: string
  status: string
  channel: string
  reason: 'upset' | 'abandoned' | 'unclosed'
  lastMessageAt: string | null
}

export interface ClinicQos {
  upsetPatients: number
  upsetUnresolved: number
  abandonedConversations: number
  avgBotResponseSeconds: number
  avgSecretaryResponseSeconds: number
  unclosedConversations: number
  unclosedAged: number
  followUpOpportunities: number
  pendingFollowUps: number
  staleHours: number
  attention: QosAttentionItem[]
}

// ── Automatic reports (Req 37) ──────────────────────────────────────────────────
export type ReportType = 'daily' | 'weekly'

/** List-row shape (no html body — fetched per report on open). */
export interface ReportSummary {
  id: string
  type: ReportType
  periodStart: string
  periodEnd: string
  subject: string
  recipientEmail: string | null
  emailed: boolean
  createdAt: string
}

export interface GeneratedReport extends ReportSummary {
  html: string
  data: Record<string, unknown>
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
  /** Per-doctor FAQ scope (Req 30): metadata.doctorId limits the doc to one doctor. */
  metadata?: { doctorId?: string | null } & Record<string, unknown>
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

// Bilingual bot (Req 22): the clinic-forced reply language. 'auto' detects the
// patient's language on the first message then follows it; 'es'/'en' force every
// reply into that language. Mirrors @docmee/agents BotLanguage / the worker's
// getClinicBotConfig, which reads this off the flat settings.botLanguage key.
export type BotLanguage = 'auto' | 'es' | 'en'

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
  botLanguage?: BotLanguage
  clinicRules?: string
  businessHours?: BusinessHours
  googleCalendar?: { calendarId?: string } & Record<string, unknown>
  googleSheets?: { spreadsheetId?: string; sheetName?: string; enabled?: boolean } & Record<
    string,
    unknown
  >
  // Meta Page-token expiry dates (Req 19). Set in the panel so the
  // conversation-processor can raise META_TOKEN_EXPIRING before the token lapses.
  // WhatsApp's expiry lives on channel_accounts.settings.tokenExpiresAt, not here.
  messengerTokenExpiresAt?: string
  instagramTokenExpiresAt?: string
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

/** Req 30: per-doctor weekly working hours. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export interface TimeRange {
  start: string // HH:MM
  end: string // HH:MM
}
export type DoctorAvailability = Partial<Record<Weekday, TimeRange[]>>

/** A doctor (redacted — calendar tokens are never returned to the panel). */
export interface Doctor {
  id: string
  clinicId: string
  name: string
  specialty: string | null
  googleCalendarId: string | null
  availableDays: DoctorAvailability
  isActive: boolean
  calendarConnected: boolean
  createdAt: string
  updatedAt: string
}

/** Req 30: a clinic service the bot can book (its duration sets the slot length). */
export interface Service {
  id: string
  clinicId: string
  name: string
  description: string | null
  durationMinutes: number
  price: string | null
  currency: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CustomFlowAction = 'book' | 'handoff' | 'end'
export type CustomFlowLanguage = 'es' | 'en' | 'both'
export type CustomFlowBranchOp = 'contains' | 'equals' | 'yes' | 'no' | 'any'

export interface CustomFlowBranch {
  op: CustomFlowBranchOp
  keywords?: string[]
  next: string
}

export interface CustomFlowStep {
  id: string
  messages: string[]
  branches?: CustomFlowBranch[]
  collect?: string | null
  next?: string | null
  action?: CustomFlowAction | null
}

export interface CustomFlow {
  id: string
  clinicId: string
  name: string
  triggerKeywords: string[]
  messages: string[]
  action: CustomFlowAction | null
  language: CustomFlowLanguage
  enabled: boolean
  steps: CustomFlowStep[]
  startStepId: string | null
  createdAt: string
  updatedAt: string
}

/** A prebuilt flow served by GET /clinics/:id/custom-flows/templates. */
export interface FlowTemplate {
  key: string
  name: string
  triggerKeywords: string[]
  language: CustomFlowLanguage
  startStepId: string
  steps: CustomFlowStep[]
  action?: CustomFlowAction | null
}

// ── Notifications (Req 24) ─────────────────────────────────────────────────────
/** Delivery channel a notification was routed to (mirrors @docmee/db). */
export type NotificationDeliveryType = 'email' | 'in_app'
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'acknowledged'

/** A row from the notification feed (GET /notifications). */
export interface NotificationEvent {
  id: string
  clinicId: string | null
  notificationType: NotificationDeliveryType
  recipient: string
  subject: string | null
  content: string
  status: NotificationStatus
  sentAt: string | null
  error: string | null
  conversationId: string | null
  alertType: string | null
  priority: string | null
  acknowledgedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** Per-user notification preferences (GET/PUT /user/notification-preferences). */
export interface NotificationPrefs {
  emailEnabled: boolean
  mutedTypes: string[]
}

export interface AdvancedAnalytics {
  totalConversations: number
  resolutionRate: number
  avgConversationLength: number
  handoffRate: number
  /** Fraction (0..1) of conversations resolved by the bot with no human handoff. */
  automationRate: number
  kbHitRate: number
  newPatients: number
  returningPatients: number
  peakHours: Array<{ dayOfWeek: number; hour: number; count: number }>
}

// Req 40: server feature flags, surfaced via GET /config so the panel can gate
// optional surfaces (e.g. the advanced analytics dashboard).
export interface Features {
  advancedAnalytics: boolean
}
