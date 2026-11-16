/* 复现 balanced 失败 + 用 fast 跑通 4-29 页（0 基 3-28）。 */
import { createMarkerRuntime } from '../host/marker.js'

const runtime = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'

const wait = async (id) => {
  let snap = runtime.getJob(id)
  for (let i = 0; i < 600 && snap.status === 'running'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    snap = runtime.getJob(id)
  }
  return snap
}

console.log('=== balanced（预期失败）')
const started = Date.now()
const balanced = await runtime.startConvert({ path: file, mode: 'balanced', format: 'markdown', pageRange: '3-4' })
const balancedDone = await wait(balanced.id)
console.log('status:', balancedDone.status, 'ms:', Date.now() - started)
console.log('error:', (balancedDone.error || '').slice(0, 500))

console.log('=== fast 3-28（26 页）')
const fastStarted = Date.now()
const fast = await runtime.startConvert({ path: file, mode: 'fast', format: 'markdown', pageRange: '3-28' })
const fastDone = await wait(fast.id)
console.log('status:', fastDone.status, 'ms:', Date.now() - fastStarted, 'pages:', fastDone.result?.pages)
console.log('outDir:', fastDone.result?.outDir)
console.log('textPath:', fastDone.result?.textPath)
console.log('chars:', fastDone.result?.text?.length, 'images:', fastDone.result?.images?.length)
console.log('error:', (fastDone.error || '').slice(0, 300))
