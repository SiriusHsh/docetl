# 核心执行引擎：DocETL（`docetl/`）

## 1. Pipeline 配置与执行入口

DocETL 支持两种主入口：

- **YAML/CLI**：`docetl/cli.py` 通过 `DSLRunner.from_yaml(...)` 加载并执行/优化
- **Python API**：`docetl/api.py:Pipeline`（内部仍委托 `DSLRunner`）

Pipeline 的关键字段（概念层）：

- `datasets`：输入数据源（文件/内存）与解析链
- `operations`：算子定义（LLM/非 LLM）
- `pipeline.steps`：步骤编排（按 step 串联 operation 名称）
- `pipeline.output`：输出文件路径 + `intermediate_dir`（中间结果目录）

## 2. 执行模型：Pull-based DAG + 容器化节点

DocETL 的执行采用“**拉取式 DAG**”：

- `docetl/runner.py:DSLRunner` 会解析 config 并构建 DAG
- DAG 节点由 `docetl/containers.py:OpContainer` 表示
- 执行时从“最后一个节点”向下递归拉取 child 的结果，直至叶子（通常是 scan/load dataset）

```mermaid
flowchart RL
  OUT[final op] --> B[op B]
  B --> A[op A]
  A --> S[scan dataset]
```

这种模式的收益：

- **天然支持缓存**：节点输出可持久化，下次执行命中缓存即可跳过计算
- **局部重跑**：变更某个 operation 时只需重跑受影响的后续节点
- **可观测性**：执行链路清晰，便于统计每步 cost/耗时

## 3. Operation（算子）体系：内置 + 插件

算子加载点：

- `docetl/operations/__init__.py:get_operation/get_operations`
  - 优先从 `pyproject.toml` 的 entry-points（`docetl.operation`）加载
  - 回退到内置 `mapping`（仓库自带实现）

内置算子主要位于 `docetl/operations/`，典型包括：

- LLM：`map` / `parallel_map` / `reduce` / `resolve` / `filter` / `rank` / `extract`
- 非 LLM：`split` / `gather` / `unnest` / `sample` / `equijoin` / `scan` / `add_uuid` 等

扩展方式（概念）：

- 新增算子类并实现对应 schema/运行逻辑
- 在 `pyproject.toml` 的 `project.entry-points."docetl.operation"` 注册（或加到内置 mapping）

## 4. Dataset 与 Parsing Tools（解析链）

- `docetl/dataset.py:Dataset` 支持：
  - `type=file`：读取 `.json`/`.csv`（当前实现）
  - `type=memory`：直接传入 list 或 DataFrame
- 解析工具（Parsing Tools）：
  - 通过 `create_parsing_tool_map` 生成映射
  - 可从 entry-points `docetl.parser` 加载（见 `pyproject.toml`）
  - 支持在 dataset load 后对每条记录应用解析链（并可并行）

## 5. 优化器（Optimizer）与 “build” 流程

- `docetl/optimizer.py:Optimizer`：负责对标记 `optimize: true` 的 op 做改写/分解
- `docetl/containers.py:OpContainer.optimize`：优化从 DAG 叶到根递归执行
- CLI `docetl build`：
  - `--optimizer moar`：走 `docetl/moar/` 的搜索流程（并要求 YAML 含 `optimizer_config`）
  - `--optimizer v1`：旧 optimizer（仍委托 `DSLRunner.optimize`，标记为 deprecated）

## 6. 缓存与中间产物（概念）

执行与优化都会依赖中间目录与缓存目录：

- 中间产物：由 pipeline 的 `pipeline.output.intermediate_dir` 指定（常由 UI 生成）
- 缓存目录：默认在 `~/.docetl/cache/...`（可通过 `DOCETL_HOME_DIR` 影响 home）

具体落盘路径约定见 `develop_doc/06_数据与存储约定.md`。

