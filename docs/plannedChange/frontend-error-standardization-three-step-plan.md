# 前端 Error Standardization 三步计划

## Summary

- Step 1 已完成，当前代码里已经落地了 `permissions` 模板化收口、`src/services/apiErrorMapper.ts`、`backendApi.ts`、`downloadApi.ts`，以及它们的直接消费者改造。
- 在 Step 2 开始前，Preview 模块又先完成了目录化重组；`src/components/preview.tsx` 已删除，当前公开入口是 `src/components/preview/index.tsx`。
- 因此，这份计划不再把 Preview 的“结构重组”当作 Step 2 内容，而是只处理 Preview 模块剩余的 error standardization 缺口。
- 结合最新代码，剩余工作现在更准确地分成两类：
  1. 已经直接进入用户可见 UI，但仍以裸字符串或后端原始字符串数组收口的路径。
  2. 还停留在 `console`、计数或静默失败层，尚未形成稳定 UI 错误消费闭环的主流程。
- 为避免范围失控，后续继续按“三步走”推进，但当前状态应理解为：
  1. Step 1：已完成。
  2. Step 2：处理 Preview 模块和 archive download 中剩余的用户可见错误收口。
  3. Step 3：处理 `files` 主流程里日志型、计数型和静默型未收口路径。

## Current Status

### 1. Step 1：已完成的模板层

- `permissions` 链路已经完成模板化收口：
  - `missingTarget` 已改为标准错误语义。
  - `load / prepare / apply` fallback message 已从标准错误语义里分离出来。
  - `*StatusMessages` 已统一为 `*ErrorMessages`。
- `src/services/apiErrorMapper.ts` 已存在，并已统一解析后端结构化错误体 `IApiErrorResponseBody`。
- `src/services/backendApi.ts` 已改为复用共享 helper，并保留：
  - `code`
  - `statusCode`
  - `requestId`
  - `retryAfterSeconds`
  - `details`
- `src/services/downloadApi.ts` 已完成同类收口，`DownloadSaveTargetSelectionCancelledError` 仍保持“用户主动取消”语义，不与 API 失败合并。
- 直接消费者里，以下路径已经接上标准化错误格式：
  - `src/components/containers/index.tsx`
  - `src/components/files/hooks/useFilesArchiveDownload.ts`
