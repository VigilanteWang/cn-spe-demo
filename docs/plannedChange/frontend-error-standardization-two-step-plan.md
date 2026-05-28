# 前端 Error Standardization 两步计划

## Summary

- `usePermissionDialogApiRequestState.ts` 里的 `missingTarget` 应收口为标准错误，而不是继续作为裸字符串消息存在。
- `load / prepare / apply` 这三类请求失败文案应保留为 fallback message，用于兜底展示，而不是和标准错误语义混在同一个 `requestMessages` 对象里。
- 当前 `src/` 前端 error management 还没有完全标准化。`permissions` 模块最接近目标态，但 `backendApi.ts`、`downloadApi.ts`、`containers`，以及一部分 `files` 主流程仍主要停留在“读 `message` / 打日志”的层级。
- 为避免范围失控，本次按“两步走”推进：
  1. 先收口 `permissions` 全链路，并补齐 `backend/download` 的共享错误归一化和直接消费者。
  2. 再处理 `files` 里仍然直接面向 Graph 或只打日志的剩余错误路径。

## Key Changes

### 1. Step 1：先把 permissions 链路做成模板

- 在 `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts` 中拆分当前 `requestMessages`：
  - `missingTarget` 改为标准错误对象，默认使用 `FrontendValidationError("missingTarget", "...")`。
  - `loadErrorFallback`、`prepareErrorFallback`、`applyErrorFallback` 改为单独的 `requestFallbackErrorMessages`。
- 保留 `formatPermissionRequestErrorMessage` 作为 permissions 侧统一展示格式化入口，但让 `missingTarget` 也通过标准错误路径进入，而不是直接写裸字符串。
- 按命名统一要求，把消息链整体改成 `*ErrorMessages`：
  - `buildPermissionStatusMessages` -> `buildPermissionErrorMessages`
  - `permissionStatusMessages` -> `permissionErrorMessages`
- 同步更新以下边界，保持命名一致：
  - `usePermissionDialogApiRequestState.ts`
  - `permissionDialogSharedUtils.ts`
  - `ContainerPermissionDialog.tsx`
  - `ItemPermissionDialog.tsx`
  - `PermissionDialogFrame.tsx`
  - 相关测试

### 2. Step 1：补齐 backend/download 的共享错误归一化

- 在 `src/services/` 新增共享 API error response helper，统一解析后端结构化错误体 `IApiErrorResponseBody`。
- 共享 helper 至少保留以下稳定字段：
  - `code`
  - `statusCode`
  - `requestId`
  - `retryAfterSeconds`
  - `details`
  - 以及 `{operation} failed: {status}` fallback
- 重做 `src/services/backendApi.ts` 的失败收口：
  - `BackendRequestError` 增加 `requestId` 和 `retryAfterSeconds`
  - `listContainers` / `createContainer` / `deleteItems` 不再只返回基于状态码的轻量 message
- 重做 `src/services/downloadApi.ts` 的失败收口：
  - `startDownload`
  - `getDownloadProgress`
  - `getDownloadManifest`
  - 统一复用共享 helper
- `DownloadSaveTargetSelectionCancelledError` 保持不变，因为它代表的是用户主动取消，不应与 API 失败合并。

### 3. Step 1：更新直接消费者

- `src/components/containers/index.tsx` 改为消费标准化后的错误对象，不再只用 `readErrorMessage(...)`。
- `src/components/files/hooks/useFilesArchiveDownload.ts` 改为基于标准化 archive error 生成失败文案，而不是直接拼 `error.message`。
- 目标不是一次性重做整个 files 模块，而是先让已经依赖 `backendApi.ts` / `downloadApi.ts` 的主流程 UI 和共享错误模型对齐。

### 4. Step 2：处理 files 里剩余未收口的错误路径

- 收口以下仍偏向“raw message / console”风格的用户可见主流程错误：
  - `src/components/files/hooks/useFilesData.tsx`
  - `src/components/files/hooks/useFilesUpload.ts`
  - `src/components/files/index.tsx`
  - `src/components/preview.tsx`
- 对这一步的要求是：
  - 主流程用户可见错误尽量走稳定错误语义和共享 helper
  - 非阻断增强流程可以继续降级处理，不强行全部升格为 UI 错误
- 允许继续保留 warning-only 的增强失败：
  - `photo` enrichment
  - `presence` enrichment

## Test Plan

- Step 1 至少更新并运行：
  - `src/components/permissions/utils/permissionDialogSharedUtils.test.ts`
  - `src/components/permissions/hooks/usePermissionDialogApiRequestState.test.tsx`
  - `src/components/containers/index.test.tsx`
- 如果新增共享 API error helper，补一个对应的 targeted test file。
- Step 1 完成后运行：
  - `npm run lint`
- Step 2 至少补跑：
  - `src/components/files/hooks/useFilesData.test.tsx`
  - 相关 files targeted tests
