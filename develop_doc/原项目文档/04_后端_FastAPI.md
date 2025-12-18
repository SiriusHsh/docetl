# 后端：FastAPI（`server/app/`）

## 1. 入口与中间件

- 入口：`server/app/main.py`
  - `load_dotenv()` 读取根目录 `.env`
  - CORS：`BACKEND_ALLOW_ORIGINS`（逗号分隔）
  - 路由挂载：
    - `server/app/routes/pipeline.py`
    - `server/app/routes/convert.py`
    - `server/app/routes/filesystem.py`（前缀 `/fs`）
    - `server/app/routes/pipelines.py`（前缀 `/pipelines`）
  - 健康检查：`GET /health`

## 2. pipeline 执行（HTTP + WebSocket）

实现：`server/app/routes/pipeline.py`

### 2.1 HTTP：一次性执行

- `POST /run_pipeline`
  - 入参：`PipelineRequest{ yaml_config, pipeline_id?, namespace? }`
  - 内部：`DSLRunner.from_yaml(yaml_config)` -> `runner.load_run_save()` -> 返回 `{cost,...}`
  - 若提供 `pipeline_id + namespace`，会记录最后一次 run 状态（成功/失败）

### 2.2 WebSocket：流式执行（Playground 主路径）

- `WS /ws/run_pipeline/{client_id}`（前端实际传 namespace 作为 client_id）
  - 首条消息：包含 `yaml_config` 以及可选 `optimize/clear_intermediate/optimizer_model/...`
  - 后端循环发送：
    - `type=output`：控制台输出（实时）
    - `type=optimizer_progress`：优化阶段进度（仅 optimize=true 时）
    - `type=result`：最终结果（含 cost、可能含 optimized_ops）
    - `type=error`：异常信息
  - 支持接收用户消息：
    - `"kill"`：取消执行（设置 `runner.is_cancelled`）
    - 其它输入：`runner.console.post_input(...)`（用于交互式流程/确认）

## 3. 文件系统/工作区 API（`/fs`）

实现：`server/app/routes/filesystem.py`

- 命名空间根目录：`~/.docetl/<namespace>/`（可用 `DOCETL_HOME_DIR` 覆盖 home）
- 典型能力：
  - `POST /fs/check-namespace`：检查/创建命名空间目录
  - `POST /fs/upload-file`：上传数据文件（支持 CSV 自动转 JSON）
  - `POST /fs/save-documents`：保存多文档到 `documents/`
  - `POST /fs/write-pipeline-config`：写入 YAML 到 `pipelines/configs/<name>.yaml`
  - `GET /fs/read-file` / `GET /fs/read-file-page`：读取输出/中间产物
  - `GET /fs/check-file`：仅检查文件是否存在
  - `GET /fs/serve-document/{path}`：静态文档服务（带简单 path traversal 校验）

## 4. pipeline 状态持久化（UI 多 pipeline）

实现：

- 路由：`server/app/routes/pipelines.py`
- 存储：`server/app/storage/pipeline_store.py`

落盘位置：

- `~/.docetl/<namespace>/pipelines/store/<pipeline_id>.json`

提供能力：

- list/create/load/update/delete/duplicate（并维护 `updated_at`/`last_run_status` 等元数据）
- update 支持乐观锁：`expected_updated_at`（避免多会话覆盖）

## 5. 文档转换（PDF/DOCX 等 -> Markdown）

实现：`server/app/routes/convert.py`

- `POST /api/convert-documents`
  - 默认：本地 `docling` 转换（PDF backend 使用 `pypdfium2`）
  - 可选：转发到自定义 docling 服务（Header `custom-docling-url`）
  - 可选：使用 Modal 托管服务（query `use_docetl_server=true`）
- `POST /api/azure-convert-documents`
  - 使用 Azure Document Intelligence（layout/read 模型）
  - 有页数上限保护（PDF 超过阈值直接返回 error）

> 说明：转换能力主要为 playground 的“多文档导入与预处理”服务，并不等价于 DocETL 的 dataset parsing tools。

