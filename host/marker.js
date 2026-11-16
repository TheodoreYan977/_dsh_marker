/* Marker 转换的宿主实现：环境探测、一键安装、转换任务与结果读取。
 * 不依赖任何第三方 npm 包；只调用本机的 uv / python / marker_single。 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const IS_WIN = process.platform === 'win32'
const VENV_BIN = IS_WIN ? 'Scripts' : 'bin'
const PY_EXE = IS_WIN ? 'python.exe' : 'python'
const MARKER_EXE = IS_WIN ? 'marker_single.exe' : 'marker_single'
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g
const MAX_LOG = 300
const MAX_TEXT = 900_000
const MAX_UPLOAD = 512 * 1024 * 1024
const INSTALL_PACKAGE = 'marker-pdf'

/** 本包目录（安装时是 link 到工作区的真实目录）。 */
const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 支持的输出格式。 */
export const FORMATS = ['markdown', 'json', 'html', 'chunks']
/** 支持的转换模式；`auto` 交给 marker 按设备自己选择。 */
export const MODES = ['auto', 'fast', 'balanced', 'vllm', 'no_ocr']

const now = () => Date.now()

/**
 * 把一段输出整理成可读文本。
 * @param {string} line 原始输出片段
 * @returns {string} 去掉 ANSI 与回车后的单行文本
 */
const clean = (line) => line.replace(ANSI, '').replace(/\r/g, '').trim()

/**
 * 清理用户提供的文件名，避免路径穿越。
 * @param {string} name 原始文件名
 * @returns {string} 只保留安全字符的文件名
 */
export function safeName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  return base === '' || base === '.' || base === '..' ? 'file' : base.slice(0, 160)
}

/** 虚拟环境里的解释器路径。 */
const pythonIn = (venv) => path.join(venv, VENV_BIN, PY_EXE)
/** 虚拟环境里的 marker_single 控制台脚本路径。 */
const markerIn = (venv) => path.join(venv, VENV_BIN, MARKER_EXE)

/**
 * 创建 Marker 运行时。任务状态保存在内存里，产物写到数据目录。
 * @param {object} config 插件配置（cordis.patch.yml 的 config）
 * @returns {object} 运行时对象
 */
