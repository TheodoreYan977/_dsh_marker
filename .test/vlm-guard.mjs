/* 验证 VLM 预检：vllm 快速失败、balanced 降级告警、fast 无告警；以及 /convert 返回 409。 */
import { createMarkerRuntime } from '../host/marker.js'
import { registerRoutes } from '../host/routes.js'

const runtime = createMarkerRuntime({})
const file = 'O:/Downloads/The Week Junior UK - Issue 570, 14 November 2026.pdf'

const vlm = await runtime.checkVlm(true)
console.log('checkVlm:', JSON.stringify(vlm))

const wait = async (id, limit = 300) => {
  let snap = runtime.getJob(id)
  for (let i = 0; i < limit && snap.status === 'running'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    snap = runtime.getJob(id)
  }
  return snap
}

console.log('=== vllm 预检（应立刻拒绝，不启动子进程）')
const started = Date.now()
try {
  await runtime.startConvert({ path: file, mode: 'vllm', format: 'markdown', pageRange: '3-4' })
  console.log('!! 没有拒绝，不符合预期')
} catch (error) {
  console.log('code:', error.code, 'ms:', Date.now() - started)
  console.log('message:', String(error.message).slice(0, 240))
}

console.log('=== fast 3-4（无告警）')
const fast = await wait((await runtime.startConvert({ path: file, mode: 'fast', format: 'markdown', pageRange: '3-4' })).id)
console.log('status:', fast.status, 'warnings:', JSON.stringify(fast.warnings ?? []))

console.log('=== balanced 3-28（预检告警 + 运行期降级告警）')
const balanced = await wait((await runtime.startConvert({ path: file, mode: 'balanced', format: 'markdown', pageRange: '3-28' })).id, 600)
console.log('status:', balanced.status, 'pages:', balanced.result?.pages)
console.log('warnings:', JSON.stringify(balanced.warnings ?? []))

console.log('=== /convert 409')
const routes = new Map()
registerRoutes({
  connection: { fetch: { register: (route) => { routes.set(`${route.methods.join(',')} ${route.path}`, route); return async () => {} } } },
}, runtime)
const route = routes.get('POST /api/marker/convert')
const response = await route.fetch(new Request('http://x/api/marker/convert', {
  method: 'POST',
  body: JSON.stringify({ path: file, mode: 'vllm', format: 'markdown', pageRange: '3-4' }),
}))
const body = await response.json()
console.log('status:', response.status, 'code:', body.code, 'vlm.available:', body.vlm?.available)
