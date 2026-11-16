/* 本地冒烟测试：探测环境 + 跑一次转换 + 打印结果摘要。不进产物。 */
import { createMarkerRuntime } from '../host/marker.js'

const runtime = createMarkerRuntime({})
const env = await runtime.probe(true)
console.log('env:', JSON.stringify({
  ready: env.ready,
  python: env.pythonVersion,
  marker: env.markerVersion,
  torch: env.torchVersion,
  cuda: env.cuda,
  launcher: env.launcher,
  venvDir: env.venvDir,
  dataDir: env.dataDir,
}))

const job = await runtime.startConvert({
  path: 'C:/Users/YanXuetao/Desktop/证婚人发言-贺婚词_Theo20260914-2.pdf',
  mode: 'fast',
  format: 'markdown',
})
console.log('started:', job.id, job.status)

for (let i = 0; i < 300; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  const snap = runtime.getJob(job.id)
  if (snap.status !== 'running') {
    console.log('final:', snap.status, 'stage=', snap.stage, 'ms=', snap.elapsedMs)
    if (snap.error) console.log('error:', snap.error)
    if (snap.result) {
      const full = runtime.getJob(job.id, true)
      console.log('outDir:', snap.result.outDir)
      console.log('textPath:', snap.result.textPath)
      console.log('pages:', snap.result.pages, 'chars:', snap.result.textLength)
      console.log('files:', snap.result.files.join(', '))
      console.log('--- text head ---')
      console.log((full.result.text || '').slice(0, 300))
    }
    break
  }
}
