import { describe, it, expect, vi } from 'vitest'
import {
  renderTranscript,
  lastPatientMessage,
  parseSuggestions,
  summarizeConversation,
  suggestReplies,
  type AssistantMessage,
} from '../assistant/inbox-assistant.js'

const convo: AssistantMessage[] = [
  { role: 'user', content: 'Hola, ¿cuánto cuesta una limpieza dental?' },
  { role: 'assistant', content: 'Con gusto le ayudo.' },
  { role: 'agent', content: 'Tomo el caso.' },
  { role: 'user', content: '¿Tienen cita el viernes?' },
]

describe('renderTranscript', () => {
  it('labels each role and joins lines (ES)', () => {
    const out = renderTranscript(convo, 'es')
    expect(out).toContain('Paciente: Hola, ¿cuánto cuesta una limpieza dental?')
    expect(out).toContain('Bot: Con gusto le ayudo.')
    expect(out).toContain('Personal: Tomo el caso.')
  })

  it('labels staff differently in EN', () => {
    const out = renderTranscript([{ role: 'agent', content: 'Got it.' }], 'en')
    expect(out).toBe('Staff: Got it.')
  })

  it('drops empty messages', () => {
    const out = renderTranscript([{ role: 'user', content: '   ' }], 'es')
    expect(out).toBe('')
  })
})

describe('lastPatientMessage', () => {
  it('returns the most recent user message, ignoring bot/staff', () => {
    expect(lastPatientMessage(convo)).toBe('¿Tienen cita el viernes?')
  })

  it('returns null when the patient has not spoken', () => {
    expect(lastPatientMessage([{ role: 'assistant', content: 'Hi' }])).toBeNull()
  })
})

describe('parseSuggestions', () => {
  it('splits on the ~~~ delimiter and trims', () => {
    expect(parseSuggestions('Draft one ~~~ Draft two ~~~ Draft three')).toEqual([
      'Draft one',
      'Draft two',
      'Draft three',
    ])
  })

  it('strips stray leading numbering / bullets', () => {
    expect(parseSuggestions('1. First ~~~ - Second ~~~ • Third')).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('caps at MAX_SUGGESTIONS (3)', () => {
    expect(parseSuggestions('a ~~~ b ~~~ c ~~~ d ~~~ e')).toEqual(['a', 'b', 'c'])
  })

  it('treats a delimiter-free response as a single suggestion', () => {
    expect(parseSuggestions('STUB_RESPONSE')).toEqual(['STUB_RESPONSE'])
  })

  it('drops blank parts', () => {
    expect(parseSuggestions('only ~~~   ~~~')).toEqual(['only'])
  })
})

describe('summarizeConversation', () => {
  it('builds a staff-only summary prompt and returns the completion (never sends)', async () => {
    const complete = vi.fn().mockResolvedValue('  Patient asks about cleaning price and Friday slot.  ')
    const searchKb = vi.fn()
    const result = await summarizeConversation(convo, 'es', { complete, searchKb })

    expect(result.summary).toBe('Patient asks about cleaning price and Friday slot.')
    expect(searchKb).not.toHaveBeenCalled() // summary never touches the KB
    const [system, user] = complete.mock.calls[0]!
    expect(system).toContain('STAFF ONLY')
    expect(system).toContain('Spanish')
    expect(user).toContain('Paciente: Hola')
  })
})

describe('suggestReplies', () => {
  it('searches the KB with the last patient message and grounds the prompt', async () => {
    const searchKb = vi
      .fn()
      .mockResolvedValue([{ title: 'Precios', content: 'Limpieza: $50', similarity: 0.91 }])
    const complete = vi.fn().mockResolvedValue('Sí, $50 ~~~ Tenemos viernes a las 10')

    const result = await suggestReplies(
      { messages: convo, clinicName: 'Clínica Sol', rulesText: 'Sé amable', language: 'es' },
      { searchKb, complete },
    )

    expect(searchKb).toHaveBeenCalledWith('¿Tienen cita el viernes?')
    expect(result.suggestions).toEqual(['Sí, $50', 'Tenemos viernes a las 10'])
    expect(result.sources).toEqual([{ title: 'Precios', similarity: 0.91 }])

    const [system] = complete.mock.calls[0]!
    expect(system).toContain('Clínica Sol')
    expect(system).toContain('Limpieza: $50') // KB context injected
    expect(system).toContain('Sé amable') // clinic rules injected
    expect(system).toContain('NEVER diagnose') // medical safety preserved
  })

  it('skips KB search when there is no patient message', async () => {
    const searchKb = vi.fn()
    const complete = vi.fn().mockResolvedValue('draft')
    const result = await suggestReplies(
      { messages: [{ role: 'agent', content: 'note' }], clinicName: 'X', rulesText: null, language: 'en' },
      { searchKb, complete },
    )
    expect(searchKb).not.toHaveBeenCalled()
    expect(result.sources).toEqual([])
    expect(result.suggestions).toEqual(['draft'])
  })
})
