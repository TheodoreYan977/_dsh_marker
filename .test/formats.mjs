import { createMarkerRuntime } from '../host/marker.js'
const rt = createMarkerRuntime({})
const file = 'C:/Users/YanXuetao/Desktop/证婚人发言-贺婚词_Theo20260914-2.pdf'
for (const format of ['json', 'html']) {
  const job = await rt.startConvert({ path: file, mode: 'fast', format })
  let snap = rt.getJob(job.id)
  for (let i = 0; i < 120 && (snap = rt.getJob(job.id)).status === 'running'; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
  }
  const full = rt.getJob(job.id, true)
  console.log(format, '->', snap.status, 'files=', snap.result?.files?.join('|'), 'chars=', full.result?.text?.length)
  console.log('   head:', (full.result?.text ?? '').slice(0, 90).replace(/\s+/g, ' '))
}
