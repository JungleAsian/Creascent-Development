import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@docmee/queue', () => ({
  transcriptionQueue: { add: vi.fn() },
  agentQueue: { add: vi.fn() },
}))

import { transcriptionQueue, agentQueue } from '@docmee/queue'
import { processConversationJob } from '../conversation-processor.worker.js'

const makeJob = (data: unknown) => ({ data }) as never

const base = {
  clinicId: '11111111-1111-1111-1111-111111111111',
  patientWaId: '5215555555555',
  waMessageId: 'wamid.ABC',
  phoneNumberId: '123456',
  waAccessToken: 'token',
  timestamp: 1700000000000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processConversationJob', () => {
  it('audio message → transcription queue', async () => {
    await processConversationJob(
      makeJob({ ...base, messageType: 'audio', mediaId: 'media1', mimeType: 'audio/ogg' }),
    )
    expect(transcriptionQueue.add).toHaveBeenCalledTimes(1)
    expect(agentQueue.add).not.toHaveBeenCalled()
  })

  it('text message → agent queue', async () => {
    await processConversationJob(makeJob({ ...base, messageType: 'text', content: 'hola' }))
    expect(agentQueue.add).toHaveBeenCalledTimes(1)
    expect(transcriptionQueue.add).not.toHaveBeenCalled()
  })

  it('invalid payload → throws ZodError', async () => {
    await expect(processConversationJob(makeJob({ foo: 'bar' }))).rejects.toThrow()
  })
})
