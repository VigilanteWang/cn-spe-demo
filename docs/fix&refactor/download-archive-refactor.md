# 下载归档重构说明（Manifest + 前端流式 ZIP）

## 1. 重构背景与目标

旧方案是“后端直接打包 ZIP 并返回下载”，在以下场景会产生明显问题：

- 后端 CPU 和内存压力高：大文件/多文件时，后端要长时间执行压缩任务。
- 请求生命周期过长：同步下载更容易超时，用户体验差。
- 扩展性差：后端实例数增加时，长耗时压缩任务会放大资源竞争。

本次重构目标：

- 后端只做“目录展开 + 下载链接解析 + 任务状态管理”。
- 前端负责“流式下载 + ZIP 压缩 + 写盘/回退下载”。
- 通过任务轮询和分阶段进度展示，提升可观测性与用户体验。

## 2. 新旧方案对比

### 旧方案（简化）

1. 前端发起打包请求。
2. 后端下载并压缩文件，生成 ZIP。
3. 后端返回 ZIP 或通过票据再下载 ZIP。

### 新方案（本次实现）

1. 前端调用 `POST /api/downloadArchive/start` 创建任务，获得 `jobId`。
2. 前端轮询 `GET /api/downloadArchive/progress/:jobId`。
3. 后端后台递归展开目录，解析每个文件 `downloadUrl`，构建 `manifest`。
4. 任务就绪后，前端调用 `GET /api/downloadArchive/manifest/:jobId` 获取清单。
5. 前端逐项流式下载文件并推入 `fflate`，边压缩边写入磁盘流（或 Blob 回退）。

## 3. 本次核心改动

## 后端改动

### 文件：`server/downloadArchive.ts`

- 职责从“后端打包 ZIP”改为“准备下载清单（manifest）”。
- 新增/确认类型：
  - `ArchiveManifestItem`
  - `ArchiveManifest`
  - `JobStatus = queued | preparing | ready | failed`
- `processJob()` 逻辑调整为：
  - 递归展开文件列表（`expandItem` / `expandFolder`）
  - 逐文件解析 `downloadUrl`（`resolveDownloadUrl`）
  - 累计 `preparedBytes` 与 `totalBytes`
  - 输出 `job.manifest`
- `getJobManifest()` 对外提供任务完成后的清单读取能力。
- 保留任务所有权校验（`ownerOid`）与 TTL 清理。

### 文件：`server/index.ts`

- 路由对齐新架构：
  - 保留 `POST /api/downloadArchive/start`
  - 保留 `GET /api/downloadArchive/progress/:jobId`
  - 使用 `GET /api/downloadArchive/manifest/:jobId`
- 注释更新为“后端准备清单，前端压缩下载”。

## 前端改动

### 文件：`src/services/spembedded.ts`

- 新增/完善能力：
  - `getDownloadManifest(jobId)`
  - `selectArchiveSaveTarget(filename)`
  - `downloadArchiveFromManifest(manifest, saveTarget, onProgress)`
- 使用 `fflate` 进行前端流式 ZIP：`Zip + AsyncZipDeflate`。
- 支持两种输出路径：
  - 优先：File System Access API（`showSaveFilePicker` + `createWritable`）
  - 回退：内存收集 `Blob` 后触发下载。

## 4. 新下载流程代码走读

## 步骤 A：创建任务并轮询

前端调用：

- `startDownloadArchive(containerId, itemIds)` 获取 `jobId`
- `getDownloadProgress(jobId)` 轮询状态

后端状态大致流转：

- `queued` -> `preparing` -> `ready` / `failed`

## 步骤 B：任务就绪后取 manifest

前端调用：

- `getDownloadManifest(jobId)`

`manifest` 核心字段：

- `archiveName`
- `totalFiles`
- `totalBytes`
- `items[]`（含 `relativePath`、`size`、`downloadUrl`）

## 步骤 C：前端流式下载与压缩

在 `downloadArchiveFromManifest()` 中：

1. 创建 `Zip` 实例。
2. 遍历 `manifest.items`，逐个 `fetch(downloadUrl)`。
3. 将响应流分块推入 `AsyncZipDeflate`。
4. 在 `Zip` 回调中接收压缩输出块，写入 `writable` 或缓存到 `fallbackChunks`。
5. 全部完成后：
   - `writable` 路径调用 `close()`
   - 回退路径构造 `Blob` 并触发浏览器下载。

## 步骤 D：进度模型

下载页可按三阶段展示：

- 准备阶段（后端）：`preparedBytes / totalBytes`
- 下载阶段（前端）：`downloadedBytes / totalBytes`
- 压缩阶段（前端）：`zippedBytes`

## 5. 为什么这次重构有效

- 后端负载更可控：不再承担大规模压缩。
- 端到端体验更平滑：任务化 + 进度可视化。
- 结构更清晰：后端提供清单，前端负责下载与压缩，职责分离明确。

## 6. 当前已知取舍与后续建议

- 回退 Blob 模式会占用较高内存，适合小中型归档。
- 前端流式压缩受浏览器能力影响，建议优先在支持 File System Access API 的浏览器使用。
- 后续可继续增强：
  - 增加可取消下载（AbortController）
  - 增加分片重试与并发控制
  - 增加更细粒度性能埋点（下载速率、压缩耗时、写盘耗时）
