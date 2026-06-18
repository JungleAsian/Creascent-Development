// P18 (Gap #35): Google Sheets export.
//
// Exports a clinic's conversations to a Google Sheet (one sheet per clinic). Uses
// the SAME Google OAuth app as Calendar (see calbot/google-calendar-client). The
// worker binds a clinic's encrypted tokens; pure row-building is exported for tests.
//
// googleapis is heavy, so it's imported lazily — only the sync path pays the cost.
import type { Auth } from 'googleapis'

type GoogleApi = (typeof import('googleapis'))['google']
let googlePromise: Promise<GoogleApi> | null = null
function loadGoogle(): Promise<GoogleApi> {
  if (!googlePromise) googlePromise = import('googleapis').then((m) => m.google)
  return googlePromise
}

export interface GoogleSheetsConfig {
  accessToken: string
  refreshToken: string
  /** The target spreadsheet id (clinic.settings.googleSheets.spreadsheetId). */
  spreadsheetId: string
  /** Tab/sheet name within the spreadsheet (default "Conversations"). */
  sheetName?: string
}

/** One exported conversation, in column order. */
export interface ConversationExportRow {
  date: string
  patientName: string
  intent: string
  resolved: boolean
  appointmentBooked: boolean
}

const HEADER = ['Date', 'Patient name', 'Intent', 'Resolved', 'Appointment booked']

/** Turn export rows into the raw value matrix written to the sheet (header + data). */
export function buildValueMatrix(rows: ConversationExportRow[]): string[][] {
  return [
    HEADER,
    ...rows.map((r) => [
      r.date,
      r.patientName,
      r.intent,
      r.resolved ? 'yes' : 'no',
      r.appointmentBooked ? 'yes' : 'no',
    ]),
  ]
}

async function authedSheets(accessToken: string, refreshToken: string) {
  const google = await loadGoogle()
  const auth: Auth.OAuth2Client = new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
    process.env['GOOGLE_REDIRECT_URI'],
  )
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  return google.sheets({ version: 'v4', auth })
}

export interface SheetsOps {
  /** Overwrite the sheet with the current conversation export (header + rows). */
  syncConversations(rows: ConversationExportRow[]): Promise<void>
}

/** Bind {@link SheetsOps} to a clinic's Google credentials + spreadsheet. */
export function createGoogleSheetsOps(config: GoogleSheetsConfig): SheetsOps {
  const sheetName = config.sheetName ?? 'Conversations'
  return {
    async syncConversations(rows) {
      const sheets = await authedSheets(config.accessToken, config.refreshToken)
      const values = buildValueMatrix(rows)
      // Clear stale rows first so deletions are reflected, then write the full export.
      await sheets.spreadsheets.values.clear({
        spreadsheetId: config.spreadsheetId,
        range: sheetName,
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values },
      })
    },
  }
}
