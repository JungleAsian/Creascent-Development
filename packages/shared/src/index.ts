export type ID = string

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error }
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type Timestamps = {
  createdAt: string
  updatedAt: string
}

export type Tag = {
  id: ID
  name: string
  color: string
  clinicId: ID
}

export type PatientStatus = 'new' | 'returning'

export type InternalNote = {
  id: ID
  conversationId: ID
  authorId: ID
  content: string
  createdAt: string
}

export type EncryptedValue = {
  ciphertext: string
  iv: string
  tag: string
}
