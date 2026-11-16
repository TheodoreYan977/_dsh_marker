/* Marker 的宿主半边：注册 /api/marker 路由，供右侧栏面板调用。 */
import { createMarkerRuntime } from './host/marker.js'
import { registerRoutes } from './host/routes.js'

export const inject = ['connection']

/**
 * 激活插件。
 * @param {object} ctx 宿主插件上下文
 * @param {object} config 插件配置
 */
export function apply(ctx, config = {}) {
  const runtime = createMarkerRuntime(config ?? {})
  ctx.effect(() => {
    const disposers = registerRoutes(ctx, runtime)
    return () => Promise.all(disposers.map((dispose) => dispose()))
  }, 'dsh-marker: routes')
}
