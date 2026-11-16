import { createMarkerRuntime } from '../host/marker.js'
const rt = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'
const started = Date.now()
const job = await rt.startConvert({ path: file, mode: 'vllm', format: 'markdown', pageRange: '3-28' })
let snap = rt.getJob(job.id)
for (let i = 0; i < 2400 && snap.status === 'running'; i += 1) {
  await new Promise((r) => setTimeout(r, 2000))
  snap = rt.getJob(job.id)
  if (i % 20 === 0) console.log(`[${Math.round((Date.now()-started)/1000)}s]`, snap.stage)
}
console.log('STATUS:', snap.status, 'MS:', Date.now() - started)
console.log('ERROR:', (snap.error || '(none)').slice(0, 300))
const full = rt.getJob(job.id, true)
console.log('PAGES:', snap.result?.pages, 'CHARS:', full.result?.text?.length)
console.log('OUTDIR:', snap.result?.outDir)
console.log('TEXTPATH:', snap.result?.textPath)
