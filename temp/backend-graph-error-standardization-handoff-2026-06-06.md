# 后端 GraphError 边界统一收窄 handoff

## 背景
- 这次权限模块已经完成一轮标准化：不要在过宽的 `catch` 里把所有异常都转成 `GraphError`。
- 统一目标是：
  - 只有真实的 Graph / OBO / 上游请求失败才转成 `GraphError`
  - route / handler 自己不直接发错误响应，只负责 `throw`
  - 最终统一交给 `withErrorHandling()` -> `sendApiError()` 处理
  - 本地校验、请求体构造、结果映射、循环控制、普通 `Error`、已有 `AppError` 都保留原始类型

## 已确认的后端范围
- 还需要按同一标准改造的 API：
  - `server/listContainers.ts`
  - `server/createContainer.ts`
  - `server/deleteItems.ts`
  - `server/download/`
- 不需要作为本轮重点重构的地方：
  - `server/index.ts`
    - 路由层已经统一套了 `withErrorHandling()`
  - `server/auth.ts`
    - `getGraphOBOToken()` 本身就是上游令牌边界，继续返回 `GraphError` 是合理的

## 统一实现原则
- 复用 [server/common/appErrorHelpers.ts](/e:/cache/GitRepos/cn-spe-demo/server/common/appErrorHelpers.ts) 里的 `sendGraphRequest(...)`
  - 当前签名：
    - `sendGraphRequest<T>(operation: () => Promise<T>, failureMessage: string, defaultStatusCode = 502): Promise<T>`
- 不要再新增局部 `toXxxGraphError` wrapper。
- 不要把整段业务函数包进 `sendGraphRequest(...)`。
- 只把单次真实 Graph 调用包进 `sendGraphRequest(...)`，例如：
  - `graphClient.api(...).get()`
  - `graphClient.api(...).post(...)`
  - `graphClient.api(...).delete()`
  - 必须视为 Graph 上游失败的单次 HTTP 请求

## 各模块具体修改

### 1. `server/listContainers.ts`
- 删除最外层整段 `try/catch`
- 保留直线流程：
  - `requireContainerManageRequest(...)`
  - `getGraphOBOToken(...)`
  - `createGraphClient(...)`
  - 本地 filter 字符串构造
  - 本地响应映射
- 仅把真正的 Graph 读取放进 `sendGraphRequest(...)`
  - fallback message：`Unable to list containers.`
- 这样本地配置错误、映射错误、普通运行时错误都不会再被误标成 `GraphError`

### 2. `server/createContainer.ts`
- 删除当前“整段 `catch` + 只对白名单 400 `AppError` 放行”的结构
- `displayName` 校验继续直接抛 `ValidationError`
- `containerRequestData` 本地构造放在 Graph 包装之外
- 仅把 `graphClient.api(...).post(containerRequestData)` 放进 `sendGraphRequest(...)`
  - fallback message：`Failed to create container.`
- 所有本地 `AppError` 改为自然透传，不再手写 `instanceof AppError && statusCode === 400` 之类的特判

### 3. `server/deleteItems.ts`
- 删除最外层整段 `try/catch`
- 输入校验继续直接抛 `ValidationError`
- `getGraphOBOToken(...)` 失败继续沿用它自己的 `GraphError` 边界
- 保留当前“逐项删除、逐项汇总失败结果”的产品行为
- 每一次真实删除调用改成：
  - `await sendGraphRequest(() => graphClient.api(...).delete(), "Unable to delete the selected items.")`
- 单项删除失败后，继续走现有失败列表和 `getSafeDeleteFailureReason(...)` 逻辑
- 外层不再把本地循环控制、结果整形等错误整体转成 `GraphError`

### 4. `server/download/`
- 这一块也纳入同一标准化，不再保留单独的下载版 Graph 错误包装

