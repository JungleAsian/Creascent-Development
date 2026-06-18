import { describe, it, expect } from 'vitest'
import { ok, err } from '../index.js'

describe('@docmee/shared', () => {
  it('ok() wraps a value', () => {
    const result = ok(42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(42)
  })

  it('err() wraps an error', () => {
    const result = err(new Error('fail'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('fail')
  })
})