export function createMarkerRuntime(config = {}) {
  const dataDir = path.resolve(
    typeof config.dataDir === 'string' && config.dataDir.trim() !== ''
      ? config.dataDir
      : path.join(os.homedir(), '.dsh-marker'),
  )
  const dirs = {
    root: dataDir,
    uploads: path.join(dataDir, 'uploads'),
    jobs: path.join(dataDir, 'output'),
  }
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })

  // 虚拟环境候选：显式配置 → 包目录下的 .venv（本仓自带）→ 数据目录
  const venvCandidates = [
    typeof config.venvDir === 'string' && config.venvDir.trim() !== '' ? path.resolve(config.venvDir) : null,
    path.join(PKG_DIR, '.venv'),
    path.join(dataDir, 'venv'),
  ].filter((value) => value !== null)
  const venvDir = venvCandidates.find((candidate) => fs.existsSync(pythonIn(candidate)))
    || venvCandidates[venvCandidates.length - 1]
  dirs.venv = venvDir
  const venvPython = pythonIn(venvDir)
  const venvMarker = markerIn(venvDir)

  const jobs = new Map()
  let probeCache = { at: 0, value: undefined }

  /** 候选的 python 解释器，按优先级排列。 */
  const pythonCandidates = () => {
    const list = []
    if (typeof config.python === 'string' && config.python.trim() !== '') list.push(config.python.trim())
    if (fs.existsSync(venvPython)) list.push(venvPython)
    list.push(IS_WIN ? 'python' : 'python3')
    list.push('python')
    return [...new Set(list)]
  }

  /** 执行一条命令并收集输出。 */
  const run = (cmd, args, options = {}) => new Promise((resolve) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      cwd: options.cwd || dirs.root,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const limit = options.limit || 4000
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk).slice(-limit)
      options.onLine?.(chunk, 'stdout')
    })
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-limit)
      options.onLine?.(chunk, 'stderr')
    })
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: stderr + String(error?.message || error) }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })

  /** 显式指定的 VLM 后端（配置优先，其次进程环境）。 */
  const explicitBackend = () => {
    const value = config.suryaBackend || process.env.SURYA_INFERENCE_BACKEND
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }

  /** 显式指定的外部推理服务地址。 */
  const explicitUrl = () => {
    const value = config.suryaInferenceUrl || process.env.SURYA_INFERENCE_URL
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }

  let llamaCache = { at: 0, value: undefined }

  /**
   * 找 llama-server：配置 → 环境变量 → 数据目录里的 llama.cpp 解压件 → PATH。
   * @param {boolean} force 忽略缓存
   * @returns {Promise<string | undefined>} 可执行文件路径
   */
  const resolveLlama = async (force = false) => {
    if (!force && llamaCache.value !== undefined && now() - llamaCache.at < 60_000) return llamaCache.value
    const candidates = [
      typeof config.llamaCppBinary === 'string' && config.llamaCppBinary.trim() !== ''
        ? path.resolve(config.llamaCppBinary.trim())
        : undefined,
      process.env.LLAMA_CPP_BINARY,
      path.join(dirs.root, 'llama', IS_WIN ? 'llama-server.exe' : 'llama-server'),
    ].filter((value) => typeof value === 'string' && value !== '')
    let found = candidates.find((candidate) => {
      try { return fs.statSync(candidate).isFile() } catch { return false }
    })
    if (found === undefined) {
      // 解压后可能多套一层目录，最多向下找三层。
      const root = path.join(dirs.root, 'llama')
      const scan = (dir, depth) => {
        if (depth > 3 || !fs.existsSync(dir)) return undefined
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isFile() && /^llama-server(\.exe)?$/i.test(entry.name)) return full
          if (entry.isDirectory()) {
            const nested = scan(full, depth + 1)
            if (nested !== undefined) return nested
          }
        }
        return undefined
      }
      found = scan(root, 0)
    }
    if (found === undefined) found = await which(IS_WIN ? 'llama-server.exe' : 'llama-server')
    llamaCache = { at: now(), value: found }
    return found
  }

  /**
   * 传给 marker 子进程的 Surya/VLM 环境变量。后端总是显式给出，
   * 免得 surya 按 nvidia-smi 自己猜成要 Docker 的 vLLM。
   * @returns {Promise<object>} 需要注入的环境变量
   */
  const buildSuryaEnv = async () => {
    const env = {}
    const url = explicitUrl()
    if (url !== undefined) env.SURYA_INFERENCE_URL = url
    const backend = explicitBackend()
    if (backend !== undefined) env.SURYA_INFERENCE_BACKEND = backend
    if (backend === undefined && url === undefined) {
      const llama = await resolveLlama()
      if (llama !== undefined) {
        env.SURYA_INFERENCE_BACKEND = 'llamacpp'
        env.LLAMA_CPP_BINARY = llama
      }
    }
    if (env.SURYA_INFERENCE_BACKEND === 'llamacpp') {
      const llama = await resolveLlama()
      if (llama !== undefined) env.LLAMA_CPP_BINARY = llama
    }
    if (config.suryaInferenceParallel !== undefined) env.SURYA_INFERENCE_PARALLEL = String(config.suryaInferenceParallel)
    if (typeof config.vllmGpus === 'string' && config.vllmGpus.trim() !== '') env.VLLM_GPUS = config.vllmGpus.trim()
    return env
  }

  /** 查找可执行文件，返回绝对路径或 undefined。 */
  const which = async (command) => {
    try {
      const found = await execFileAsync(IS_WIN ? 'where' : 'which', [command], { windowsHide: true })
      return (found.stdout || '').split(/\r?\n/).filter(Boolean)[0]?.trim()
    } catch {
      return undefined
    }
  }

  /** Docker 守护进程是否真的在跑（CLI 装了但没启动是最常见的情况）。 */
  const dockerDaemonUp = async () => {
    const result = await run('docker', ['info', '--format', '{{.ServerVersion}}'], { limit: 4000 })
    return result.code === 0
  }

  /** 探一下已有的推理服务是否健康。 */
  const probeHealth = async (baseUrl) => {
    try {
      const response = await fetch(`${baseUrl.replace(/\/v1\/?$/, '')}/health`, { signal: AbortSignal.timeout(1500) })
      return response.ok
    } catch {
      return false
    }
  }

  let vlmCache = { at: 0, value: undefined }

  /**
   * 探测 balanced / vllm 需要的 VLM 推理后端是否可用。
   * @param {boolean} force 忽略缓存
   * @returns {Promise<object>} 后端信息
   */
  const checkVlm = async (force = false) => {
    if (!force && vlmCache.value !== undefined && now() - vlmCache.at < 60_000) return vlmCache.value
    const url = explicitUrl()
    const backend = explicitBackend()
    let value
    if (url !== undefined) {
      const healthy = await probeHealth(url)
      value = {
        backend: 'external',
        target: url,
        available: healthy,
        reason: healthy ? undefined : `已配置 SURYA_INFERENCE_URL=${url}，但 /health 没有响应`,
      }
    } else if (backend === 'vllm') {
      const docker = await which('docker')
      const up = docker === undefined ? false : await dockerDaemonUp()
      value = {
        backend: 'vllm',
        target: docker,
        available: docker !== undefined && up,
        reason: docker === undefined
          ? '没有找到 docker 命令（vLLM 后端需要 Docker）'
          : up ? undefined : 'Docker 已安装但守护进程没在运行（Docker Desktop 没启动）',
      }
    } else if (backend === 'mlx') {
      value = { backend: 'mlx', available: false, reason: 'mlx 后端只在 Apple Silicon 上可用' }
    } else {
      // 默认策略：本机有 llama.cpp 就用它（轻量、不需要 Docker），否则看 Docker 里的 vLLM。
      const llama = await resolveLlama()
      if (llama !== undefined) {
        value = { backend: 'llamacpp', target: llama, available: true }
      } else if (backend === 'llamacpp') {
        value = { backend: 'llamacpp', available: false, reason: '没有找到 llama-server（llama.cpp 没装）' }
      } else {
        const docker = await which('docker')
        const up = docker === undefined ? false : await dockerDaemonUp()
        value = {
          backend: 'vllm',
          target: docker,
          available: docker !== undefined && up,
          reason: docker === undefined
            ? '没有找到 docker 命令，也没有 llama-server（两条 GPU 路都没装）'
            : up ? undefined : 'Docker 已安装但守护进程没在运行（Docker Desktop 没启动）',
        }
      }
    }
    vlmCache = { at: now(), value }
    return value
  }

  /** 把 vllm/balanced 不可用的原因写成一句可操作的话。 */
  const vlmBlockedMessage = (vlm) => [
    `「vllm」模式要求本机有可用的 VLM 推理服务，现在是不可用：${vlm.reason ?? '未检测到后端'}。`,
    '四种解法：',
    '① 直接改用 fast（纯 CPU，数字版 PDF 效果已经不错）或 balanced（缺 VLM 时会自动降级到 Indra OCR）；',
    '② 启动 Docker Desktop 后重试（vLLM 后端会在容器里跑）；',
    '③ 装 llama.cpp，并配置 SURYA_INFERENCE_BACKEND=llamacpp（不需要 Docker）；',
    '④ 已有推理服务时，在插件 config 里设 suryaInferenceUrl 指过去。',
  ].join('')

  /** 把常见失败翻译成一句人话。 */
  const explainFailure = (text) => {
    if (/dockerDesktopLinuxEngine|docker: error during connect|pipe\/docker/i.test(text)) {
      return 'Docker 没在运行：vLLM 后端要用 docker run 起服务。启动 Docker Desktop 后重试，或改用 fast。'
    }
    if (/SpawnError|failed to spawn|server unavailable/i.test(text)) {
      return 'VLM 推理服务启动失败，这一模式依赖它；改用 fast 或 balanced 可以绕过。'
    }
    if (/CUDA out of memory|OutOfMemoryError|DefaultCPUAllocator: can't allocate/i.test(text)) {
      return '内存/显存不足：改用 fast 模式，或用页码范围分批转换。'
    }
    if (/HF_TOKEN|rate limit|401 Client Error/i.test(text)) {
      return '首次下载模型时被 HuggingFace 限流：设置 HF_TOKEN 后重试。'
    }
    if (/Invalid page range|must be between/i.test(text)) {
      return '页码范围超出文档页数；注意页码从 0 开始，第 4 页要填 3。'
    }
    if (/No such file|not found: .*\.pdf|找不到文件/i.test(text)) {
      return '找不到输入文件，检查路径是否还有效。'
    }
    return undefined
  }

  /**
   * 探测 Python 与 marker-pdf 是否可用。
   * @param {boolean} force 忽略缓存
   * @returns {Promise<object>} 环境信息
   */
  const probe = async (force = false) => {
    if (!force && probeCache.value !== undefined && now() - probeCache.at < 30_000) return probeCache.value
    const script = [
      'import json, sys',
      'info = {"executable": sys.executable, "python": sys.version.split()[0], "marker": None, "torch": None, "cuda": False}',
      'try:',
      '    from importlib.metadata import version',
      '    info["marker"] = version("marker-pdf")',
      'except Exception as error:',
      '    info["markerError"] = str(error)',
      'try:',
      '    import torch',
      '    info["torch"] = getattr(torch, "__version__", "unknown")',
      '    info["cuda"] = bool(torch.cuda.is_available())',
      'except Exception:',
      '    pass',
      'print(json.dumps(info))',
    ].join('\n')
    let found
    for (const candidate of pythonCandidates()) {
      const result = await run(candidate, ['-c', script], { limit: 20_000 })
      if (result.code !== 0) continue
      const line = result.stdout.split(/\r?\n/).filter(Boolean).pop()
      try {
        const info = JSON.parse(line)
        found = { ...info, command: candidate }
        break
      } catch {
        continue
      }
    }
    const vlm = await checkVlm()
    const value = {
      ready: Boolean(found && found.marker),
      dataDir: dirs.root,
      venvDir,
      venvCandidates,
      venvPython,
      hasVenv: fs.existsSync(venvPython),
      launcher: fs.existsSync(venvMarker) ? venvMarker : null,
      pythonCommand: found?.command || null,
      pythonVersion: found?.python || null,
      pythonPath: found?.executable || null,
      markerVersion: found?.marker || null,
      torchVersion: found?.torch || null,
      cuda: Boolean(found?.cuda),
      vlm,
      checkedAt: new Date().toISOString(),
    }
    probeCache = { at: now(), value }
    return value
  }

  const jobSnapshot = (job, withText = false) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    file: job.file,
    options: job.options,
    error: job.error,
    errorHint: job.errorHint,
    warnings: job.warnings,
    log: job.log.slice(-40),
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    elapsedMs: (job.endedAt || now()) - job.startedAt,
    result: job.result === undefined ? undefined : {
      ...job.result,
      text: withText ? job.result.text : undefined,
      textLength: job.result.text?.length ?? 0,
      preview: withText ? undefined : job.result.text?.slice(0, 1200),
    },
  })

  const createJob = (kind, fields) => {
    const id = `${kind}-${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const job = {
      id,
      kind,
      status: 'running',
      stage: kind === 'install' ? '准备环境…' : '启动 Marker…',
      progress: 0,
      log: [],
      startedAt: now(),
      endedAt: undefined,
      result: undefined,
      error: undefined,
      ...fields,
    }
    jobs.set(id, job)
    if (jobs.size > 30) {
      const oldest = [...jobs.values()]
        .filter((item) => item.status !== 'running')
        .sort((a, b) => a.startedAt - b.startedAt)[0]
      if (oldest !== undefined) jobs.delete(oldest.id)
    }
    return job
  }

  /** 把子进程输出写进任务日志，并顺带推断阶段与进度。 */
  const absorb = (job) => (chunk, stream) => {
    for (const raw of String(chunk).split(/\r?\n|\r/)) {
      const line = clean(raw)
      if (line === '') continue
      job.log.push(`${stream === 'stderr' ? '· ' : ''}${line}`)
      if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG)
      const ratio = /(\d+)\s*\/\s*(\d+)/.exec(line)
      if (ratio !== null) {
        const done = Number(ratio[1])
        const total = Number(ratio[2])
        if (total > 0 && done <= total) job.progress = Math.round((done / total) * 100)
      }
      job.stage = line.length > 160 ? `${line.slice(0, 160)}…` : line
    }
  }

  /** 列出目录下的所有文件（相对路径，正斜杠）。 */
  const walk = (dir, base = dir, out = []) => {
    if (!fs.existsSync(dir)) return out
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, base, out)
      else out.push(path.relative(base, full).replace(/\\/g, '/'))
    }
    return out
  }

  const EXTENSIONS = { markdown: ['.md'], json: ['.json'], html: ['.html'], chunks: ['.json'] }
  const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

  /**
   * 读取一次转换的产物。
   * @param {object} job 已完成的任务
   * @returns {Promise<object>} 结果摘要
   */
  const collectResult = async (job) => {
    const files = walk(job.outDir)
    const wanted = EXTENSIONS[job.options.format] || ['.md']
    const stem = path.basename(job.file, path.extname(job.file))
    const candidates = files.filter((name) => wanted.includes(path.extname(name).toLowerCase())
      && !name.endsWith('_meta.json'))
    const main = candidates.find((name) => path.basename(name, path.extname(name)) === stem) || candidates[0]
    let text = ''
    let truncated = false
    if (main !== undefined) {
      const raw = await fsp.readFile(path.join(job.outDir, main), 'utf8')
      truncated = raw.length > MAX_TEXT
      text = truncated ? `${raw.slice(0, MAX_TEXT)}\n\n…（已截断，完整内容见磁盘文件）` : raw
    }
    const metaName = main === undefined ? undefined : main.replace(/\.(md|json|html|txt)$/i, '_meta.json')
    let pages
    if (metaName !== undefined && files.includes(metaName)) {
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(job.outDir, metaName), 'utf8'))
        if (Array.isArray(meta.page_stats)) pages = meta.page_stats.length
      } catch { /* 元数据坏掉不影响结果 */ }
    }
    return {
      format: job.options.format,
      outDir: job.outDir,
      textPath: main === undefined ? null : path.join(job.outDir, main),
      text,
      truncated,
      pages,
      files,
      images: files.filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase())).slice(0, 60),
    }
  }

  /** 取消正在运行的任务。 */
  const cancel = (id) => {
    const job = jobs.get(id)
    if (job === undefined || job.status !== 'running') return false
    const { pid } = job.child ?? {}
    job.cancelled = true
    if (pid !== undefined) {
      if (IS_WIN) spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
      else job.child.kill('SIGKILL')
    }
    return true
  }

  /** 拖入的文件先落到数据目录，再由 marker 读取。 */
  const saveUpload = async (name, stream) => {
    const safe = safeName(name)
    const target = path.join(dirs.uploads, `${now().toString(36)}-${safe}`)
    const handle = await fsp.open(target, 'w')
    let size = 0
    try {
      for await (const chunk of stream) {
        size += chunk.length
        if (size > MAX_UPLOAD) throw new Error('文件超过 512 MB，请改用本机路径方式转换')
        await handle.write(chunk)
      }
    } finally {
      await handle.close()
    }
    return { path: target, name: safe, size }
  }

  /**
   * 启动一次转换。
   * @param {object} input 转换参数
   * @returns {Promise<object>} 任务快照
   */
  const startConvert = async (input) => {
    const file = path.resolve(String(input.path || ''))
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`找不到文件：${file}`)
    const format = FORMATS.includes(input.format) ? input.format : 'markdown'
    const mode = MODES.includes(input.mode) ? input.mode : 'fast'
    const env = await probe()
    if (!env.ready) throw new Error('Marker 环境尚未就绪，请先在面板里安装')

    // 预检：vllm 每页都要 VLM，缺后端就直接说清楚；balanced 缺后端会自己降级。
    const vlm = await checkVlm()
    if (mode === 'vllm' && !vlm.available) {
      const blocked = new Error(vlmBlockedMessage(vlm))
      blocked.code = 'vlm-unavailable'
      blocked.vlm = vlm
      throw blocked
    }
    const warnings = []
    if (!vlm.available && (mode === 'balanced' || mode === 'auto')) {
      warnings.push(`balanced/auto 需要 VLM 的页面会自动降级成 Indra OCR（${vlm.reason ?? 'VLM 不可用'}），精度会低一些`)
    }

    const job = createJob('convert', {
      file,
      warnings,
      options: {
        format,
        mode,
        pageRange: typeof input.pageRange === 'string' && input.pageRange.trim() !== ''
          ? input.pageRange.trim()
          : undefined,
        forceOcr: Boolean(input.forceOcr),
        paginate: Boolean(input.paginate),
      },
      outDir: path.join(dirs.jobs, `run-${now().toString(36)}`),
    })
    fs.mkdirSync(job.outDir, { recursive: true })

    const args = [file, '--output_dir', job.outDir, '--output_format', format]
    if (mode !== 'auto') args.push('--mode', mode)
    if (job.options.pageRange !== undefined) args.push('--page_range', job.options.pageRange)
    if (job.options.forceOcr) args.push('--force_ocr')
    if (job.options.paginate) args.push('--paginate_output')

    let cmd
    let cmdArgs
    if (env.launcher !== null) {
      cmd = env.launcher
      cmdArgs = args
    } else {
      // 没有 venv 控制台脚本时，用解释器直接调 CLI 入口。
      cmd = env.pythonCommand
      cmdArgs = [
        '-c',
        [
          'import sys',
          'from importlib.metadata import entry_points',
          'eps = [e for e in entry_points(group="console_scripts") if e.name == "marker_single"]',
          'if eps:',
          '    mod, _, attr = eps[0].value.partition(":")',
          '    getattr(__import__(mod, fromlist=["*"]), attr)()',
          'else:',
          '    from marker.scripts.convert_single import convert_single_cli as entry',
          '    entry()',
        ].join('\n'),
        ...args,
      ]
    }

    const child = spawn(cmd, cmdArgs, {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', ...(await buildSuryaEnv()) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    job.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const sink = absorb(job)
    child.stdout.on('data', (chunk) => sink(chunk, 'stdout'))
    child.stderr.on('data', (chunk) => sink(chunk, 'stderr'))
    child.on('error', (error) => {
      job.status = 'error'
      job.error = String(error?.message || error)
      job.errorHint = explainFailure(job.error)
      job.endedAt = now()
      job.child = undefined
    })
    child.on('close', async (code) => {
      job.child = undefined
      job.endedAt = now()
      if (job.cancelled === true) {
        job.status = 'cancelled'
        job.stage = '已取消'
        return
      }
      if (code !== 0) {
        job.status = 'error'
        job.error = job.log.slice(-6).join('\n') || `Marker 退出码 ${code}`
        job.errorHint = explainFailure(job.log.join('\n'))
        job.stage = '转换失败'
        return
      }
      try {
        job.result = await collectResult(job)
        job.status = 'done'
        job.progress = 100
        const pages = job.result.pages === undefined ? '' : `${job.result.pages} 页 · `
        job.stage = `完成 · ${pages}${job.result.text.length} 字符`
        // marker 在 balanced 下自己降级时，只在日志里说一句；把它抬到结果里提醒一次。
        const degraded = job.log.some((line) => /falling back to Indra/i.test(line))
        if (degraded) {
          job.warnings = [...(job.warnings ?? []), '本次转换中 VLM 不可用，相关页面已降级为 Indra OCR']
        }
      } catch (error) {
        job.status = 'error'
        job.error = String(error?.message || error)
        job.stage = '读取结果失败'
      }
    })
    return jobSnapshot(job)
  }

  /**
   * 一键安装：uv 建虚拟环境并装 marker-pdf；没有 uv 时退回 python -m venv + pip。
   * @returns {Promise<object>} 任务快照
   */
  const startInstall = async () => {
    const job = createJob('install', { options: {} })
    const sink = absorb(job)
    const logLine = (line) => sink(`${line}\n`, 'stdout')
    const step = async (cmd, args, extraEnv) => {
      logLine(`$ ${cmd} ${args.join(' ')}`)
      const result = await run(cmd, args, {
        env: extraEnv,
        limit: 200_000,
        onLine: (chunk, stream) => sink(chunk, stream),
      })
      if (result.code !== 0) {
        throw new Error(`${cmd} 失败（退出码 ${result.code}）：${clean(result.stderr).slice(-600)}`)
      }
      return result
    }
    ;(async () => {
      try {
        let uv
        try {
          const which = IS_WIN ? 'where' : 'which'
          const found = await execFileAsync(which, [config.uv || 'uv'], { windowsHide: true })
          uv = (found.stdout || '').split(/\r?\n/).filter(Boolean)[0]
        } catch {
          uv = undefined
        }
        job.stage = uv === undefined ? '创建虚拟环境（没有 uv，改用 pip）…' : '创建虚拟环境…'
        if (uv !== undefined) {
          if (!fs.existsSync(venvPython)) await step(uv, ['venv', '--python', '3.12', venvDir])
          job.stage = `安装 ${INSTALL_PACKAGE}（首次约 1-3 GB，请耐心等待）…`
          await step(uv, ['pip', 'install', '--python', venvPython, INSTALL_PACKAGE], { UV_LINK_MODE: 'copy' })
        } else {
          const base = (await probe(true)).pythonCommand || (IS_WIN ? 'python' : 'python3')
          if (!fs.existsSync(venvPython)) await step(base, ['-m', 'venv', venvDir])
          job.stage = '升级 pip…'
          await step(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
          job.stage = `安装 ${INSTALL_PACKAGE}（首次约 1-3 GB，请耐心等待）…`
          await step(venvPython, ['-m', 'pip', 'install', INSTALL_PACKAGE])
        }
        const env = await probe(true)
        if (!env.ready) throw new Error('安装完成但仍检测不到 marker-pdf')
        job.status = 'done'
        job.progress = 100
        job.stage = `环境就绪 · marker-pdf ${env.markerVersion}`
      } catch (error) {
        job.status = 'error'
        job.error = String(error?.message || error)
        job.stage = '安装失败'
        probeCache = { at: 0, value: undefined }
      } finally {
        job.endedAt = now()
      }
    })()
    return jobSnapshot(job)
  }

  return {
    dirs,
    probe,
    checkVlm,
    startConvert,
    startInstall,
    cancel,
    saveUpload,
    /** 最近的任务列表（不含正文）。 */
    listJobs: () => [...jobs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 20)
      .map((job) => jobSnapshot(job)),
    getJob: (id, withText = false) => {
      const job = jobs.get(id)
      return job === undefined ? undefined : jobSnapshot(job, withText)
    },
    /** 解析产物目录里的文件路径（只允许 job 目录内部）。 */
    readAsset: (id, name) => {
      const job = jobs.get(id)
      if (job === undefined || job.outDir === undefined) return undefined
      const root = path.resolve(job.outDir)
      const target = path.resolve(root, name)
      if (target !== root && !target.startsWith(root + path.sep)) return undefined
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return undefined
      return target
    },
  }
}
