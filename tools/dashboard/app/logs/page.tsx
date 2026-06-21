import fs from 'node:fs'
import path from 'node:path'
import { DetailButton } from '../detail-button'

const logsDir = path.resolve(process.cwd(), '..', 'logs')
type PageProps = { searchParams?: { file?: string; q?: string } }
type LogRow = {
  timestamp: string
  source: string
  level: string
  message: string
}

function logFiles() {
  if (!fs.existsSync(logsDir)) return []
  return fs.readdirSync(logsDir).filter((file) => file.endsWith('.log')).sort().reverse()
}

function sourceFromFile(file: string) {
  return file.replace(/-\d{4}-\d{2}-\d{2}\.log$/, '').replace(/\.log$/, '')
}

function parseLine(line: string, file: string): LogRow {
  const match = line.match(/^\[(.+?)\]\s+\[(.+?)\]\s+(.*)$/)
  if (!match) return { timestamp: '', source: sourceFromFile(file), level: 'INFO', message: line }
  return { timestamp: match[1], source: sourceFromFile(file), level: match[2], message: match[3] }
}

function readRows(file?: string, query?: string) {
  if (!file) return [] as LogRow[]
  const fullPath = path.join(logsDir, file)
  if (!fullPath.startsWith(logsDir) || !fs.existsSync(fullPath)) return [] as LogRow[]
  const q = query?.trim().toLowerCase()
  return fs.readFileSync(fullPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseLine(line, file))
    .filter((row) => !q || `${row.timestamp} ${row.source} ${row.level} ${row.message}`.toLowerCase().includes(q))
    .slice(-500)
    .reverse()
}

function levelTone(level: string) {
  if (level === 'ERROR') return 'text-red-300'
  if (level === 'WARN') return 'text-amber-300'
  return 'text-emerald-300'
}

export default function LogsPage({ searchParams }: PageProps) {
  const files = logFiles()
  const selectedFile = searchParams?.file && files.includes(searchParams.file) ? searchParams.file : files[0]
  const query = searchParams?.q ?? ''
  const rows = readRows(selectedFile, query)

  return (
    <section className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="mt-2 text-sm text-slate-400">Full-page event view with timestamp, source, and log message.</p>
        </div>
        <span className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">{rows.length} entries</span>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[260px_1fr_auto]">
        <select name="file" className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 py-2" defaultValue={selectedFile}>
          {files.length === 0 ? <option>Select log file</option> : files.map((file) => <option key={file}>{file}</option>)}
        </select>
        <input name="q" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Search logs" defaultValue={query} />
        <button className="min-h-11 rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950">Apply</button>
      </form>

      <div className="mt-5 max-h-[calc(100vh-220px)] overflow-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
            <tr><th className="p-3">Timestamp</th><th className="p-3">Source</th><th className="p-3">Level</th><th className="p-3">Log message</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, index) => (
              <tr key={`${row.timestamp}-${index}`} className="bg-slate-950/60">
                <td className="whitespace-nowrap p-3 text-xs text-slate-400">{row.timestamp ? new Date(row.timestamp).toLocaleString() : '-'}</td>
                <td className="p-3 font-mono text-xs">{row.source}</td>
                <td className={`p-3 text-xs font-semibold ${levelTone(row.level)}`}>{row.level}</td>
                <td className="p-3 text-slate-200">
                  {row.message.length > 160 ? (
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">{row.message.slice(0, 160)}…</span>
                      <DetailButton buttonLabel="View" title={`${row.source} · ${row.level}`} body={row.message} />
                    </span>
                  ) : row.message}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-3 text-slate-400" colSpan={4}>No log entries found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
