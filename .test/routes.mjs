/* 路由冒烟测试：用假的 ctx.connection 捕获路由，再直接调用处理器，覆盖
 * 环境探测、上传、转换、轮询、产物读取与取消。 */
import { readFileSync } from 'node:fs'
import { createMarkerRuntime } from '../host/marker.js'
import { registerRoutes } from '../host/routes.js'

const routes = new Map()
const ctx = {
  connection: {
    fetch: {
      register: (route) => {
        routes.set(`${route.methods.join(',')} ${route.path}`, route)
        return async () => {}
      },
    },
  },
}
const runtime = createMarkerRuntime({})
registerRoutes(ctx, runtime)
console.log('routes:', [...routes.keys()].join(' | '))

const call = async (method, path, body, init = {}) => {
  const bare = path.split('?')[0]
  const key = [...routes.keys()].find((name) => {
    const [methods, routePath] = name.split(' ')
    return routePath === bare && methods.split(',').includes(method)
  })
  const route = routes.get(key)
  const request = new Request(`http://x${path}`, {
    method,
    ...init,
    ...(body === undefined ? {} : { body }),
  })
  const response = await route.fetch(request)
  const text = await response.text()
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: response.status, parsed }
}

const env = await call('GET', '/api/marker/env')
console.log('env:', env.status, JSON.stringify(env.parsed).slice(0, 220))

// 上传：用真实 PDF 的字节流
const pdf = readFileSync('C:/Users/YanXuetao/Desktop/证婚人发言-贺婚词_Theo20260914-2.pdf')
const upload = await call('POST', '/api/marker/upload?name=sample.pdf', pdf)
console.log('upload:', upload.status, JSON.stringify(upload.parsed))

const converted = await call('POST', '/api/marker/convert', JSON.stringify({
  path: upload.parsed.path, mode: 'fast', format: 'markdown',
}), { headers: { 'content-type': 'application/json' } })
console.log('convert:', converted.status, JSON.stringify(converted.parsed).slice(0, 200))
const jobId = converted.parsed.id

let snapshot
for (let i = 0; i < 120; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  snapshot = await call('GET', `/api/marker/job?id=${jobId}`)
  if (snapshot.parsed.status !== 'running') break
}
console.log('job:', snapshot.parsed.status, snapshot.parsed.stage, 'progress=', snapshot.parsed.progress)

const full = await call('GET', `/api/marker/job?id=${jobId}&text=1`)
console.log('text chars:', full.parsed.result?.text?.length, 'pages:', full.parsed.result?.pages)
console.log('head:', (full.parsed.result?.text ?? '').slice(0, 120).replace(/\s+/g, ' '))

const jobs = await call('GET', '/api/marker/jobs')
console.log('jobs:', jobs.parsed.jobs.length)

const missing = await call('GET', '/api/marker/job?id=nope')
console.log('missing job:', missing.status, JSON.stringify(missing.parsed))

const traversal = await call('GET', `/api/marker/asset?id=${jobId}&name=../../host/marker.js`)
console.log('traversal asset:', traversal.status)

const assets = await call('GET', `/api/marker/asset?id=${jobId}&name=${encodeURIComponent(full.parsed.result.files[0])}`)
console.log('asset read:', assets.status, 'bytes=', String(assets.parsed).length)
