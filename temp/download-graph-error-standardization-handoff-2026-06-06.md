# 下载模块 GraphError 标准化交接

## 目标

把 `server/download/` 按这次权限模块的标准统一收口：

- 只在真实的 Graph / 上游请求边界把错误转成 `GraphError`
- 不再保留 `toDownloadGraphError`
- 继续依赖路由层已有的 `withErrorHandling()` 统一响应错误
- 纯本地逻辑抛出的 `AppError` / `Error` 保持原类型，不再被下载模块二次改名

当前路由入口已经满足统一收口要求，无需改注册方式：

- `server/index.ts`
  - `/api/download/start` -> `withErrorHandling(startDownloadRequest)`
  - `/api/download/progress/:jobId` -> `withErrorHandling(getDownloadProgressRequest)`
  - `/api/download/manifest/:jobId` -> `withErrorHandling(getDownloadManifestRequest)`

## 现状判断

### 已符合方向的部分

- `server/downloadHandlers.ts` 本身没有本地 `try/catch + res.send(...)`
- `server/downloadService.ts`
  - 输入校验、本地任务状态更新、manifest 构造、本地业务错误都直接 `throw`
  - 这些逻辑本来就应该继续交给 `withErrorHandling()` 或后台任务失败收口逻辑处理

### 需要改的部分

- `server/download/downloadErrors.ts`
  - `toDownloadGraphError(...)` 只是 `toGraphAppError(...)` 的一层下载模块别名，不再需要
- `server/download/downloadService.ts`
  - `processJob(...)` 里目前单独 `catch getGraphOBOToken(...)` 再转 `toDownloadGraphError(...)`
- `server/download/downloadGraph.ts`
  - `resolveDownloadUrl(...)`
  - `expandItem(...)`
  - `expandFolder(...)`
  - 这几个位置仍在直接调用 `toDownloadGraphError(...)`

## 具体修改

### 1. 删除下载模块里的 GraphError 包装别名

文件：`server/download/downloadErrors.ts`

- 删除 `toDownloadGraphError(...)`
- 保留其余业务错误工厂与 `getDownloadJobFailureMessage(...)`
- 不新增新的下载专用 Graph helper

原因：

- 现在已有共享 helper `server/common/appErrorHelpers.ts -> sendGraphRequest(...)`
- 下载模块不需要再保留一个“只是换名字、不增加语义”的 wrapper

### 2. `processJob(...)` 改成共享 Graph 请求边界

文件：`server/download/downloadService.ts`

- 从 `downloadErrors.ts` 移除 `toDownloadGraphError` import
- 改为从 `server/common/appErrorHelpers.ts` 引入 `sendGraphRequest`
- 这段：
  - `try { graphToken = await getGraphOBOToken(userToken); } catch { ... }`
  - 改成直接用 `sendGraphRequest(...)`
- 推荐写法：
  - `const graphToken = await sendGraphRequest(() => getGraphOBOToken(userToken), "Unable to prepare the archive.", 502);`

说明：

- 这里虽然不是 Graph SDK `.get/.post`，但它是明确的上游 Graph OBO 令牌获取边界
- 该错误继续归类为 `GraphError` 是合理的，只是不需要下载模块本地再包一层

### 3. `downloadGraph.ts` 全部改用 `sendGraphRequest(...)`

文件：`server/download/downloadGraph.ts`

- 移除 `toDownloadGraphError` import
- 改为引入 `sendGraphRequest`
- 仅在真实远程请求点包 `sendGraphRequest(...)`
- 不要把本地 fallback 分支、本地 `AppError` 构造、结果判断一起包进去

#### 3.1 `resolveDownloadUrl(...)`

第一段 Graph SDK 读取：

- 当前 `graphClient.api(...).get()` 的 `try/catch`
- 改成：
  - `const item = await sendGraphRequest(() => graphClient.api(...).get() as Promise<GraphDriveItemWithDownloadUrl>, "...");`
- 之后保留本地判断：
  - 如果有 `@microsoft.graph.downloadUrl` 就直接返回

第二段 `fetch(contentEndpoint, ...)`：

- 这是另一个真实远程请求边界，也应统一走 `sendGraphRequest(...)`
- 不要把“读取 `location` 头”和“构造 `DownloadUrlNotFoundError`”包进 `sendGraphRequest(...)`
- 建议拆成两步：
  1. `const response = await sendGraphRequest(() => fetch(...), "Unable to resolve the download url for item ...");`
  2. 再在外层做：
     - `const location = response.headers.get("location")`
     - 有则返回
     - 无则 `throw new AppError({ name: "DownloadUrlNotFoundError", ... })`

这样可以保留正确边界：

- 远程请求失败 -> `GraphError`
- 远程请求成功但没有可用下载地址 -> 本地业务错误 / 普通 `AppError`

#### 3.2 `expandItem(...)`

- 把 `graphClient.api(...).select(...).get()` 改成 `sendGraphRequest(...)`
- 后续 `item.folder` 分支判断、`result.push(...)` 都放在外面

#### 3.3 `expandFolder(...)`

- 把分页读取 `graphClient.api(endpoint).select(...).get()` 改成 `sendGraphRequest(...)`
- 后续分页遍历、递归展开、`result.push(...)` 保持在外面

### 4. 保持后台任务失败文案行为稳定

文件：`server/download/downloadService.ts`

- `processJob(...)` 仍然通过最外层 `void processJob(...).catch(...)` 把错误写入 job 状态
- `getDownloadJobFailureMessage(...)` 继续保留
- 现有行为应尽量不变：
  - 真正的上游请求失败，任务错误数组仍优先显示原始错误 message
  - 业务错误如 `ArchiveEmptyError` / `ArchiveTooManyFilesError` / `ArchiveTooLargeError` 继续直接写入任务错误数组

## 测试修改

重点文件：`server/download/index.test.ts`

### 需要保留的现有行为

- `getGraphOBOToken` 失败时，job 最终进入 `failed`
- 展开 item 失败时，job 最终进入 `failed`
- 解析下载链接失败时，job 最终进入 `failed`
- 空文件、超文件数、超大小时，job 最终进入 `failed`
- 成功时仍能产出 manifest

### 需要新增或补强的点

- 增加至少 1 个用例，验证“本地非 Graph 错误不会被下载模块误包装”
  - 推荐场景：mock `fetch` 成功返回无 `location`，最终应走 `DownloadUrlNotFoundError` 的本地 `AppError`
  - 这个错误不应被再改成 `GraphError`
- 如果实现过程中需要单测 `sendGraphRequest(...)` 的下载调用边界，可继续复用已有 `server/common/errors.test.ts`，不要新建零散测试文件

## 实施边界

- 只改 `server/download/` 相关代码与必要测试
- 不改前端 download API contract
- 不改 `server/downloadHandlers.ts` 的响应 shape
- 不顺手重构后台任务状态结构
- 不新增下载专用共享文件

## 完成标准

- `toDownloadGraphError` 已删除
- `server/download/` 的真实远程请求全部统一改用 `sendGraphRequest(...)`
- 下载路由继续完全依赖 `withErrorHandling()` 处理抛错
- 本地业务错误不再被下载模块误标成 `GraphError`
- 建议验证：
  - `npm test -- --run server/download/index.test.ts server/common/errors.test.ts`
  - `npm run build:backend`
