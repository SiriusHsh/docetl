# 前端：DocWrangler（`website/`）

## 1. 技术栈与形态

- Next.js 14（App Router）：页面在 `website/src/app/*`
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui（组件在 `website/src/components/ui/*`）

## 2. Playground 页面结构

- 入口：`website/src/app/playground/page.tsx`
  - Provider 组合：`PipelineProvider`、`PipelineStoreProvider`、`WebSocketProvider`、`ThemeProvider` 等
  - UI 组件：`WorkspaceSidebar`、`PipelineGUI`、`DatasetView`、`Output`、对话框/设置等

## 3. 状态管理（Context）

### 3.1 PipelineContext：编辑态 pipeline

实现：`website/src/contexts/PipelineContext.tsx`

维护内容（典型）：

- operations 列表（每个 op 包含 prompt/schema/otherKwargs/visibility 等）
- 当前文件与数据集列表（上传/选择）
- output 路径与表格展示状态
- 终端输出（来自 WebSocket output）
- 优化进度（来自 WebSocket optimizer_progress）
- namespace、API keys（用于生成 YAML 与 UI 助手）

### 3.2 PipelineStoreContext：多 pipeline 列表/切换/保存

实现：`website/src/contexts/PipelineStoreContext.tsx`

- 对接后端 `/pipelines` CRUD（见 `website/src/lib/pipelineStore.ts`）
- 支持：
  - 自动创建 seed pipeline
  - 切换前自动保存未保存变更（依赖 `unsavedChanges`）
  - active pipeline id 按 namespace 写入 localStorage

### 3.3 WebSocketContext：执行链路

实现：`website/src/contexts/WebSocketContext.tsx`

- 连接：`/ws/run_pipeline/${namespace}`
- 发送：首条消息包含 `yaml_config`（以及 optimize/clear_intermediate 等）
- 接收：output/result/error/optimizer_progress

## 4. 与后端交互：两条“通道”

### 4.1 HTTP（Next Route Handlers -> FastAPI）

模式：前端浏览器请求 `website/src/app/api/*`，由 Next Server 代理请求 FastAPI。

常见例子：

- `website/src/app/api/uploadFile/route.ts` -> `POST /fs/upload-file`
- `website/src/app/api/readFile/route.ts` -> `GET /fs/read-file`
- `website/src/app/api/writePipelineConfig/route.ts` -> `POST /fs/write-pipeline-config`
- `website/src/app/api/pipelines/*` -> `GET/POST/PUT/... /pipelines`
- `website/src/app/api/convertDocuments/route.ts` -> `POST /api/convert-documents` 或 Azure 版本

### 4.2 WebSocket（浏览器直连 FastAPI）

Playground 的运行日志与结果回传依赖 WebSocket（避免 HTTP 长轮询）。

## 5. UI 侧 YAML 生成：`generatePipelineConfig`

实现：`website/src/app/api/utils.ts:generatePipelineConfig`

核心职责：

- 将 UI state（operations、sample_size、system_prompt、apiKeys、extraPipelineSettings 等）映射为 DocETL YAML
- 约定输出/中间目录：
  - `pipeline.output.path`：`~/.docetl/<namespace>/pipelines/outputs/<name>.json`
  - `pipeline.output.intermediate_dir`：`~/.docetl/<namespace>/pipelines/<name>/intermediates/`
- 可选：对 `llm_api_keys` 做加密（需要 `DOCETL_ENCRYPTION_KEY`）

> 这也是前后端对“数据与存储约定”对齐的关键点，详见 `develop_doc/06_数据与存储约定.md`。

