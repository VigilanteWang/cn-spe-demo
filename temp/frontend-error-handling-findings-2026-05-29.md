# Frontend Error Handling Findings

## Scope

本文件整理截至 2026-05-29 对 `src/` 前端 error handling 的架构性评估，供后续 agent 继续标准化工作时直接复用。

这里关注的是“方向是否正确”和“当前哪些模块已经形成模板”，不是逐文件修复清单。

## Bottom Line

前端 error handling 的总体方向是正确的，但目前只有部分模块真正把这套模式落成体系。

当前最接近目标态的是 `permissions` 模块；`containers`、`files`、以及部分通用 service 还停留在“有错误类，但 UI 仍主要读 message 或直接打日志”的阶段。

## What Is Directionally Correct

### 1. Shared frontend error base is the right foundation

`src/common/errors.ts` 里的这套基础模型方向正确：

- `FrontendBusinessError`
- `FrontendApiError`
- `FrontendValidationError`
- `FrontendConfigError`
- `FrontendUserActionError`

它们已经把前端稳定错误语义所需的核心字段收敛到一起：

- `code`
- `category`
- `statusCode`
- `details`
- `message`

这比在各处抛裸 `Error`、再靠解析 message 做分支要好得多。

### 2. Service-first normalization is the right pattern

`src/services/permissionApiShared.ts` 是当前最值得复用的模板。

它做对了几件事：

- 在 service 层归一化失败响应，而不是把原始 `Response` 或 Graph 错误直接漏给 UI
- 优先解析后端结构化错误体
- 失败响应缺失或非 JSON 时有统一 fallback
- 为上层补充 `requestId` 和 `retryAfterSeconds`

这条链路说明当前正确模式应该是：

1. IO/service 先吃掉原始错误
2. service 输出稳定错误对象
3. UI 基于稳定字段决定提示或分支

### 3. User-action errors deserve explicit modeling

`DownloadSaveTargetSelectionCancelledError` 是一个合理的专用错误类型。

原因不是“为了面向对象”，而是它和真实失败不是一回事：

- 用户主动取消
- 不应当等同于网络失败或后端失败
- UI 需要专门分支处理

这类错误值得单独建模。

## Best Current Template

当前前端里，`permissions` 模块是 error handling 最接近目标态的区域。

原因：

- service 层先归一化权限 API 错误
- UI 没有直接消费原始 `Response`
- UI 已经开始按稳定语义补充展示
- 节流和请求追踪信息没有丢

### Specifically good pieces

`src/services/permissionApiShared.ts`

- `PermissionApiError`
- `buildPermissionApiError`
- `tryReadErrorPayload`

`src/components/permissions/utils/permissionDialogSharedUtils.ts`

- `formatPermissionRequestErrorMessage`
- `buildPermissionStatusMessages`

`permissions` 这条链路已经体现出：

- `code === "throttled"` 时可追加 `retryAfterSeconds`
- 有 `requestId` 时可以把排障信息暴露给 UI
- fallback message 仍统一走共享 helper

## Main Gaps

### 1. The model is not used consistently across the frontend

虽然基础错误模型已经存在，但它没有在整个前端形成一致消费方式。

当前大致分成两种风格：

- `permissions`: 以稳定错误对象为主
- `containers/files`: 以 `readErrorMessage()`、`error.message`、`console.error()` 为主

这说明当前问题不在“有没有 error class”，而在“是否真的按稳定语义使用它们”。

### 2. Some services still normalize too little

`src/services/backendApi.ts` 和 `src/services/downloadApi.ts` 当前都偏轻量。

典型表现：

- 大多只生成 `${operation} failed: ${response.status}`
- 很少尝试解析后端结构化错误体
- 会丢失更稳定的错误语义和排障上下文

和 `permissionApiShared.ts` 相比，这两支还没有形成同等级的错误归一化边界。

### 3. UI often falls back to message/logging instead of code-driven behavior

`containers` 和 `files` 里很多地方虽然 catch 到的是结构化错误，但后续处理仍是：

- 读 `message`
- 设置一条字符串错误提示
- 或直接打印日志

这会导致：

- error code 的价值没有被真正消费
- UI 行为不能稳定区分认证失败、限流、业务冲突、用户取消等不同语义
- 未来一旦 message 文案变化，UI 的行为和测试会变脆

### 4. Some custom error classes exist without a full consumer path

像 `FilesUploadError` 这样的类型，目前存在一定价值，但还没有完全闭环。

问题不在类本身，而在于：

- 上游抛出后，下游并没有持续按它的 `code/details` 来做 UI 行为
- 主流程最终仍以日志和计数为主

这类错误目前更像“局部封装”，还没有成为稳定的前端交互语义。

### 5. `category` exists, but is not yet a primary decision surface

`category` 当前更接近“设计保留字段”，而不是前端真实主消费面。

本次评估里真正有实际价值的字段优先级更像是：

1. `code`
2. `statusCode`
3. `requestId`
4. `retryAfterSeconds`
5. `details`

`category` 不是没用，但至少在当前代码里还没有形成强消费闭环。

## Practical Assessment

如果只问“error handling 的方向对不对”，结论是：

- 对
- 值得继续
- 不需要推倒重来

但如果问“现在是否已经达到统一、成熟的前端错误处理架构”，答案是：

- 还没有

当前更准确的说法是：

- 基础理念正确
- `permissions` 已经接近模板
- 其他模块还没有完全跟上

## Recommended Next Direction

后续标准化应优先做“扩散正确模式”，而不是继续发明新的错误类。

### Recommended priorities

1. 保留 `src/common/errors.ts` 现有基类体系，不重做。
2. 以 `src/services/permissionApiShared.ts` 为模板，补齐 `backendApi.ts` 和 `downloadApi.ts` 的结构化错误解析能力。
3. UI 层逐步减少“只读 message”的消费方式，更多按 `code` 分支。
4. 只对确实需要不同交互的错误保留专用类型，例如：
   - 用户主动取消
   - 节流等待
   - 认证过期
5. 不要为“只是换个 name/code”的场景继续新增大量 error subclass。

## Working Rule For Follow-up Agents

如果后续 agent 继续处理前端 error handling，建议遵守以下边界：

- 优先扩散现有正确模式，不推翻基础层
- 优先在 service 层收口错误，不把原始错误继续外泄到组件
- 优先让 UI 基于 `code` 做稳定分支，而不是依赖 message 文案
- 不顺手扩大到全局状态管理、UI 重写或目录重构
- 若需要样板，优先参考 `permissions` 模块，而不是 `files`

## Short Summary

一句话总结：

前端 error handling 的方向是正确的，但当前只是“局部成熟、全局未收口”。

最值得复用的模板是：

- `src/common/errors.ts`
- `src/services/permissionApiShared.ts`
- `src/components/permissions/utils/permissionDialogSharedUtils.ts`

最值得继续收口的区域是：

- `src/services/backendApi.ts`
- `src/services/downloadApi.ts`
- `src/components/files/`
- `src/components/containers/`
