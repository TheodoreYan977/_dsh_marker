/* Marker 面板的宿主路由，挂在 /api/marker 下。
 * 只服务本机 DSH 页面（Connection 只把 exact route 交给 owner Peer）。 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

const BASE = '/api/marker'

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

/**
 * 注册全部 HTTP 路由。
 * @param {object} ctx 宿主插件上下文
 * @param {object} runtime Marker 运行时
 * @returns {Array<() => Promise<void>>} 清理函数
 */
export function registerRoutes(ctx, runtime) {
  const disposers = []
  const add = (p, methods, handler, requestBody = 'buffered') => {
    disposers.push(ctx.connection.fetch.register({
      path: `${BASE}${p}`,
      methods,
      requestBody,
      fetch: async (request) => {
        try {
          return await handler(request)
        } catch (error) {
          return json(500, { error: String(error?.message || error) })
        }
      },
    }))
  }
  const query = (request) => new URL(request.url, 'http://marker.local')

  add('/env', ['GET', 'HEAD'], async (request) => {
    const force = query(request).searchParams.get('force') === '1'
    return json(200, await runtime.probe(force))
  })

  add('/env/install', ['POST'], async () => json(200, await runtime.startInstall()))

  add('/jobs', ['GET', 'HEAD'], async () => json(200, { jobs: runtime.listJobs() }))

  add('/job', ['GET', 'HEAD'], async (request) => {
    const params = query(request).searchParams
    const id = params.get('id') || ''
    const job = runtime.getJob(id, params.get('text') === '1')
    return job === undefined ? json(404, { error: '没有这个任务' }) : json(200, job)
  })

  add('/convert', ['POST'], async (request) => {
    const body = await request.json().catch(() => ({}))
    try {
      return json(200, await runtime.startConvert(body ?? {}))
    } catch (error) {
      // 客户端要能区分「模式不可用」和普通失败，好给出对应的下一步。
      const blocked = error?.code === 'vlm-unavailable'
      return json(blocked ? 409 : 400, {
        error: String(error?.message || error),
        code: error?.code,
        vlm: error?.vlm,
      })
    }
  })

  add('/vlm', ['GET', 'HEAD'], async (request) => json(200, await runtime.checkVlm(
    query(request).searchParams.get('force') === '1',
  )))

  add('/cancel', ['POST'], async (request) => {
    const body = await request.json().catch(() => ({}))
    const id = String(body?.id || '')
    return json(200, { cancelled: runtime.cancel(id) })
  })

  add('/upload', ['POST'], async (request) => {
    const params = query(request).searchParams
    if (request.body === null) return json(400, { error: '缺少文件内容' })
    const saved = await runtime.saveUpload(params.get('name') || 'upload.pdf', Readable.fromWeb(request.body))
    return json(200, saved)
  }, 'streaming')

  add('/asset', ['GET', 'HEAD'], async (request) => {
    const params = query(request).searchParams
    const file = runtime.readAsset(params.get('id') || '', params.get('name') || '')
    if (file === undefined) return json(404, { error: '找不到产物文件' })
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    const bytes = await fs.promises.readFile(file)
    return new Response(bytes, {
      headers: { 'content-type': type, 'cache-control': 'no-store', 'content-length': String(bytes.byteLength) },
    })
  })

  return disposers
}
