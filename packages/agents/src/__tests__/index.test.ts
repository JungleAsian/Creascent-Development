import { describe, it, expect } from 'vitest'

describe('@docmee/agents', () => {
  it('package loads', async () => {
    const mod = await import('../index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.routeMessage).toBe('function')
    expect(typeof mod.createGoogleCalendarClient).toBe('function')
  })
})
