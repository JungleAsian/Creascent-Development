import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { Command } from 'commander'
import { PDFDocument } from 'pdf-lib'
import { log } from '../lib/logger.js'
import { toolsRoot } from '../lib/paths.js'
import { logActivity } from '../lib/activity.js'

const libraryDir = path.join(toolsRoot, 'mockup-library')
const REPORT_NAME = 'UI-Design-Report.pdf'

// Headless Chrome/Edge is used to render the standalone mockup HTML to PDF, then
// pdf-lib merges the screens into one report. No browser download needed.
function findBrowser(): string | null {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const pf = process.env.PROGRAMFILES || 'C:/Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pf86, 'Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean) as string[]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function renderToPdf(browser: string, htmlPath: string, pdfPath: string): boolean {
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`, '--virtual-time-budget=5000',
    pathToFileURL(htmlPath).href
  ], { stdio: 'ignore', windowsHide: true, timeout: 90000 })
  return result.status === 0 && fs.existsSync(pdfPath)
}

// Force a wide page so desktop-width mockups aren't clipped; paginate vertically.
function withPageSize(html: string): string {
  const style = '<style>@page { size: 1280px 1810px; margin: 0 } html, body { margin: 0 }</style>'
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : style + html
}

function screenLabel(file: string): string {
  return file.replace(/\.html$/i, '').replace(/[_]+/g, ' · ').replace(/-/g, ' ')
}

function coverHtml(screens: string[], date: string): string {
  const items = screens.map((s) => `<li>${screenLabel(s)}</li>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:1280px 1810px;margin:0}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:130px 120px;color:#0f172a}h1{font-size:58px;margin:0}p{color:#64748b;font-size:24px;margin-top:8px}ul{margin-top:48px;font-size:26px;line-height:2;color:#334155}.bar{height:6px;width:140px;background:#06b6d4;margin:28px 0}</style></head><body><h1>UI Design Report</h1><div class="bar"></div><p>Docmee &mdash; mockup screens (${screens.length}) &middot; ${date}</p><ul>${items}</ul></body></html>`
}

async function appendPdf(target: PDFDocument, pdfPath: string): Promise<void> {
  const src = await PDFDocument.load(fs.readFileSync(pdfPath))
  const pages = await target.copyPages(src, src.getPageIndices())
  pages.forEach((page) => target.addPage(page))
}

export const mockupCmd = new Command('mockup').description('Mockup library tools')

mockupCmd
  .command('report')
  .description('Export every mockup screen in the library to a single UI Design Report PDF (saved only in the library)')
  .action(async () => {
    const browser = findBrowser()
    if (!browser) { log('mockup', 'No Chrome/Edge found to render the PDF. Set CHROME_PATH.', 'error'); process.exitCode = 1; return }
    if (!fs.existsSync(libraryDir)) { log('mockup', `No mockup library at ${libraryDir}.`, 'error'); process.exitCode = 1; return }
    const screens = fs.readdirSync(libraryDir).filter((file) => file.toLowerCase().endsWith('.html')).sort()
    if (screens.length === 0) { log('mockup', 'No mockup screens (.html) in the library.', 'warn'); process.exitCode = 1; return }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-design-report-'))
    const report = await PDFDocument.create()
    const date = new Date().toISOString().slice(0, 10)

    // Cover page
    const coverHtmlPath = path.join(tmp, 'cover.html')
    const coverPdfPath = path.join(tmp, 'cover.pdf')
    fs.writeFileSync(coverHtmlPath, coverHtml(screens, date))
    if (renderToPdf(browser, coverHtmlPath, coverPdfPath)) await appendPdf(report, coverPdfPath)

    // Each screen
    let ok = 0
    for (const [index, screen] of screens.entries()) {
      const htmlPath = path.join(tmp, `screen-${index}.html`)
      const pdfPath = path.join(tmp, `screen-${index}.pdf`)
      fs.writeFileSync(htmlPath, withPageSize(fs.readFileSync(path.join(libraryDir, screen), 'utf8')))
      if (renderToPdf(browser, htmlPath, pdfPath)) { await appendPdf(report, pdfPath); ok += 1 }
      else log('mockup', `Failed to render ${screen}.`, 'warn')
    }

    if (report.getPageCount() === 0) { log('mockup', 'Nothing rendered — no report written.', 'error'); process.exitCode = 1; return }
    report.setTitle('UI Design Report')
    report.setSubject('Docmee mockup screens')
    const out = path.join(libraryDir, REPORT_NAME)
    fs.writeFileSync(out, await report.save())
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore temp cleanup */ }

    log('mockup', `UI Design Report saved to library: ${out} (${ok}/${screens.length} screens, ${report.getPageCount()} pages).`)
    logActivity({ actor: 'user', event: 'mockup.report', severity: 'success', source: 'ui', message: `UI Design Report exported — ${ok}/${screens.length} screen(s) → library.` })
  })
