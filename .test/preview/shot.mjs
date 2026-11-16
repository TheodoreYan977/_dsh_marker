/* 起静态服务 + headless Chrome 截图，产出 docs/preview.png。 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const out = path.join(root, 'docs', 'preview.png')
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => existsSync(candidate))
if (CHROME === undefined) throw new Error('没有找到 Chrome / Edge')

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' }
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const file = path.join(root, decodeURIComponent(url.pathname))
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end('not found')
    return
  }
  response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  response.end(await readFile(file))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const url = `http://127.0.0.1:${port}/.test/preview/harness.html`
console.log('serving', url)

mkdirSync(path.dirname(out), { recursive: true })
rmSync(out, { force: true })
const profile = path.join(here, '.chrome-profile')
const args = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  '--window-size=420,900',
  '--force-device-scale-factor=2',
  '--virtual-time-budget=8000',
  `--screenshot=${out}`,
  url,
]
const code = await new Promise((resolve) => {
  const child = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000) })
  child.on('close', resolve)
  child.on('error', (error) => { console.error(error); resolve(-1) })
  setTimeout(() => child.kill(), 60_000)
})
server.close()
console.log('chrome exit', code, existsSync(out) ? `ok -> ${out}` : 'NO SCREENSHOT')
if (code !== 0) console.error('chrome stderr tail:', stderr?.slice(-600))