#### `server/download/downloadErrors.ts`
- 删除 `toDownloadGraphError`
- 删除它对 `toGraphAppError` 的依赖
- 保留真正属于 download 领域的本地错误工厂：
  - `createArchiveJobNotFoundError`
  - `createArchiveManifestNotReadyError`
  - `createArchiveManifestNotFoundError`
  - `createArchiveEmptyError`
  - `createArchiveTooManyFilesError`
  - `createArchiveTooLargeError`
  - `validateDownloadJobInput`
  - `getDownloadJobFailureMessage`

#### `server/download/downloadService.ts`
- 不要再手写：
  - `try { graphToken = await getGraphOBOToken(...) } catch { throw toDownloadGraphError(...) }`
- 改成直接：
  - `const graphToken = await getGraphOBOToken(userToken);`
- 原因：
  - `getGraphOBOToken()` 自己已经会在真实上游令牌获取失败时返回 `GraphError`
  - 外面再包一层 `toDownloadGraphError` 没有价值，只会制造多余 wrapper
- `processJob(...)` 里的本地领域判断继续保留原样：
  - 空文件
  - 文件数超限
  - 总大小超限
  - manifest 组装
  - job 状态推进

#### `server/download/downloadGraph.ts`
- 删除对 `toDownloadGraphError` 的依赖，改为直接引入 `sendGraphRequest`
- 将以下 Graph SDK 调用改成单点 `sendGraphRequest(...)`：
  - `resolveDownloadUrl()` 里首次 `graphClient.api(...).get()`
  - `expandItem()` 里的 `graphClient.api(...).select(...).get()`
  - `expandFolder()` 里的分页 `graphClient.api(endpoint).select(...).get()`
- fallback message 建议保持现有语义：
  - `Unable to resolve the download url for item ${itemId}.`
  - `Unable to expand the selected items.`
- `resolveDownloadUrl()` 里通过 `/content` 做 302 兜底的 `fetch(...)` 也视作 Graph 上游请求
  - 这里也统一改成 `sendGraphRequest(...)` 包裹该次 `fetch`
  - 如果拿不到 `location`，继续保留当前 `DownloadUrlNotFoundError` 这个领域错误
  - 注意不要把“成功拿到响应但没有 location”的领域判定和“请求本身失败”混在一起

#### `server/downloadHandlers.ts`
- route handler 继续只做：
  - 鉴权
  - 读参数
  - 基础校验
  - 调 service
  - `res.send(...)`
- 不新增本地错误响应发送逻辑
- 所有抛错继续统一由 `withErrorHandling()` 处理

## 测试要求
- 保留现有权限模块的标准化方向，不要回退
- 补充或更新以下测试：
  - `server/listContainers.test.ts`
    - Graph 429 仍返回 `GraphError`
    - 本地非 Graph 错误不再被标成 `GraphError`
  - `server/createContainer.test.ts`
    - 缺少 `displayName` 仍返回 `ValidationError`
    - 本地构造错误不再被标成 `GraphError`
    - Graph `post()` 失败仍返回 `GraphError`
  - `server/deleteItems.test.ts`
    - 输入校验仍是 `ValidationError`
    - 单项 Graph 删除失败仍进入失败列表
    - 外层本地错误不再被标成 `GraphError`
  - download 相关测试
    - `getGraphOBOToken()` 失败时仍能得到 `GraphError`
    - `flattenDriveItems` / `resolveDownloadUrl` / 分页读取失败时仍是 `GraphError`
    - `DownloadUrlNotFoundError`、`ArchiveEmptyError`、`ArchiveTooManyFilesError` 等本地领域错误保持原名，不要被改成 `GraphError`
    - 通过 `withErrorHandling()` 的下载 route 仍能统一返回 API error body
- 最小验证：
  - `npm test -- --run server/listContainers.test.ts server/createContainer.test.ts server/deleteItems.test.ts`
  - `npm test -- --run` 下载模块相关测试文件
  - `npm run build:backend`

## 实施提醒
- 这次是边界收窄，不是架构重写
- 不要新建新的错误文件或额外 wrapper
- 能直接复用 `sendGraphRequest(...)` 的地方就直接复用
- `withErrorHandling()` 已经是最终 HTTP 错误出口，不要在 feature 模块里再手写 `sendApiError(...)`
