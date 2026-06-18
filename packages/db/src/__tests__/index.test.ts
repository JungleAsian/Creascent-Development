import { describe, it, expect } from 'vitest'

describe('@docmee/db', () => {
  it('package loads', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.createConversationRepo).toBe('function')
    expect(typeof mod.createMessageRepo).toBe('function')
  })
})
