/* Marker 的浏览器半边：在右侧栏注册一个 `marker` 页签，负责文件选择、
 * 参数、任务进度与结果预览；所有实际转换都走宿主 /api/marker 路由。 */
window.__ModuleLoader__.load({
  id: '@local/dsh-marker',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'dshMarker'
    const ID = '@local/dsh-marker'
    const KIND = 'marker'
    const API = '/api/marker'

    const dict = {
      zh: {
        'type.title': 'Marker 转换',
        'type.guideTitle': 'Marker 转换',
        'type.guideDescription': '把 PDF、图片或 Office 文件转成 Markdown、JSON、HTML、chunks',
        'entry.label': 'Marker',
        'entry.title': '打开 Marker 转换面板',
        'env.checking': '检测环境…',
        'env.ready': '环境就绪',
        'env.missing': '环境未就绪',
        'env.recheck': '重新检测',
        'env.setupTitle': '首次使用：先装 Marker 环境',
        'env.setupBody': '插件会在本机建一个独立虚拟环境并安装 marker-pdf（约 1–3 GB，只需一次）。装好后即可离线转换。',
        'env.install': '一键安装 Marker 环境',
        'env.installing': '正在安装…',
        'env.python': 'Python',
        'env.marker': 'marker-pdf',
        'env.accelerator': '推理',
        'env.cpu': 'CPU（fast 模式）',
        'env.cuda': 'CUDA 可用',
        'file.dropTitle': '拖入 PDF / 图片 / Office 文件',
        'file.dropHint': '或点击选择文件（也可以直接粘贴本机绝对路径）',
        'file.choose': '选择文件',
        'file.pathLabel': '本机路径',
        'file.pathPlaceholder': 'D:\\papers\\paper.pdf',
        'file.usePath': '使用该路径',
        'file.clear': '移除',
        'file.size': '大小',
        'opts.mode': '模式',
        'opts.format': '输出格式',
        'opts.pages': '页码范围',
        'opts.pagesPlaceholder': '0,5-10（留空为全部）',
        'opts.forceOcr': '强制 OCR（扫描件/乱码时勾选）',
        'mode.auto': '自动',
        'mode.fast': 'fast · CPU，最快',
        'mode.balanced': 'balanced · 需要 GPU',
        'mode.vllm': 'vllm · 需要 GPU',
        'mode.no_ocr': 'no_ocr · 只读文字层',
        'action.convert': '开始转换',
        'action.running': '转换中…',
        'action.cancel': '取消',
        'action.copy': '复制全文',
        'action.copied': '已复制',
        'action.copyPath': '复制输出路径',
        'action.download': '下载文件',
        'result.title': '转换结果',
        'result.empty': '还没有结果。选好文件后点「开始转换」。',
        'result.meta': '输出目录',
        'result.pages': '页',
        'result.chars': '字符',
        'result.truncated': '内容较长，预览已截断；完整内容请复制或下载。',
        'result.images': '抽取的图片',
        'error.title': '出错了',
      },
      en: {
        'type.title': 'Marker convert',
        'type.guideTitle': 'Marker convert',
        'type.guideDescription': 'Convert PDFs, images, and Office files to Markdown, JSON, HTML, or chunks',
        'entry.label': 'Marker',
        'entry.title': 'Open the Marker panel',
        'env.checking': 'Checking environment…',
        'env.ready': 'Environment ready',
        'env.missing': 'Environment missing',
        'env.recheck': 'Check again',
        'env.setupTitle': 'First run: install the Marker environment',
        'env.setupBody': 'The plugin creates a local virtual environment and installs marker-pdf (about 1–3 GB, one time). Conversion then runs offline.',
        'env.install': 'Install Marker environment',
        'env.installing': 'Installing…',
        'env.python': 'Python',
        'env.marker': 'marker-pdf',
        'env.accelerator': 'Accelerator',
        'env.cpu': 'CPU (fast mode)',
        'env.cuda': 'CUDA available',
        'file.dropTitle': 'Drop a PDF, image, or Office file',
        'file.dropHint': 'or click to choose a file (an absolute path works too)',
        'file.choose': 'Choose file',
        'file.pathLabel': 'Local path',
        'file.pathPlaceholder': 'D:\\papers\\paper.pdf',
        'file.usePath': 'Use this path',
        'file.clear': 'Remove',
        'file.size': 'Size',
        'opts.mode': 'Mode',
        'opts.format': 'Output',
        'opts.pages': 'Pages',
        'opts.pagesPlaceholder': '0,5-10 (blank for all)',
        'opts.forceOcr': 'Force OCR (scans or garbled text)',
        'mode.auto': 'auto',
        'mode.fast': 'fast · CPU, quickest',
        'mode.balanced': 'balanced · GPU',
        'mode.vllm': 'vllm · GPU',
        'mode.no_ocr': 'no_ocr · text layer only',
        'action.convert': 'Convert',
        'action.running': 'Converting…',
        'action.cancel': 'Cancel',
        'action.copy': 'Copy all',
        'action.copied': 'Copied',
        'action.copyPath': 'Copy output path',
        'action.download': 'Download',
        'result.title': 'Result',
        'result.empty': 'No result yet. Choose a file and press Convert.',
        'result.meta': 'Output folder',
        'result.pages': 'pages',
        'result.chars': 'chars',
        'result.truncated': 'Preview truncated; copy or download the full text.',
        'result.images': 'Extracted images',
        'error.title': 'Something went wrong',
      },
    }

    const token = (name, fallback) => `var(--dsw-alias-${name}, ${fallback})`

    const styles = {
      page: {
        display: 'flex', flexDirection: 'column', gap: '14px', padding: '14px 14px 24px',
        height: '100%', overflowY: 'auto', boxSizing: 'border-box',
        color: token('label-primary', '#1a1a1a'), fontSize: '13px', lineHeight: 1.5,
      },
      header: { display: 'flex', alignItems: 'center', gap: '8px' },
      title: { fontSize: '14px', fontWeight: 600, margin: 0, flex: '1 1 auto' },
      chip: (ready) => ({
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '999px',
        fontSize: '11px', border: `1px solid ${token('border-l2', '#e3e3e3')}`,
        color: ready ? token('state-success-primary', '#1a7f37') : token('label-secondary', '#666'),
      }),
      dot: (ready) => ({
        width: '6px', height: '6px', borderRadius: '50%',
        background: ready ? token('state-success-primary', '#1a7f37') : token('label-tertiary', '#999'),
      }),
      card: {
        border: `1px solid ${token('border-l2', '#e3e3e3')}`, borderRadius: '10px',
        background: token('card-fill', '#fafafa'), padding: '12px', display: 'flex',
        flexDirection: 'column', gap: '8px',
      },
      cardTitle: { margin: 0, fontSize: '13px', fontWeight: 600 },
      muted: { color: token('label-secondary', '#666'), fontSize: '12px' },
      caption: { color: token('label-tertiary', '#8a8a8a'), fontSize: '11px' },
      row: { display: 'flex', gap: '8px', alignItems: 'center' },
      label: { fontSize: '12px', color: token('label-secondary', '#666'), minWidth: '56px' },
      button: (kind) => {
        const primary = kind === 'primary'
        return {
          appearance: 'none', border: primary ? '1px solid transparent' : `1px solid ${token('border-l2', '#dcdcdc')}`,
          background: primary ? token('button-primary-fill', '#1f6feb') : token('button-tool-bar-fill', '#ffffff'),
          color: primary ? token('label-on-color', '#ffffff') : token('label-primary', '#1a1a1a'),
          borderRadius: '7px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: primary ? 600 : 400,
        }
      },
      input: {
        flex: '1 1 auto', minWidth: 0, padding: '5px 8px', fontSize: '12px', borderRadius: '7px',
        border: `1px solid ${token('border-l2', '#dcdcdc')}`, background: token('bg-base', '#fff'),
        color: token('label-primary', '#1a1a1a'), fontFamily: 'inherit',
      },
      select: {
        padding: '5px 6px', fontSize: '12px', borderRadius: '7px',
        border: `1px solid ${token('border-l2', '#dcdcdc')}`, background: token('bg-base', '#fff'),
        color: token('label-primary', '#1a1a1a'), flex: '1 1 auto', minWidth: 0,
      },
      drop: (over) => ({
        border: `1px dashed ${over ? token('brand-primary', '#1f6feb') : token('border-l3', '#d0d0d0')}`,
        background: over ? token('interactive-bg-hover', '#f0f6ff') : 'transparent',
        borderRadius: '10px', padding: '18px 12px', textAlign: 'center', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center',
      }),
      bar: { height: '4px', borderRadius: '999px', background: token('bg-layer-2', '#eee'), overflow: 'hidden' },
      barFill: (percent) => ({
        height: '100%', width: `${Math.max(2, Math.min(100, percent))}%`,
        background: token('brand-primary', '#1f6feb'), transition: 'width 200ms ease',
      }),
      pre: {
        margin: 0, padding: '10px', borderRadius: '8px', maxHeight: '44vh', overflow: 'auto',
        background: token('bg-layer-1', '#f6f6f6'), border: `1px solid ${token('border-l1', '#eee')}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '11px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: token('label-primary', '#1a1a1a'),
      },
      log: {
        margin: 0, maxHeight: '120px', overflow: 'auto', fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '10px', whiteSpace: 'pre-wrap', color: token('label-secondary', '#666'),
      },
      error: {
        border: `1px solid ${token('state-error-secondary', '#f0b4b4')}`, color: token('state-error-primary', '#b42318'),
        background: token('bg-layer-1', '#fff5f5'), borderRadius: '8px', padding: '10px', fontSize: '12px',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      },
      images: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
      thumb: {
        width: '64px', height: '64px', objectFit: 'contain', borderRadius: '6px',
        border: `1px solid ${token('border-l1', '#eee')}`, background: '#fff',
      },
      footerEntry: {
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px',
        border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '6px',
        color: 'inherit', fontSize: 'inherit', textAlign: 'left',
      },
      footerDot: {
        width: '8px', height: '8px', borderRadius: '2px', background: token('brand-primary', '#1f6feb'), flex: 'none',
      },
    }

    const fetchJson = async (path, init) => {
      const response = await fetch(`${API}${path}`, { cache: 'no-store', ...init })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      return body
    }

    const humanSize = (bytes) => {
      if (!Number.isFinite(bytes) || bytes <= 0) return '—'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    const humanMs = (ms) => {
      if (!Number.isFinite(ms) || ms < 0) return ''
      if (ms < 1000) return `${Math.round(ms)} ms`
      if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
      const minutes = Math.floor(ms / 60_000)
      return `${minutes}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`
    }

    const extOf = (format) => ({ markdown: '.md', json: '.json', html: '.html', chunks: '.json' }[format] || '.md')

    /**
     * 右侧栏里的 Marker 面板。
     * @param {object} props 槽位注入的属性，含 locale 绑定的 t
     * @returns {object} React 元素
     */
    function MarkerPanel(props) {
      const tr = typeof props.t === 'function'
        ? props.t
        : (key) => dict.zh[key] ?? key

      const [env, setEnv] = useState(null)
      const [probing, setProbing] = useState(true)
      const [installJob, setInstallJob] = useState(null)
      const [file, setFile] = useState(null)
      const [pathInput, setPathInput] = useState('')
      const [mode, setMode] = useState('fast')
      const [format, setFormat] = useState('markdown')
      const [pageRange, setPageRange] = useState('')
      const [forceOcr, setForceOcr] = useState(false)
      const [job, setJob] = useState(null)
      const [result, setResult] = useState(null)
      const [error, setError] = useState(null)
      const [dragOver, setDragOver] = useState(false)
      const [copied, setCopied] = useState(false)
      const fileInput = useRef(null)

      const loadEnv = useCallback(async (force) => {
        setProbing(true)
        try {
          setEnv(await fetchJson(`/env${force ? '?force=1' : ''}`))
        } catch (cause) {
          setError(String(cause?.message || cause))
        } finally {
          setProbing(false)
        }
      }, [])

      useEffect(() => { loadEnv(false) }, [loadEnv])

      // 轮询当前任务；完成后再取一次完整文本。
      useEffect(() => {
        if (job === null || job.status !== 'running') return undefined
        const timer = setInterval(async () => {
          try {
            const next = await fetchJson(`/job?id=${encodeURIComponent(job.id)}`)
            setJob(next)
            if (next.status === 'done') {
              const full = await fetchJson(`/job?id=${encodeURIComponent(job.id)}&text=1`)
              setResult(full.result ?? null)
            }
          } catch (cause) {
            setError(String(cause?.message || cause))
          }
        }, 900)
        return () => clearInterval(timer)
      }, [job])

      const startConvert = useCallback(async () => {
        setError(null)
        setResult(null)
        setCopied(false)
        try {
          const payload = {
            path: file ? file.path : pathInput.trim(),
            mode,
            format,
            pageRange,
            forceOcr,
          }
          if (!payload.path) throw new Error('先选择文件或填写本机路径')
          setJob(await fetchJson('/convert', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }))
        } catch (cause) {
          setError(String(cause?.message || cause))
        }
      }, [file, pathInput, mode, format, pageRange, forceOcr])

      const cancelJob = useCallback(async () => {
        if (job === null) return
        try {
          await fetchJson('/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: job.id }),
          })
        } catch (cause) {
          setError(String(cause?.message || cause))
        }
      }, [job])

      const uploadFile = useCallback(async (chosen) => {
        if (!chosen) return
        setError(null)
        setJob(null)
        setResult(null)
        try {
          const response = await fetch(`${API}/upload?name=${encodeURIComponent(chosen.name)}`, {
            method: 'POST',
            body: chosen,
          })
          const saved = await response.json()
          if (!response.ok) throw new Error(saved?.error || `HTTP ${response.status}`)
          setFile(saved)
          setPathInput('')
        } catch (cause) {
          setError(String(cause?.message || cause))
        }
      }, [])

      const install = useCallback(async () => {
        setError(null)
        try {
          setInstallJob(await fetchJson('/env/install', { method: 'POST' }))
        } catch (cause) {
          setError(String(cause?.message || cause))
        }
      }, [])

      // 安装任务同样轮询，结束后重新检测环境。
      useEffect(() => {
        if (installJob === null || installJob.status !== 'running') return undefined
        const timer = setInterval(async () => {
          try {
            const next = await fetchJson(`/job?id=${encodeURIComponent(installJob.id)}`)
            setInstallJob(next)
            if (next.status === 'done') await loadEnv(true)
          } catch (cause) {
            setError(String(cause?.message || cause))
          }
        }, 1200)
        return () => clearInterval(timer)
      }, [installJob, loadEnv])

      const copy = useCallback(async (text) => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch (cause) {
          setError(String(cause?.message || cause))
        }
      }, [])

      const download = useCallback(() => {
        if (result === null || typeof result.text !== 'string') return
        const stem = (file?.name || pathInput || 'marker-output').replace(/\.[^.]+$/, '')
        const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${stem}${extOf(result.format)}`
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }, [result, file, pathInput])

      const ready = env?.ready === true
      const running = job?.status === 'running'
      const busyInstall = installJob?.status === 'running'
      const chosenName = file ? file.name : (pathInput.trim() ? pathInput.trim().split(/[\\/]/).pop() : '')

      return h('div', { style: styles.page, 'data-marker-panel': true },
        h('div', { style: styles.header },
          h('h2', { style: styles.title }, tr('type.title')),
          h('span', { style: styles.chip(ready) },
            h('span', { style: styles.dot(ready) }),
            probing ? tr('env.checking') : ready ? tr('env.ready') : tr('env.missing')),
          h('button', {
            type: 'button', style: styles.button('ghost'),
            onClick: () => loadEnv(true), disabled: probing,
          }, tr('env.recheck')),
        ),

        env === null ? null : h('div', { style: styles.card },
          h('div', { style: styles.row },
            h('span', { style: styles.caption }, `${tr('env.python')}: ${env.pythonVersion ?? '—'}`),
            h('span', { style: styles.caption }, `${tr('env.marker')}: ${env.markerVersion ?? '—'}`),
            h('span', { style: styles.caption }, `${tr('env.accelerator')}: ${env.cuda ? tr('env.cuda') : tr('env.cpu')}`),
          ),
          !ready && !busyInstall ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            h('p', { style: styles.cardTitle }, tr('env.setupTitle')),
            h('p', { style: styles.muted, margin: 0 }, tr('env.setupBody')),
            h('div', { style: styles.row },
              h('button', { type: 'button', style: styles.button('primary'), onClick: install }, tr('env.install')),
            ),
          ) : null,
          busyInstall ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('div', { style: styles.row },
              h('span', { style: styles.caption }, tr('env.installing')),
              h('span', { style: { ...styles.caption, flex: '1 1 auto' } }, installJob.stage ?? ''),
            ),
            h('div', { style: styles.bar }, h('div', { style: styles.barFill(installJob.progress || 6) })),
            h('pre', { style: styles.log }, (installJob.log ?? []).slice(-6).join('\n')),
          ) : null,
          installJob?.status === 'error' ? h('div', { style: styles.error }, installJob.error ?? '') : null,
        ),

        h('div', {
          style: styles.drop(dragOver),
          onClick: () => fileInput.current?.click(),
          onDragOver: (event) => { event.preventDefault(); setDragOver(true) },
          onDragLeave: () => setDragOver(false),
          onDrop: (event) => {
            event.preventDefault()
            setDragOver(false)
            const dropped = event.dataTransfer?.files?.[0]
            if (dropped) uploadFile(dropped)
          },
          role: 'button',
          tabIndex: 0,
        },
          h('span', { style: { fontWeight: 600, fontSize: '12px' } }, tr('file.dropTitle')),
          h('span', { style: styles.caption }, tr('file.dropHint')),
          h('input', {
            ref: fileInput, type: 'file', style: { display: 'none' },
            accept: '.pdf,.png,.jpg,.jpeg,.webp,.pptx,.docx,.xlsx,.epub,.html',
            onChange: (event) => { uploadFile(event.target.files?.[0]); event.target.value = '' },
          }),
        ),

        file ? h('div', { style: styles.row },
          h('span', { style: { ...styles.caption, flex: '1 1 auto', wordBreak: 'break-all' } },
            `${file.name} · ${humanSize(file.size)}`),
          h('button', {
            type: 'button', style: styles.button('ghost'),
            onClick: () => { setFile(null); setJob(null); setResult(null) },
          }, tr('file.clear')),
        ) : h('div', { style: styles.row },
          h('span', { style: styles.label }, tr('file.pathLabel')),
          h('input', {
            style: styles.input, value: pathInput, placeholder: tr('file.pathPlaceholder'),
            onChange: (event) => setPathInput(event.target.value),
          }),
          h('button', {
            type: 'button', style: styles.button('ghost'),
            onClick: () => {
              const value = pathInput.trim()
              if (value === '') return
              setFile({ path: value, name: value.split(/[\\/]/).pop(), size: null })
              setPathInput('')
              setJob(null)
              setResult(null)
            },
            disabled: !pathInput.trim(),
          }, tr('file.usePath')),
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
          h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: styles.label }, tr('opts.mode')),
            h('select', {
              style: styles.select, value: mode,
              onChange: (event) => setMode(event.target.value),
            }, ['fast', 'balanced', 'vllm', 'no_ocr', 'auto'].map((value) =>
              h('option', { key: value, value }, tr(`mode.${value}`)))),
          ),
          h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: styles.label }, tr('opts.format')),
            h('select', {
              style: styles.select, value: format,
              onChange: (event) => setFormat(event.target.value),
            }, ['markdown', 'json', 'html', 'chunks'].map((value) =>
              h('option', { key: value, value }, value))),
          ),
          h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('span', { style: styles.label }, tr('opts.pages')),
            h('input', {
              style: styles.input, value: pageRange, placeholder: tr('opts.pagesPlaceholder'),
              onChange: (event) => setPageRange(event.target.value),
            }),
          ),
          h('label', {
            style: { display: 'flex', gap: '6px', alignItems: 'center', alignSelf: 'end', paddingBottom: '4px' },
          },
            h('input', {
              type: 'checkbox', checked: forceOcr,
              onChange: (event) => setForceOcr(event.target.checked),
            }),
            h('span', { style: styles.caption }, tr('opts.forceOcr')),
          ),
        ),

        h('div', { style: styles.row },
          h('button', {
            type: 'button', style: styles.button('primary'),
            disabled: !ready || running || (!file && pathInput.trim() === ''),
            onClick: startConvert,
          }, running ? tr('action.running') : tr('action.convert')),
          running ? h('button', { type: 'button', style: styles.button('ghost'), onClick: cancelJob }, tr('action.cancel')) : null,
          h('span', { style: { ...styles.caption, flex: '1 1 auto', textAlign: 'right' } },
            chosenName ? `${chosenName}${job ? ` · ${humanMs(job.elapsedMs)}` : ''}` : ''),
        ),

        running ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          h('div', { style: styles.bar }, h('div', { style: styles.barFill(job.progress || 3) })),
          h('span', { style: { ...styles.caption, wordBreak: 'break-word' } }, job.stage ?? ''),
          h('pre', { style: styles.log }, (job.log ?? []).slice(-5).join('\n')),
        ) : null,

        error ? h('div', { style: styles.error }, h('strong', null, `${tr('error.title')}: `), error) : null,
        job?.status === 'error' ? h('div', { style: styles.error }, job.error ?? '') : null,

        result === null ? h('div', { style: { ...styles.card, gap: '4px' } },
          h('p', { style: styles.cardTitle }, tr('result.title')),
          h('p', { style: { ...styles.muted, margin: 0 } }, tr('result.empty')),
        ) : h('div', { style: styles.card },
          h('div', { style: styles.row },
            h('span', { style: styles.cardTitle }, tr('result.title')),
            h('span', { style: { ...styles.caption, flex: '1 1 auto', textAlign: 'right' } },
              [
                result.pages ? `${result.pages} ${tr('result.pages')}` : null,
                `${(result.textLength ?? result.text?.length ?? 0)} ${tr('result.chars')}`,
                humanMs(job?.elapsedMs ?? 0),
              ].filter(Boolean).join(' · ')),
          ),
          h('div', { style: styles.row },
            h('button', { type: 'button', style: styles.button('ghost'), onClick: () => copy(result.text ?? '') },
              copied ? tr('action.copied') : tr('action.copy')),
            h('button', { type: 'button', style: styles.button('ghost'), onClick: download }, tr('action.download')),
            h('button', {
              type: 'button', style: styles.button('ghost'),
              onClick: () => copy(result.textPath ?? result.outDir ?? ''),
            }, tr('action.copyPath')),
          ),
          h('span', { style: { ...styles.caption, wordBreak: 'break-all' } },
            `${tr('result.meta')}: ${result.outDir ?? '—'}`),
          result.truncated ? h('span', { style: styles.caption }, tr('result.truncated')) : null,
          h('pre', { style: styles.pre }, result.text ?? ''),
          result.images && result.images.length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            h('span', { style: styles.caption }, `${tr('result.images')} (${result.images.length})`),
            h('div', { style: styles.images },
              result.images.slice(0, 12).map((name) => h('img', {
                key: name, style: styles.thumb, alt: name,
                src: `${API}/asset?id=${encodeURIComponent(job?.id ?? '')}&name=${encodeURIComponent(name)}`,
              }))),
          ) : null,
        ),
      )
    }

    /** 指南页里的小图标：一页纸 + 向下的箭头。 */
    function MarkerIcon() {
      return h('svg', { width: 20, height: 20, viewBox: '0 0 36 36', 'aria-hidden': true },
        h('path', {
          d: 'M9 5h11l7 7v19H9z', fill: 'none',
          stroke: token('brand-primary', '#1f6feb'), strokeWidth: 2.4, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M20 5v7h7', fill: 'none', stroke: token('brand-primary', '#1f6feb'), strokeWidth: 2.4 }),
        h('path', {
          d: 'M18 17v7m-3.5-3.5L18 24l3.5-3.5', fill: 'none',
          stroke: token('brand-primary', '#1f6feb'), strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        const tr = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, dict), 'dsh-marker: dictionaries')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          priority: 'builtin',
          title: () => tr('type.title'),
          guide: [{
            id: 'convert',
            order: 40,
            title: () => tr('type.guideTitle'),
            description: () => tr('type.guideDescription'),
            icon: MarkerIcon,
          }],
        }), 'dsh-marker: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab', key: ID, locale: NS,
        }, MarkerPanel)), 'dsh-marker: tab body')
        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action', id: `${ID}.entry`, order: 30, label: tr('entry.label'),
        }, function MarkerEntry() {
          return h('button', {
            type: 'button', style: styles.footerEntry, title: tr('entry.title'),
            onClick: () => {
              try { ctx.sidebarRight.openTab(KIND) } catch { /* 没有会话时忽略 */ }
            },
          }, h('span', { style: styles.footerDot }), tr('entry.label'))
        })), 'dsh-marker: sidebar entry')
      },
    }
  },
})
