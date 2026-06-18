import { describe, it, expect } from 'vitest'
import { buildValueMatrix, type ConversationExportRow } from '../sheets/google-sheets-client.js'

describe('buildValueMatrix', () => {
  it('prepends a header row and renders booleans as yes/no', () => {
    const rows: ConversationExportRow[] = [
      { date: '2026-06-01', patientName: 'Ana', intent: 'booking', resolved: true, appointmentBooked: true },
      { date: '2026-06-02', patientName: '', intent: '', resolved: false, appointmentBooked: false },
    ]
    const matrix = buildValueMatrix(rows)
    expect(matrix[0]).toEqual(['Date', 'Patient name', 'Intent', 'Resolved', 'Appointment booked'])
    expect(matrix[1]).toEqual(['2026-06-01', 'Ana', 'booking', 'yes', 'yes'])
    expect(matrix[2]).toEqual(['2026-06-02', '', '', 'no', 'no'])
  })

  it('returns just the header for no rows', () => {
    expect(buildValueMatrix([])).toHaveLength(1)
  })
})
