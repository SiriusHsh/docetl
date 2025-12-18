# develop_doc

本目录用于沉淀面向开发者的“项目架构/技术架构/关键数据流/开发运行方式”等文档，内容以当前仓库实现为准。

## 目录

- `01_项目总览.md`：这是什么、解决什么问题、整体组件
- `02_代码结构.md`：仓库目录结构与关键入口文件
- `03_核心执行引擎_DocETL.md`：`docetl/`（DSLRunner、OpContainer、Operation 插件体系、Optimizer）
- `04_后端_FastAPI.md`：`server/app/`（HTTP/WebSocket API、文件与 pipeline 存储）
- `05_前端_DocWrangler.md`：`website/`（Next.js App Router、状态管理、与后端交互）
- `06_数据与存储约定.md`：`~/.docetl/<namespace>/...` 的目录约定与文件生命周期
- `07_开发运行与部署.md`：本地开发、测试、Docker/Compose、常用 Make 目标

