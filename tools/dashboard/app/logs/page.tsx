import fs from 'node:fs'
import path from 'node:path'

const logsDir = path.resolve(process.cwd(), '..', 'logs')

function logFiles() {
  if (!fs.existsSync(logsDir)) return []
  return fs.readdirSync(logsDir).filter((file) => file.endsWith('.log')).sort().reverse()
}

function lastLines(file?: string) {
  if (!file) return 'No log files found.'
  const fullPath = path.join(logsDir, file)
  if (!fullPath.startsWith(logsDir) || !fs.existsSync(fullPath)) return 'Log file not found.'
  return fs.readFileSync(fullPath, 'utf8').split(/\r?\n/).slice(-200).join('\n')
}

export default function LogsPage() {
  const files = logFiles()
  return (
    <section>
      <h1 className="text-2xl font-semibold">Logs</h1>
      <div className="mt-5 flex gap-3">
        <select className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
          {files.length === 0 ? <option>Select log file</option> : files.map((file) => <option key={file}>{file}</option>)}
        </select>
        <input className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Search" />
      </div>
      <pre className="mt-5 min-h-96 overflow-auto rounded-lg border border-slate-800 bg-black p-4 text-sm text-slate-300">{lastLines(files[0])}</pre>
    </section>
  )
}
