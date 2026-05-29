# 前端 Error Standardization 三步计划

## Summary

- `usePermissionDialogApiRequestState.ts` 里的 `missingTarget` 应收口为标准错误，而不是继续作为裸字符串消息存在。
- `load / prepare / apply` 这三类请求失败文案应保留为 fallback message，用于兜底展示，而不是和标准错误语义混在同一个 `requestMessages` 对象里。
- 当前 `src/` 前端 error management 还没有完全标准化。`permissions` 模块最接近目标态，但 `backendApi.ts`、`downloadApi.ts`、`containers`，以及一部分 `files` 主流程仍主要停留在“读 `message` / 打日志”的层级。
- 新一轮排查后，可以把剩余问题拆成两类：
  1. 已经直接影响用户可见 UI，但还没有先经过标准化错误语义的路径。
  2. 还停留在 `console`、计数或静默失败层，尚未形成稳定 UI 错误消费闭环的路径。
- 为避免范围失控，本次改为按“三步走”推进：
  1. 先收口 `permissions` 全链路，并补齐 `backend/download` 的共享错误归一化和直接消费者。
  2. 再处理仍然直接影响用户可见 UI 的剩余错误路径。
  3. 最后处理 `files` 里仍停留在日志、计数或静默失败层的主流程错误路径。

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

- `src/components/containers/index.tsx` 改为消费标准化后的错误对象，而不再只用 `readErrorMessage(...)`。
- `src/components/files/hooks/useFilesArchiveDownload.ts` 改为基于标准化 archive error 生成失败文案，而不是直接拼 `error.message`。
- 目标不是一次性重做整个 `files` 模块，而是先让已经依赖 `backendApi.ts` / `downloadApi.ts` 的主流程 UI 和共享错误模型对齐。

### 4. Step 2：处理仍直接进入用户可见 UI 的剩余错误路径

- 当前最明确命中的“仅文字修改后直接到 UI、没有先标准化错误”的路径是：
  - `src/components/preview.tsx`
- 此外，`src/components/files/hooks/useFilesArchiveDownload.ts` 虽然已经部分接入统一格式化，但 `progress.status === "failed"` 时仍直接用 `progress.errors.join("; ")` 或 `"Archive job failed."` 生成 UI 文案，也应在这一步一起收口。
- 对这一步的要求是：
  - `Preview` 内部错误不再只存 `string`，而是先进入标准化错误语义，再在渲染边界统一格式化。
  - 缺少 `driveId` / `fileId` 的场景默认归类为 `FrontendValidationError`。
  - 预览不可用、预览加载失败默认归类为 `FrontendApiError`，不为了这一批改动额外引入新的错误 subclass。
  - `useFilesArchiveDownload.ts` 里所有写入 `errorMessage` 的失败路径，都应先走标准化错误语义，再格式化成最终展示字符串。
  - 下载相关错误继续显示在现有 `FilesProgress` 区域；`Preview` 相关错误继续显示在预览对话框内部，不新增展示位置。

### 5. Step 3：处理 files 里日志型和静默型未收口路径

- 这一步专门处理以下当前还没有形成稳定 UI 错误消费闭环的主流程：
  - `src/components/files/hooks/useFilesData.tsx`
  - `src/components/files/hooks/useFilesUpload.ts`
  - `src/components/files/index.tsx`
- 对这一步的要求是：
  - 主页面上的错误集中显示在现有进度条区域。
  - 所有弹出对话框内的错误，各自留在对话框内部显示。
  - `containers` 页面按钮旁边的错误提示保持原位，不因为这一步改位置。
  - `useFilesData.tsx` 的列表主加载失败，应从单纯 `console.error` 升级为页面可消费的标准化错误。
  - `useFilesUpload.ts` 的上传主流程失败，应形成标准化错误语义，并进入页面级错误消费链路。
  - `files/index.tsx` 里的建文件夹失败、删除失败、预览内删除失败，应根据对应交互入口分别显示在各自对话框中，而不是继续只打日志。
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
  - `preview` 相关测试
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`
- 如果 Step 2 改到了展示组件，再补对应 `FilesProgress` 相关测试。
- Step 2 完成后运行：
  - `npm run lint`
- Step 3 至少补跑：
  - `src/components/files/hooks/useFilesData.test.tsx`
  - `useFilesUpload` 相关 tests
  - `Files` 页面/对话框错误展示相关 tests
- Step 3 完成后运行：
  - `npm run lint`

## Step Prompts

### Step 1 Prompt

目标：先把 permissions 链路和 backend/download 的直接消费者做成当前前端 error management 的标准模板，不扩大到 files 内部所有 Graph 路径。
```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第一步，严格控制范围，不顺手扩大改动。
目标：1. 把 `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts` 中的 `missingTarget` 改成标准错误。2. 把 `load / prepare / apply` 三类 message 保留为 fallback error messages。3. 把 permissions 共享命名从 `*StatusMessages` 统一改为 `*ErrorMessages`。4. 补齐 `src/services/backendApi.ts` 和 `src/services/downloadApi.ts` 的结构化错误解析能力。5. 只更新这两个 service 的直接消费者：`src/components/containers/index.tsx` 和 `src/components/files/hooks/useFilesArchiveDownload.ts`。
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

