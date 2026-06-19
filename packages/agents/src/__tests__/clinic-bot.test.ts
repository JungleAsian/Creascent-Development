import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runClinicBot,
  isEmergencyMessage,
  isLikelyQuestion,
  emergencyNotice,
  resolveLanguage,
  type ClinicBotConfig,
  type ClinicBotInput,
  type ClinicBotDeps,
} from '../botbase/clinic-bot.js'

const clinic: ClinicBotConfig = {
  name: 'Clínica Demo',
  language: 'es',
  tone: 'professional',
  rulesText: null,
}

const baseInput = (over: Partial<ClinicBotInput> = {}): ClinicBotInput => ({
  clinicId: 'clinic-1',
  conversationId: 'conv-1',
  patientName: 'Ana',
  patientLanguage: 'es',
  isFirstMessage: false,
  message: 'hola, ¿a qué hora abren?',
  clinic,
  ...over,
})

const makeDeps = (over: Partial<ClinicBotDeps> = {}): ClinicBotDeps => ({
  searchKb: vi.fn().mockResolvedValue([]),
  complete: vi.fn().mockResolvedValue('Abrimos de 9 a 17.'),
  sendText: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn().mockResolvedValue(undefined),
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('isEmergencyMessage', () => {
  it('flags an emergency keyword', () => {
    expect(isEmergencyMessage('Tengo una emergencia')).toBe(true)
    expect(isEmergencyMessage('I have chest pain')).toBe(true)
  })

  it('does not flag a normal booking request', () => {
    expect(isEmergencyMessage('hola quiero una cita')).toBe(false)
  })
})

describe('isLikelyQuestion (Req 29 unanswered-question gate)', () => {
  it('flags messages ending with a question mark', () => {
    expect(isLikelyQuestion('¿Atienden los domingos?')).toBe(true)
    expect(isLikelyQuestion('Do you accept my insurance?')).toBe(true)
  })

  it('flags messages with question words but no punctuation', () => {
    expect(isLikelyQuestion('cuanto cuesta una limpieza dental')).toBe(true)
    expect(isLikelyQuestion('what are your opening hours')).toBe(true)
  })

  it('ignores short greetings and acknowledgements', () => {
    expect(isLikelyQuestion('ok gracias')).toBe(false)
    expect(isLikelyQuestion('hola')).toBe(false)
    expect(isLikelyQuestion('👍')).toBe(false)
  })
})

describe('emergencyNotice', () => {
  it('points the patient at emergency services in their language', () => {
    expect(emergencyNotice('es')).toContain('emergencia')
    expect(emergencyNotice('es')).toContain('número de emergencias')
    expect(emergencyNotice('en')).toContain('emergency number')
  })
})

describe('resolveLanguage', () => {
  it('a fixed clinic language overrides detection', () => {
    expect(resolveLanguage(baseInput({ clinic: { ...clinic, language: 'en' }, message: 'hola' }))).toBe('en')
  })

  it("'auto' detects on the first message", () => {
    expect(resolveLanguage(baseInput({ clinic: { ...clinic, language: 'auto' }, isFirstMessage: true, message: 'hello there' }))).toBe('en')
  })

  it("'auto' follows the stored patient language after the first message", () => {
    expect(resolveLanguage(baseInput({ clinic: { ...clinic, language: 'auto' }, isFirstMessage: false, patientLanguage: 'en' }))).toBe('en')
  })
})

describe('runClinicBot', () => {
  it('emergency → handoff, no reply sent', async () => {
    const deps = makeDeps()
    const result = await runClinicBot(baseInput({ message: 'no puedo respirar' }), deps)
    expect(result).toEqual({ replied: false, triggeredHandoff: true, language: 'es' })
    expect(deps.sendText).not.toHaveBeenCalled()
    expect(deps.complete).not.toHaveBeenCalled()
  })

  it('normal message → completes and replies', async () => {
    const deps = makeDeps()
    const result = await runClinicBot(baseInput(), deps)
    expect(result.replied).toBe(true)
    expect(result.triggeredHandoff).toBe(false)
    expect(deps.sendText).toHaveBeenCalledTimes(1)
    expect((deps.sendText as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('Abrimos')
  })

  it('first message → reply includes the STOP notice', async () => {
    const deps = makeDeps()
    await runClinicBot(baseInput({ isFirstMessage: true }), deps)
    const sent = (deps.sendText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(sent).toContain('Responde STOP')
  })

  it('later message → reply omits the STOP notice', async () => {
    const deps = makeDeps()
    await runClinicBot(baseInput({ isFirstMessage: false }), deps)
    const sent = (deps.sendText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(sent).not.toContain('STOP')
  })

  it('KB matches are injected into the system prompt', async () => {
    const deps = makeDeps({
      searchKb: vi.fn().mockResolvedValue([{ title: 'Horario', content: 'Lun-Vie 9-17', similarity: 0.9 }]),
    })
    await runClinicBot(baseInput(), deps)
    const system = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(system).toContain('Horario')
    expect(system).toContain('NEVER diagnose')
  })

  it('clinic rules are injected into the system prompt regardless of the query', async () => {
    const deps = makeDeps({ searchKb: vi.fn().mockResolvedValue([]) })
    const rulesText = 'Solo atendemos pacientes mayores de 18 años. No damos precios por chat.'
    // No KB match for this message → rules must still be present.
    await runClinicBot(baseInput({ clinic: { ...clinic, rulesText }, message: 'tienen estacionamiento?' }), deps)
    const system = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(system).toContain('CLINIC-SPECIFIC RULES')
    expect(system).toContain(rulesText)
  })

  it('omits the clinic-rules block when no rules are configured', async () => {
    const deps = makeDeps()
    await runClinicBot(baseInput({ clinic: { ...clinic, rulesText: null } }), deps)
    const system = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(system).not.toContain('CLINIC-SPECIFIC RULES')
  })

  it('applies the configured tone to the system prompt', async () => {
    const deps = makeDeps()
    await runClinicBot(baseInput({ clinic: { ...clinic, tone: 'brief' } }), deps)
    const system = (deps.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(system).toContain('Keep responses short')
  })

  it('LLM failure → logs the error, sends an apology, still reports replied', async () => {
    const deps = makeDeps({ complete: vi.fn().mockRejectedValue(new Error('boom')) })
    const result = await runClinicBot(baseInput(), deps)
    expect(result.replied).toBe(true)
    expect(deps.logError).toHaveBeenCalledTimes(1)
    expect((deps.logError as ReturnType<typeof vi.fn>).mock.calls[0]![0].errorType).toBe('llm_failure')
    const sent = (deps.sendText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(sent).toContain('problema técnico')
  })

  it('a failed apology send does not throw', async () => {
    const deps = makeDeps({
      complete: vi.fn().mockRejectedValue(new Error('boom')),
      sendText: vi.fn().mockRejectedValue(new Error('network down')),
    })
    await expect(runClinicBot(baseInput(), deps)).resolves.toMatchObject({ replied: true })
  })
})