- 当前代码里也已经有针对 Step 1 的 focused tests：
  - `src/services/backendApi.test.ts`
  - `src/services/downloadApi.test.ts`
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`

### 2. Step 2：处理仍直接进入用户可见 UI 的剩余错误路径

- Preview 的结构重组已完成，不再是这一步的目标。
- 当前 Step 2 最明确的目标，已经从旧的 `src/components/preview.tsx` 收敛为以下真实代码边界：
  - `src/components/preview/hooks/usePreviewUrl.ts`
  - `src/components/preview/models/previewTypes.ts`
  - `src/components/preview/components/PreviewContent.tsx`
  - `src/components/preview/index.tsx`（如需只做轻量透传调整）
  - `src/components/files/hooks/useFilesArchiveDownload.ts`
- 这一步要解决的不是 Preview 的目录结构，而是它内部仍存在的“错误先变成字符串，再直接渲染”的路径：
  - `usePreviewUrl.ts` 当前仍用 `useState<string>("")` 持有 `error`
  - 缺少 `driveId` / `fileId` 时仍直接写入裸文案
  - 预览不可用、预览加载失败时仍直接写入裸文案
  - `PreviewContent.tsx` 当前仍直接渲染 `Error: {error}`
- archive download 这边，`startDownload` 失败、保存对话框失败、轮询 catch 分支已经部分接入标准错误格式，但仍有一个明显残留：
  - `progress.status === "failed"` 时仍直接用 `progress.errors.join("; ")` 或 `"Archive job failed."` 生成最终 UI 文案
- 对这一步的要求应更新为：
  - Preview 内部错误先进入稳定错误语义，再在渲染边界统一格式化。
  - Preview 目录结构保持现状，不再做第二轮重组。
  - archive download 的后端失败进度分支也先进入标准错误语义，再格式化成 UI 文案。
  - 继续把错误显示在原有展示面：
    - Preview 错误留在预览弹窗内部。
    - 下载相关错误留在现有 `FilesProgress` 区域。

### 3. Step 3：处理 files 主流程里日志型和静默型未收口路径

- 这一步仍然专门处理当前没有形成稳定 UI 错误消费闭环的主流程：
  - `src/components/files/hooks/useFilesData.tsx`
  - `src/components/files/hooks/useFilesUpload.ts`
  - `src/components/files/index.tsx`
- 结合最新代码，当前明确残留包括：
  - `useFilesData.tsx`
    - `loadItems` 主加载失败仍只 `console.error`
    - `photo` / `presence` enrichment 失败仍是 warning-only，且这两条允许继续保留
  - `useFilesUpload.ts`
    - 创建中间文件夹失败会抛 `FilesUploadError`，但上传主流程最终仍主要表现为计数 + 日志
    - 单文件上传失败仍未进入页面级稳定错误消费链路
  - `files/index.tsx`
    - 批量删除失败仍只 `console.error`
    - 预览内删除失败仍只 `console.error`
    - 创建文件夹失败当前没有稳定的对话框内错误展示
- 这一步的目标保持不变：
  - 页面主区域上的错误，集中显示在现有进度条区域。
  - 所有弹出对话框内的错误，各自留在各自对话框内部显示。
  - `containers` 页面按钮旁边的错误提示保持原位，不在这一步调整。

## Test Plan

- Step 1 当前代码里已经有以下 focused tests，可作为回归入口：
  - `src/services/backendApi.test.ts`
  - `src/services/downloadApi.test.ts`
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`
- 如果要在继续做 Step 2 前回归确认 Step 1，至少运行：
  - 上述 focused tests
  - `npm run lint`
- Step 2 至少补齐或扩展：
  - `src/components/preview/hooks/usePreviewUrl.test.tsx`
  - `src/components/preview/components/PreviewContent.test.tsx`，或等价的 `src/components/preview/index.tsx` focused test
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`
- Step 2 仍可继续保留并复用当前 Preview 重构期已有的回归测试，但要明确它们主要覆盖结构与行为，不覆盖新的错误标准化语义：
  - `src/components/preview/services/previewUrl.test.ts`
  - `src/components/preview/hooks/usePreviewNavigation.test.tsx`
  - `src/components/preview/components/PreviewDialogFrame.test.tsx`
- Step 2 完成后运行：
  - `npm run lint`
- Step 3 至少补跑：
  - `src/components/files/hooks/useFilesData.test.tsx`
  - `useFilesUpload` 相关 tests
  - `Files` 页面/对话框错误展示相关 tests
- Step 3 完成后运行：
  - `npm run lint`

## Step Prompts

### Step 1 Prompt（已完成，保留作回归参考）

状态：这一步已经在当前代码里完成，不再作为下一批改动目标。

如需回看范围或做回归确认，优先检查：

- `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts`
- `src/components/permissions/utils/permissionDialogSharedUtils.ts`
- `src/services/apiErrorMapper.ts`
- `src/services/backendApi.ts`
- `src/services/downloadApi.ts`
- `src/components/containers/index.tsx`
- `src/components/files/hooks/useFilesArchiveDownload.ts`
- `src/services/backendApi.test.ts`
- `src/services/downloadApi.test.ts`
- `src/components/files/hooks/useFilesArchiveDownload.test.tsx`

回归验证要求：

- 运行相关 focused tests
- 运行 `npm run lint`

### Step 2 Prompt

目标：在 Step 1 已完成、且 Preview 目录重组已完成的前提下，继续收口仍然直接进入用户可见 UI、但还没有先经过标准化错误语义的路径，不重做整体架构。

```text
请在当前 `cn-spe-demo` 仓库实现前端 error standardization 的第二步，前提是假设 Step 1 已完成，且 Preview 模块的目录重组已经完成。
目标：1. 让 Preview 模块内部错误不再直接以裸字符串状态进入 UI。2. 继续收口 archive download 中仍然直接把后端字符串数组拼成 UI 文案的失败路径。3. 保持 Preview 当前目录结构，不重做模块拆分，不顺手扩大到无关模块。

