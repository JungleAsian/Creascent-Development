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
