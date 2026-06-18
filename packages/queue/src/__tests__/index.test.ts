import { describe, it, expect } from 'vitest'

describe('@docmee/queue', () => {
  it('package loads', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.createQueueClient).toBe('function')
  })
})
