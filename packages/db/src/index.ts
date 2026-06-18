export type ConversationStatus = 'open' | 'assigned' | 'resolved' | 'handoff'

export interface Conversation {
  id: string
  clinicId: string
  patientPhone: string
  status: ConversationStatus
  assignedTo: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  audioUrl: string | null
  transcription: string | null
  createdAt: string
}

export interface ConversationRepo {
  findById(id: string): Promise<Conversation | null>
  findByClinic(clinicId: string): Promise<Conversation[]>
  countActive(clinicId: string): Promise<number>
  create(data: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation>
  update(id: string, data: Partial<Conversation>): Promise<Conversation>
}

export interface MessageRepo {
  findByConversation(conversationId: string): Promise<Message[]>
  create(data: Omit<Message, 'id' | 'createdAt'>): Promise<Message>
}

export function createConversationRepo(_client: unknown): ConversationRepo {
  throw new Error('ConversationRepo: not implemented — requires DbClient (P02+)')
}

export function createMessageRepo(_client: unknown): MessageRepo {
  throw new Error('MessageRepo: not implemented — requires DbClient (P02+)')
}
