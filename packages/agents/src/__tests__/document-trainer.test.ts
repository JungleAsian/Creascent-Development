import { describe, it, expect } from 'vitest'
import {
  parseFaqPairs,
  looksLikeFaq,
  chunkText,
  detectFormat,
  trainDocument,
} from '../botbase/document-trainer.js'

describe('detectFormat', () => {
  it('maps extensions and mime types', () => {
    expect(detectFormat('a.pdf')).toBe('pdf')
    expect(detectFormat('a.docx')).toBe('docx')
    expect(detectFormat('notes.md')).toBe('md')
    expect(detectFormat('plain.txt')).toBe('txt')
    expect(detectFormat('file', 'application/pdf')).toBe('pdf')
  })
})

describe('parseFaqPairs', () => {
  it('extracts Q/A pairs and ignores preamble', () => {
    const text = 'intro line\nQ: ¿Horario?\nA: 9 a 18h\nQ: ¿Precio?\nA: 100 GTQ'
    const pairs = parseFaqPairs(text)
    expect(pairs).toEqual([
      { question: '¿Horario?', answer: '9 a 18h' },
      { question: '¿Precio?', answer: '100 GTQ' },
    ])
  })

  it('joins multi-line answers', () => {
    const pairs = parseFaqPairs('Q: Test\nA: line one\nline two')
    expect(pairs[0]?.answer).toBe('line one\nline two')
  })
})

describe('looksLikeFaq', () => {
  it('detects Q:/A: documents', () => {
    expect(looksLikeFaq('Q: a\nA: b')).toBe(true)
    expect(looksLikeFaq('just some prose here')).toBe(false)
  })
})

describe('chunkText', () => {
  it('keeps small documents as one chunk', () => {
    expect(chunkText('short text', 800)).toEqual(['short text'])
  })

  it('splits prose that exceeds the cap', () => {
    const para = 'a'.repeat(500)
    const chunks = chunkText(`${para}\n\n${para}`, 800)
    expect(chunks.length).toBe(2)
  })
})

describe('trainDocument', () => {
  it('produces one chunk per Q/A pair for FAQ text', async () => {
    const buffer = Buffer.from('Q: One\nA: First\nQ: Two\nA: Second', 'utf-8')
    const chunks = await trainDocument({ buffer, format: 'faq' })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, question: 'One' })
    expect(chunks[0]?.content).toContain('A: First')
  })

  it('prose-chunks a plain text document', async () => {
    const chunks = await trainDocument({ buffer: Buffer.from('Hello world.', 'utf-8'), format: 'txt' })
    expect(chunks).toEqual([{ content: 'Hello world.', chunkIndex: 0 }])
  })

  it('returns no chunks for an empty document', async () => {
    expect(await trainDocument({ buffer: Buffer.from('   ', 'utf-8'), format: 'txt' })).toEqual([])
  })
})
