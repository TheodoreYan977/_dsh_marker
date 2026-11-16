import { createMarkerRuntime } from '../host/marker.js'
const runtime = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'
const started = Date.now()
const job = await runtime.startConvert({ path: file, mode: 'balanced', format: 'markdown', pageRange: '3-28' })
let snap = runtime.getJob(job.id)
for (let i = 0; i < 600 && snap.status === 'running'; i += 1) {
  await new Promise((r) => setTimeout(r, 1000))
  snap = runtime.getJob(job.id)
}
console.log('status:', snap.status, 'elapsed ms:', Date.now() - started)
console.log('stage:', snap.stage)
console.log('error:', (snap.error || '(none)'))
console.log('--- last log lines ---')
console.log((snap.log || []).slice(-12).join('\n'))
