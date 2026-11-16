/* 渲染冒烟测试：用假的 client ctx 加载 client.js，把面板与入口组件渲染成 HTML。
 * 只验证注册参数与首次渲染不报错，不做浏览器交互。 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const nodeRequire = createRequire(import.meta.url)
const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

let loaded
const fakeWindow = { __ModuleLoader__: { load: (module) => { loaded = module } } }
vm.runInNewContext(code, { window: fakeWindow, console, setTimeout, clearTimeout })

const components = []
const registrations = []
const ctx = {
  effect: (factory) => {
    const disposer = factory()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  locale: {
    bind: () => (key) => `[[${key}]]`,
    register: (namespace, dictionaries) => {
      registrations.push(`locale:${namespace}:${Object.keys(dictionaries).join('+')}`)
      return () => {}
    },
  },
  slots: {
    inject: (owner, register) => register(),
    register: (options, Component) => {
      registrations.push(`slot:${options.name}:${options.key ?? options.id ?? ''}`)
      components.push({ options, Component })
      return () => {}
    },
  },
  sidebarRight: { openTab: (kind) => registrations.push(`openTab:${kind}`) },
  sidebarRightTabs: {
    register: (definition) => {
      registrations.push(`tab:${definition.kind}:${definition.id}:${definition.guide?.length ?? 0}`)
      return () => {}
    },
  },
}

const module = loaded.factory((name) => {
  if (name === 'react') return React
  return nodeRequire(name)
})
console.log('id:', loaded.id, 'inject:', module.inject.join(','))
module.apply(ctx)
console.log('registrations:', registrations.join(' | '))

const body = components.find((entry) => entry.options.name === 'sidebar.right.pane.tab')
const entry = components.find((entry) => entry.options.name === 'sidebar.footer.action')
for (const [label, component] of [['panel', body?.Component], ['entry', entry?.Component]]) {
  if (component === undefined) {
    console.log(`${label}: MISSING`)
    continue
  }
  const html = renderToStaticMarkup(React.createElement(component, { t: (key) => key }))
  console.log(`${label}: ${html.length} bytes; head=${html.slice(0, 220).replace(/\s+/g, ' ')}`)
}
