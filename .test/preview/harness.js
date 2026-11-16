/* README 预览图脚手架：用真实的面板组件渲染，喂固定的假数据（不连真实宿主）。
 * 由 .test/preview/shot.mjs 起静态服务并用 headless Chrome 截图。 */
const dictionaries = {}
const registrations = {}

const ctx = {
  effect: (factory) => {
    const disposer = factory()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  locale: {
    bind: (namespace) => (key) => dictionaries[namespace]?.zh?.[key] ?? key,
    register: (namespace, dicts) => {
      dictionaries[namespace] = dicts
      return () => {}
    },
  },
  slots: {
    inject: (owner, register) => register(),
    register: (options, Component) => {
      registrations[options.name] = Component
      return () => {}
    },
  },
  sidebarRight: { openTab: () => {} },
  sidebarRightTabs: { register: () => () => {} },
}

const plugin = window.__DSH_MARKER_MODULE__.factory((name) => {
  if (name === 'react') return window.React
  throw new Error(`unexpected require: ${name}`)
})
plugin.apply(ctx)

const markdown = [
  '# 3 Method',
  '',
  'We train a sparse mixture-of-experts layer with a learned routing function. Each token is',
  'dispatched to the top-2 experts, and an auxiliary load-balancing loss keeps the assignment',
  'roughly uniform across experts.',
  '',
  '| Model | Params | FLOPs/token | BLEU |',
  '| --- | --- | --- | --- |',
  '| Baseline | 213M | 3.5G | 26.4 |',
  '| Sparse MoE | 3.6B | 3.5G | 28.1 |',
  '',
  '$$ \\mathcal{L}_{aux} = \\alpha \\cdot N \\sum_{i=1}^{N} f_i \\cdot P_i $$',
].join('\n')

const env = {
  ready: true,
  dataDir: 'C:\\Users\\me\\.dsh-marker',
  venvDir: 'C:\\Users\\me\\.dsh-marker\\venv',
  pythonVersion: '3.12.8',
  markerVersion: '2.2.0',
  torchVersion: '2.15.0+cpu',
  cuda: false,
  vlm: { backend: 'vllm', available: true, target: 'docker' },
  checkedAt: new Date().toISOString(),
}

const runningJob = {
  id: 'convert-demo',
  kind: 'convert',
  status: 'running',
  stage: 'Detecting layout · page 4/12',
  progress: 34,
  file: 'C:\\papers\\switch-transformers.pdf',
  options: { format: 'markdown', mode: 'fast', forceOcr: false, paginate: false },
  log: ['Loading models…', 'Detecting layout for 12 pages', '· 4/12 pages'],
  startedAt: Date.now() - 4200,
  elapsedMs: 4200,
}

const doneJob = {
  ...runningJob,
  status: 'done',
  stage: '完成 · 12 页 · 18432 字符',
  progress: 100,
  elapsedMs: 12800,
  log: ['Loading models…', 'Saved markdown to output', 'Total time: 12.4s'],
  result: {
    format: 'markdown',
    outDir: 'C:\\Users\\me\\.dsh-marker\\output\\run-demo',
    textPath: 'C:\\Users\\me\\.dsh-marker\\output\\run-demo\\switch-transformers\\switch-transformers.md',
    text: markdown,
    truncated: false,
    pages: 12,
    files: ['switch-transformers/switch-transformers.md', 'switch-transformers/switch-transformers_meta.json'],
    images: [],
    textLength: 18432,
  },
}

let polls = 0
window.fetch = async (url) => {
  const target = String(url)
  const json = (data) => ({ ok: true, status: 200, json: async () => data })
  if (target.includes('/api/marker/env')) return json(env)
  if (target.includes('/api/marker/convert')) return json(runningJob)
  if (target.includes('/api/marker/job')) {
    polls += 1
    if (target.includes('text=1')) return json(doneJob)
    return json(polls > 0 ? doneJob : runningJob)
  }
  if (target.includes('/api/marker/upload')) return json({ path: 'C:\\tmp\\upload.pdf', name: 'upload.pdf', size: 184320 })
  return { ok: false, status: 404, json: async () => ({ error: 'not stubbed' }) }
}

const Panel = registrations['sidebar.right.pane.tab']
window.ReactDOM.createRoot(document.getElementById('stage')).render(
  window.React.createElement(Panel, { t: (key) => dictionaries.dshMarker?.zh?.[key] ?? key }),
)

// 预填一个本机路径，再走「使用该路径 → 开始转换」，让面板进入结果态。
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clickByText = (text) => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text)
  if (button !== undefined) button.click()
  return button !== undefined
}

void (async () => {
  await sleep(300)
  const input = document.querySelector('input[placeholder]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, 'C:\\papers\\switch-transformers.pdf')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(120)
  clickByText('使用该路径')
  await sleep(160)
  clickByText('开始转换')
  document.documentElement.dataset.ready = 'progress'
  await sleep(1400)
  document.documentElement.dataset.ready = 'done'
})()
