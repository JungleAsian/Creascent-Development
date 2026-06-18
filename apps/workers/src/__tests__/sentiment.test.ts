import { describe, it, expect, vi } from 'vitest'

// agent-processor pulls in heavy workspace deps at import time; stub them so we can
// unit-test the pure detectUpsetTone export in isolation.
vi.mock('@docmee/llm', () => ({ classifyIntent: vi.fn(), claudeComplete: vi.fn(), embedText: vi.fn() }))
vi.mock('@docmee/agents', () => ({
  routeIntent: vi.fn(),
  runClinicBot: vi.fn(),
  searchKb: vi.fn(),
  isInsideBusinessHours: vi.fn(),
  detectLanguage: vi.fn(),
}))
vi.mock('@docmee/channels', () => ({
  sendWhatsAppText: vi.fn(),
  sendMessengerText: vi.fn(),
  sendInstagramText: vi.fn(),
}))
vi.mock('@docmee/queue', () => ({ schedulingQueue: { add: vi.fn() }, notificationQueue: { add: vi.fn() } }))
vi.mock('@docmee/db', () => ({
  createServiceDbClient: vi.fn(),
  createClinicsRepository: vi.fn(),
  createChannelAccountsRepository: vi.fn(),
  createPatientsRepository: vi.fn(),
  createKnowledgeRepository: vi.fn(),
  createErrorReviewsRepository: vi.fn(),
  createConversationsRepository: vi.fn(),
}))

import { detectUpsetTone } from '../agent-processor.worker.js'

describe('detectUpsetTone', () => {
  it('flags upset Spanish keywords', () => {
    expect(detectUpsetTone('Esto es una estafa, estoy muy molesto')).toBe(true)
    expect(detectUpsetTone('El servicio es PÉSIMO')).toBe(true)
    expect(detectUpsetTone('la app no funciona')).toBe(true)
  })

  it('flags upset English keywords', () => {
    expect(detectUpsetTone('this is awful and I am upset')).toBe(true)
  })

  it('does not flag neutral messages', () => {
    expect(detectUpsetTone('Hola, quiero agendar una cita por favor')).toBe(false)
    expect(detectUpsetTone('Thank you so much!')).toBe(false)
  })
})
