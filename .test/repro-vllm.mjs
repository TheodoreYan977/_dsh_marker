import { createMarkerRuntime } from '../host/marker.js'
const runtime = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'
const started = Date.now()
const job = await runtime.startConvert({ path: file, mode: 'vllm', format: 'markdown', pageRange: '3-4' })
let snap = runtime.getJob(job.id)
for (let i = 0; i < 300 && snap.status === 'running'; i += 1) {
  await new Promise((r) => setTimeout(r, 1000))
  snap = runtime.getJob(job.id)
}
console.log('vllm status:', snap.status, 'ms:', Date.now() - started)
console.log('error:', (snap.error || '(none)').slice(0, 600))
console.log('--- 最后几行日志 ---')
console.log((snap.log || []).slice(-6).join('\n'))
