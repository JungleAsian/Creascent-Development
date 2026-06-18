import { describe, it, expect } from 'vitest'

describe('@docmee/notifications', () => {
  it('package loads', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.createEmailChannel).toBe('function')
    expect(typeof mod.createDiscordChannel).toBe('function')
  })
})