重点检查并处理：
- `src/components/preview/hooks/usePreviewUrl.ts`
- `src/components/preview/models/previewTypes.ts`
- `src/components/preview/components/PreviewContent.tsx`
- `src/components/preview/index.tsx`（仅在需要透传新错误状态时调整）
- `src/components/files/hooks/useFilesArchiveDownload.ts`

具体要求：
- 先阅读：
  - `src/common/errors.ts`
  - `src/services/apiErrorMapper.ts`
  - `temp/frontend-error-handling-findings-2026-05-29.md`
  - `temp/preview-module-refactor-change-report-2026-05-30.md`
- `usePreviewUrl.ts` 内部错误不要再只用 `string` 状态直接渲染到 UI；要先进入标准化错误语义，再在渲染边界统一格式化。
- `IPreviewContentState` 应同步表达新的错误状态，不要继续把 Preview 错误建模成裸字符串。
- 缺少 `driveId` / `fileId` 的场景默认使用 `FrontendValidationError("missingPreviewTarget", "...")` 或等价稳定 code；不新建无必要 subclass。
- 预览 API 失败但 `webUrl` 可用时，继续保持当前 fallback 行为，不要把这条路径升级成阻断式错误 UI。
- 预览不可用、预览加载失败时，默认归为 `FrontendApiError` 或现有稳定错误模型，不为这一步引入新的错误架构层。
- `PreviewContent.tsx` 负责最终展示格式化后的错误文案；错误继续显示在预览弹窗内部，不新增展示位置。
- `useFilesArchiveDownload.ts` 中 `progress.status === "failed"` 的路径，不要继续直接用 `progress.errors.join("; ")` 作为唯一错误收口；要先走标准化错误语义，再生成最终文案。
- `DownloadSaveTargetSelectionCancelledError` 保持现状，不改语义。
- 下载相关错误继续显示在现有 `FilesProgress` 区域。
- 不要顺手扩大到 `useFilesData.tsx`、`useFilesUpload.ts`、`files/index.tsx` 这类日志型或静默型路径。
- 保持中文注释和 JSDoc 风格一致。

验证要求：
- 补齐最相关 targeted tests：
  - `src/components/preview/hooks/usePreviewUrl.test.tsx`
  - `src/components/preview/components/PreviewContent.test.tsx`，或等价 focused test
  - `src/components/files/hooks/useFilesArchiveDownload.test.tsx`
- 至少跑：
  - `npm run lint`

最后输出：
- Preview 模块哪些用户可见错误路径已完成标准化
- archive download 哪个残留分支已被收口
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
  - `src/services/apiErrorMapper.ts`
  - `temp/frontend-error-handling-findings-2026-05-29.md`
  - `temp/preview-module-refactor-change-report-2026-05-30.md`
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
- Step 1 已在当前代码中完成，因此后续计划默认从 Step 2 开始推进。
- Preview 模块的目录重组已经完成，当前公开入口是 `src/components/preview/index.tsx`；Step 2 不再处理 Preview 的结构整理，只处理其剩余错误路径。
- `src/components/preview/hooks/usePreviewUrl.ts` 是当前已确认的 Preview 错误标准化主入口。
- `src/components/files/hooks/useFilesArchiveDownload.ts` 当前已经部分完成标准化；`progress.status === "failed"` 这一支仍是 Step 2 的明确残留。
- `src/components/files/hooks/useFilesData.tsx`、`src/components/files/hooks/useFilesUpload.ts`、`src/components/files/index.tsx` 当前主要属于“日志型/静默型未收口路径”，默认放进 Step 3。
- `files` 错误展示面的默认分配是：
  - 主页面上的错误集中在现有进度条区域
  - 弹出对话框内的错误，各自留在自己的对话框内
- `containers` 页面按钮旁边的错误保持原位。
- Step 2 和 Step 3 仍作为独立后续步骤，不默认并入同一批改动。
