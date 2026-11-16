import { createMarkerRuntime } from '../host/marker.js'
const rt = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'
const started = Date.now()
const job = await rt.startConvert({ path: file, mode: 'vllm', format: 'markdown', pageRange: '3-4' })
let snap = rt.getJob(job.id)
for (let i = 0; i < 900 && snap.status === 'running'; i += 1) {
  await new Promise((r) => setTimeout(r, 2000))
  snap = rt.getJob(job.id)
  if (i % 15 === 0) console.log(`[${Math.round((Date.now()-started)/1000)}s]`, snap.stage)
}
console.log('status:', snap.status, 'ms:', Date.now() - started)
console.log('warnings:', JSON.stringify(snap.warnings ?? []))
console.log('error:', (snap.error || '(none)').slice(0, 400))
console.log('pages:', snap.result?.pages, 'chars:', snap.result?.textLength)
console.log('--- tail log ---')
console.log((snap.log || []).slice(-8).join('\n'))
