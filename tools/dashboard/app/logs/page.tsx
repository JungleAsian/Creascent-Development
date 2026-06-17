import fs from 'node:fs'
import path from 'node:path'

const logsDir = path.resolve(process.cwd(), '..', 'logs')
type PageProps = { searchParams?: { file?: string; q?: string } }

function logFiles() {
  if (!fs.existsSync(logsDir)) return []
  return fs.readdirSync(logsDir).filter((file) => file.endsWith('.log')).sort().reverse()
}

function lastLines(file?: string, query?: string) {
  if (!file) return 'No log files found.'
  const fullPath = path.join(logsDir, file)
  if (!fullPath.startsWith(logsDir) || !fs.existsSync(fullPath)) return 'Log file not found.'
  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)
  const filtered = query ? lines.filter((line) => line.toLowerCase().includes(query.toLowerCase())) : lines
  return filtered.slice(-200).join('\n')
}

export default function LogsPage({ searchParams }: PageProps) {
  const files = logFiles()
  const selectedFile = searchParams?.file && files.includes(searchParams.file) ? searchParams.file : files[0]
  const query = searchParams?.q ?? ''
  return (
    <section>
      <h1 className="text-2xl font-semibold">Logs</h1>
      <form className="mt-5 flex gap-3">
        <select name="file" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" defaultValue={selectedFile}>
          {files.length === 0 ? <option>Select log file</option> : files.map((file) => <option key={file}>{file}</option>)}
        </select>
        <input name="q" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2" placeholder="Search" defaultValue={query} />
        <button className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950">Apply</button>
      </form>
      <pre className="mt-5 min-h-96 overflow-auto rounded-lg border border-slate-800 bg-black p-4 text-sm text-slate-300">{lastLines(selectedFile, query)}</pre>
    </section>
  )
}