目标：在 Step 1 已完成的前提下，继续收口仍然直接进入用户可见 UI、但还没有先经过标准化错误语义的路径，不重做整体架构。
```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第二步，前提是假设 Step 1 已完成。
目标：1. 继续收口仍然直接进入用户可见 UI、但还没有先经过标准化错误语义的路径。2. 让用户可见错误尽量基于共享错误 helper 和稳定语义，而不是继续散落在组件里各自拼接字符串。3. 不重做全局状态，不引入新的错误架构层，不顺手扩大到无关模块。

重点检查并处理：
- `src/components/preview.tsx`
- `src/components/files/hooks/useFilesArchiveDownload.ts`

具体要求：
- 先阅读：
  - `src/common/errors.ts`
  - Step 1 引入或更新的共享 API error helper
  - `temp/frontend-error-handling-findings-2026-05-29.md`
- `Preview` 组件内部错误不要再只用 `string` 状态直接渲染到 UI；要先进入标准化错误语义，再在渲染边界统一格式化。
- 缺少 `driveId` / `fileId` 的场景默认使用 `FrontendValidationError("missingPreviewTarget", "...")` 或等价稳定 code；不新建无必要 subclass。
- 预览不可用、预览加载失败默认归为 `FrontendApiError` 或现有稳定错误模型，不为这一步引入新的错误架构层。
- `useFilesArchiveDownload.ts` 中所有写入 `errorMessage` 的失败路径都要先走标准化错误语义，再生成最终文案；尤其不要继续直接用 `progress.errors.join("; ")` 作为唯一错误收口。
- `Preview` 错误继续显示在预览对话框内部；下载相关错误继续显示在现有 `FilesProgress` 区域，不新增新的错误展示面。
- 不要顺手重做整个 files 架构，也不要扩大到 `useFilesData.tsx`、`useFilesUpload.ts`、`files/index.tsx` 这类日志型或静默型路径。
- 保持中文注释和 JSDoc 风格一致。

验证要求：
- 补齐最相关 targeted tests：
  - `preview` 相关 tests
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`
- 如果改动触达 `FilesProgress`，补对应 tests。
- 至少跑：
  - `npm run lint`

最后输出：
- 哪些用户可见错误路径已完成标准化
- 哪些路径被明确留到 Step 3
- 测试与 lint 结果
```

### Step 3 Prompt

目标：在 Step 2 已完成的前提下，处理 `files` 里还停留在日志、计数或静默失败层的主流程错误路径，并明确它们各自的 UI 展示面。
```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第三步，前提是假设 Step 1 和 Step 2 已完成。
目标：1. 处理 `files` 模块里还停留在 `console`、计数或静默失败层的主流程错误路径。2. 让这些错误进入稳定的前端错误语义与 UI 消费闭环。3. 不重做整个 files 架构，不引入新的全局错误状态层。

重点检查并处理：
- `src/components/files/hooks/useFilesData.tsx`
- `src/components/files/hooks/useFilesUpload.ts`
- `src/components/files/index.tsx`

具体要求：
- 先阅读：
  - `src/common/errors.ts`
  - Step 1 引入或更新的共享 API error helper
  - `temp/frontend-error-handling-findings-2026-05-29.md`
- 页面主区域上的错误，统一集中显示在现有进度条区域。
- 所有弹出对话框内的错误，各自显示在自己的对话框内部。
- `containers` 页面按钮旁边的错误保持原位，不在这一步调整。
- `useFilesData.tsx` 中列表主加载失败，不要继续只打 `console.error`；要形成页面可消费的标准化错误状态。
- `photo` / `presence` enrichment 继续保留 warning-only 降级，不强制转成阻断式 UI 错误。
- `useFilesUpload.ts` 中上传主流程失败，不要继续停留在 `readErrorMessage(...)` + 计数 + 日志层；要形成标准化错误语义，并被页面层消费。
- `files/index.tsx` 中：
  - 创建文件夹失败显示在创建文件夹对话框内
  - 删除失败显示在删除确认对话框内
  - 预览内删除失败显示在预览对话框内
- 不要顺手把所有 `console.warn` 都机械替换掉，也不要为这一批改动引入新的全局错误框架。
- 保持中文注释和 JSDoc 风格一致。

验证要求：
- 补齐最相关 targeted tests：
  - `src/components/files/hooks/useFilesData.test.tsx`
  - `useFilesUpload` 相关 tests
  - `Files` 页面/对话框错误展示相关 tests
- 至少跑：
  - `npm run lint`

最后输出：
- 哪些 `files` 主流程已完成标准化
- 哪些 warning-only 路径被故意保留
- 仍剩余的技术债
- 测试与 lint 结果
```

## Assumptions

- 本计划默认沿用仓库当前目录名 `docs/plannedChange`，不新建近似的 `docs/plannedchange` 目录。
- `missingTarget` 被视为本地前置条件/校验错误，因此归类为 `FrontendValidationError`，不是 API error。
- 这次命名调整只覆盖 permissions 的消息链，不顺手扩大到无关状态名，例如 `applyFeedbackStatus`。
- `src/components/preview.tsx` 是当前已确认的“裸文案直接进入 UI”的明确命中路径，优先放进 Step 2。
- `src/components/files/hooks/useFilesData.tsx`、`src/components/files/hooks/useFilesUpload.ts`、`src/components/files/index.tsx` 当前主要属于“日志型/静默型未收口路径”，默认放进 Step 3。
- `files` 错误展示面的默认分配是：
  - 主页面上的错误集中在现有进度条区域
  - 弹出对话框内的错误，各自留在自己的对话框内
- `containers` 页面按钮旁边的错误保持原位。
- Step 1 是当前优先实现目标；Step 2、Step 3 作为独立后续步骤，不默认并入同一批改动。
