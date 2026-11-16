# Marker 文档转换（@local/dsh-marker）

把 [datalab Marker](https://github.com/datalab-to/marker) 接进 DSH：在**右侧栏**里拖入 PDF / 图片 / Office 文件，转换成 Markdown、JSON、HTML 或 chunks，并就地预览、复制、下载。

## 入口

- 右侧栏的「+」新增页签 → **Marker 转换** 卡片
- 左侧栏底部的 **Marker** 按钮（直接打开右侧栏页签）

## 使用

1. 首次打开面板时若显示「环境未就绪」，点「一键安装 Marker 环境」：插件会在 `~/.dsh-marker/venv` 建独立虚拟环境并安装 `marker-pdf`（约 1–3 GB，需联网，只需一次）。
2. 拖入文件（或把本机绝对路径粘到「本机路径」里按「使用该路径」）。
3. 选模式与输出格式，需要时填页码范围、勾选「强制 OCR」，点「开始转换」。
4. 结果显示在下方：可「复制全文」「下载文件」「复制输出路径」，抽取的图片会以缩略图列出。

## 模式

| 模式 | 需要什么 | 说明 |
|---|---|---|
| `fast`（默认） | 纯 CPU | 内置 ONNX 版面 + OCR，最快，多数文档够用 |
| `no_ocr` | 纯 CPU | 只读 PDF 文字层，最快但扫描件不行 |
| `balanced` | 本机 GPU 推理服务 | 干净排版走 CPU，公式/复杂表格/扫描页才走 VLM |
| `vllm` | 本机 GPU 推理服务 | 每页都走 VLM，精度最高、最慢 |
| `auto` | 跟随 marker 默认 | GPU 上为 balanced，CPU 上为 fast |

`balanced` / `vllm` 依赖 marker 自带的 Surya 推理服务（NVIDIA 用 Docker + vLLM，其他平台用 llama.cpp 的 `llama-server`），没有配置时请保持 `fast`。

## 配置（可选）

在 profile 的 `cordis.patch.yml` 里覆盖 `dsh-marker` 行的 `config`：

```yaml
- id: dsh-marker
  config:
    dataDir: D:\dsh-marker-data   # 数据根目录，默认 ~/.dsh-marker
    venvDir: D:\venvs\marker      # 虚拟环境目录，默认 <dataDir>/venv
    python: C:\Python312\python.exe  # 指定解释器（需已装 marker-pdf）
    uv: C:\Users\you\.local\bin\uv.exe  # 一键安装用的 uv 路径
```

## 数据与限制

- 上传的文件保存在 `<dataDir>/uploads`，转换产物保存在 `<dataDir>/output/<run>`；插件不会自动清理。
- 一次上传上限 512 MB；更大的文件请用「本机路径」方式（不经浏览器上传）。
- 结果预览超过约 90 万字符会截断，完整内容仍在磁盘文件里。
- 面板只服务本机会话（宿主路由注册在 `/api/marker`，仅本机 owner 可访问）。
