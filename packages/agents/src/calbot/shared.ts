// Shared helpers for the calbot scheduling flows (book / reschedule / cancel /
// status). Parsing is deterministic so every flow advances identically under
// LLM_STUB and in tests — no model call is needed to fill a date or a time.
import type { Language } from '../botbase/language-detector.js'
import type { DoctorAvailability } from './doctor-availability.js'

export type { Language }

export interface ClinicInfo {
  name: string
  timezone: string
}

export interface ProviderRef {
  id: string
  fullName: string
  /** Doctor/provider specialty, captured into the patient intake on booking (Req 10). */
  specialty?: string | null
  /** Per-doctor working hours (Req 30); when set, restricts the bookable slots. */
  availability?: DoctorAvailability
}

/** A patient's existing upcoming appointment, as the flows need to see it. */
export interface UpcomingAppointment {
  id: string
  providerId: string
  providerName: string
  date: string // YYYY-MM-DD (clinic-local)
  time: string // HH:MM
  googleEventId: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Extract a `YYYY-MM-DD` date from free text. Understands ISO dates and
 * `DD/MM` or `DD/MM/YYYY`. Returns null when nothing date-like is present.
 */
export function parseDate(text: string, year = new Date().getUTCFullYear()): string | null {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    let y = dmy[3] ? Number(dmy[3]) : year
    if (y < 100) y += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${y}-${pad(month)}-${pad(day)}`
    }
  }
  return null
}

/**
 * Extract a 24h `HH:MM` time from free text. Understands `15:00`, `3pm`,
 * `3 pm`, `3:30pm`. Returns null when no time is present.
 */
export function parseTime(text: string): string | null {
  const lower = text.toLowerCase()
  const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] ? Number(m[2]) : 0
  const meridiem = m[3]
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null
  // A bare number with no colon and no am/pm that looks like a date fragment is
  // still treated as an hour — callers ask for a time only when they expect one.
  return `${pad(hour)}:${pad(minute)}`
}

// Token-based matching — `\b` is ASCII-only and breaks on accented words like
// "sí", so we split on any non-letter and compare whole tokens instead.
// NOTE: 'cancelar' is deliberately NOT a negative word — in the cancel flow it is
// the affirmative action ("sí, cancelar"). Negation here means *declining* the
// prompt (keep things as they are / pick a different time).
const AFFIRMATIVE_WORDS = new Set([
  'sí', 'si', 'yes', 'yeah', 'yep', 'ok', 'okay', 'vale', 'dale', 'claro',
  'confirmo', 'confirmar', 'confirm', 'confirmada', 'confirmado', 'correcto',
  'perfecto', 'proceda', 'adelante',
])
const NEGATIVE_WORDS = new Set([
  'no', 'nope', 'cambiar', 'change', 'distinto', 'distinta', 'different',
  'déjala', 'dejala', 'déjalo', 'dejalo', 'negativo',
])

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-záéíóúñü]+/i)
    .filter(Boolean)
}

export function isAffirmative(text: string): boolean {
  return words(text).some((w) => AFFIRMATIVE_WORDS.has(w))
}

export function isNegative(text: string): boolean {
  return words(text).some((w) => NEGATIVE_WORDS.has(w))
}

/** Match a provider by a (case-insensitive, partial) name mention. */
export function matchProvider(text: string, providers: ProviderRef[]): ProviderRef | null {
  const lower = text.toLowerCase()
  for (const p of providers) {
    const name = p.fullName.toLowerCase()
    if (lower.includes(name)) return p
    // Also match on any single name token (e.g. "García") of length 3+.
    if (name.split(/\s+/).some((part) => part.length >= 3 && lower.includes(part))) return p
  }
  return null
}

/** Format a slot's start as a human `YYYY-MM-DD HH:MM` for confirmation text. */
export function formatSlotLabel(date: string, time: string): string {
  return `${date} ${time}`
}

export function pick(language: Language, es: string, en: string): string {
  return language === 'en' ? en : es
}