- Step 2 完成后再运行：
  - `npm run lint`

## Step Prompts

### Step 1 Prompt

目标：先把 permissions 链路和 backend/download 的直接消费者做成当前前端 error management 的标准模板，不扩大到 files 内部所有 Graph 路径。

```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第一步，严格控制范围，不顺手扩大改动。

目标：
1. 把 `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts` 中的 `missingTarget` 改成标准错误。
2. 把 `load / prepare / apply` 三类 message 保留为 fallback error messages。
3. 把 permissions 共享命名从 `*StatusMessages` 统一改为 `*ErrorMessages`。
4. 补齐 `src/services/backendApi.ts` 和 `src/services/downloadApi.ts` 的结构化错误解析能力。
5. 只更新这些 service 的直接消费者：`src/components/containers/index.tsx` 与 `src/components/files/hooks/useFilesArchiveDownload.ts`。

具体要求：
- 先阅读：
  - `src/common/errors.ts`
  - `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts`
  - `src/components/permissions/utils/permissionDialogSharedUtils.ts`
  - `src/services/permissionApiShared.ts`
  - `src/services/backendApi.ts`
  - `src/services/downloadApi.ts`
  - `temp/frontend-error-handling-findings-2026-05-29.md`
- `missingTarget` 默认建模为 `FrontendValidationError("missingTarget", "...")`，不要新建多余 subclass。
- `buildPermissionStatusMessages` 改名为 `buildPermissionErrorMessages`。
- `permissionStatusMessages` 改名为 `permissionErrorMessages`，并同步更新：
  - `ContainerPermissionDialog.tsx`
  - `ItemPermissionDialog.tsx`
  - `PermissionDialogFrame.tsx`
  - 相关测试
- 新增一个共享 API error response helper，统一解析 `common/contracts/apiErrorContracts.ts` 的结构化错误体。
- `backendApi.ts` 和 `downloadApi.ts` 的失败分支都复用这个 helper，不再只拼 `${operation} failed: ${response.status}`。
- `DownloadSaveTargetSelectionCancelledError` 保持现状，不要改语义。
- `containers/index.tsx` 与 `useFilesArchiveDownload.ts` 改为消费标准化后的错误，而不是直接读 `error.message`。
- 所有新增注释和 JSDoc 用简体中文。
- 保持最小改动，不重做 files 模块其余流程。

验证要求：
- 更新并运行相关 targeted tests。
- 运行 `npm run lint`。

最后输出：
- 改了哪些错误边界
- 哪些地方已经标准化
- 哪些 files 路径明确留到 Step 2
- 测试与 lint 结果
```

### Step 2 Prompt

目标：在 Step 1 已完成的前提下，继续收口 files 模块剩余的主流程错误消费路径，但不重做整体架构。

```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第二步，前提是假设 Step 1 已完成。

目标：
1. 继续收口 `files` 模块里仍然直接面向 raw message / console 的主流程错误。
2. 让用户可见错误尽量基于共享错误 helper 和稳定语义，而不是继续散落在 hooks / page 组件里各自拼接。
3. 不重做全局状态，不引入新的错误架构层，不顺手扩大到无关模块。

重点检查并处理：
- `src/components/files/hooks/useFilesData.tsx`
- `src/components/files/hooks/useFilesUpload.ts`
- `src/components/files/index.tsx`
- `src/components/preview.tsx`

具体要求：
- 先阅读：
  - `src/common/errors.ts`
  - Step 1 引入或更新的共享 API error helper
  - `temp/frontend-error-handling-findings-2026-05-29.md`
- 主流程用户可见错误要尽量走稳定错误语义和共享 helper。
- `photo` / `presence` enrichment 这类增强流程允许继续保留 warning-only 降级，不强制转成阻断式 UI 错误。
- 不要顺手重做整个 files 架构，也不要把所有 `console.warn` 都机械替换掉。
- 保持中文注释与 JSDoc 风格一致。

验证要求：
- 补齐最相关 targeted tests。
- 至少跑：
  - `src/components/files/hooks/useFilesData.test.tsx`
  - 其他与你改动直接相关的 files tests
  - `npm run lint`

最后输出：
- 哪些 files 主流程已完成标准化
- 哪些 warning-only 路径被故意保留
- 仍剩余的技术债
- 测试与 lint 结果
```

## Assumptions

- 本计划默认沿用仓库当前目录名 `docs/plannedChange`，不新建近似的 `docs/plannedchange` 目录。
- `missingTarget` 被视为本地前置条件/校验错误，因此归类为 `FrontendValidationError`，不是 API error。
- 这次命名调整只覆盖 permissions 的消息链，不顺手扩大到无关状态名，例如 `applyFeedbackStatus`。
- Step 1 是当前优先实现目标；Step 2 作为独立后续步骤，不默认并入同一批改动。
