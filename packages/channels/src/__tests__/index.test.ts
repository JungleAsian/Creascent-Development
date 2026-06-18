import { describe, it, expect } from 'vitest'

describe('@docmee/channels', () => {
  it('package loads', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.createWhatsAppAdapter).toBe('function')
  })
})
