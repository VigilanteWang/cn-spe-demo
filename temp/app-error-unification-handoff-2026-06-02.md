# AppError 彻底统一化重构交接计划

## 目标

- 将仓库中的错误体系彻底收敛到单一 `AppError`。
- 前后端都只允许直接使用 `AppError`，不再保留任何 `Frontend*`、`Backend*`、`*RequestError`、`*ApiError`、权限专用错误类或兼容壳层。
- HTTP 错误响应统一保持 `{ error: AppErrorShape }`。
- `code` 不再按 `statusCode` 推导；只有原始错误本来有字符串 `code`，或调用点明确指定时才填写。
- UI 可见错误文案统一为 `name: message`。

## 统一后的唯一错误形状

```ts
type AppError = {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  originError?: {
    source?: "microsoft-graph" | "app" | "network" | "validation";
    raw?: unknown;
    codePath?: string[];
    requestId?: string;
    retryAfter?: number;
  };
  cause?: unknown;
};
```

## 必须执行的收口原则

### 1. Shared Contract And Runtime

- 修改 `common/contracts/errorContracts.ts`
  - 删除 `ErrorCode` 联合类型。
  - 删除 `IErrorResponseBody<TCode>` 这种泛型设计。
  - 只保留单一 `AppErrorShape` 与 `IErrorResponseBody`。
- 修改 `common/contracts/permissionCommonContracts.ts`
  - 删除 `PermissionApiErrorCode`。
  - 权限相关错误响应直接依赖 `IErrorResponseBody`。
- 修改 `common/appError.ts`
  - 保留并作为唯一运行时中心：
    - `AppError`
    - `isAppError`
    - `toAppError`
    - `serializeAppError`
    - `deserializeAppError`
    - `serializeUnknownCause`
    - `extractGraphOriginError`
    - `formatAppErrorMessageForUI`
    - `readErrorStatusCode`
    - `readErrorMessage`
  - 删除任何 `status -> code` 推断逻辑。
  - `toAppError` 只做最小收口：
    - 已是 `AppError` 直接返回
    - 否则只读取原始 `message`、`statusCode`、`code`、`originError`、`cause`
  - `retryAfter` 仍只从 Graph 响应头读取。
  - `originError.raw` 保留 GraphError 完整可序列化快照。

### 2. Frontend: 全量去壳

- 将 `src/common/errors.ts` 改成纯 re-export 层。
- 删除以下前端错误类与兼容 helper：
  - `FrontendErrorBase`
  - `FrontendApiError`
  - `FrontendValidationError`
  - `FrontendConfigError`
  - `FrontendUserActionError`
  - `formatStandardErrorMessageForUI`
- 所有前端本地错误统一直接 `new AppError({...})`。
- 所有前端控制流统一改成：
  - `isAppError(error) && error.code === "..."`
  - `isAppError(error) && error.name === "..."`
- `src/services/apiErrorMapper.ts`
  - 成功解析 payload 时直接 `deserializeAppError`
  - 失败时构造最小 `AppError`
  - 删除 `fallbackCode`
  - 删除基于 `response.status` 的 code 推断
- 删除以下错误壳或子类：
  - `PermissionApiError`
  - `ArchiveRequestError`
  - `DownloadSaveTargetSelectionCancelledError`
  - `ClientConfigError`
- 相关热点文件：
  - `src/common/config.ts`
  - `src/components/app/AppErrorBoundary.tsx`
  - `src/components/containers/index.tsx`
  - `src/components/files/components/FilesProgress.tsx`
  - `src/components/files/filesTypes.ts`
  - `src/components/files/hooks/useFilesArchiveDownload.ts`
  - `src/components/files/hooks/useFilesUpload.ts`
  - `src/components/files/services/filesErrors.ts`
  - `src/components/permissions/hooks/usePermissionDialogApiRequestState.ts`
  - `src/components/permissions/hooks/usePermissionPrincipalSearch.ts`
  - `src/components/permissions/services/containerPermissionDiff.ts`
  - `src/components/permissions/services/itemPermissionDiff.ts`
  - `src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchError.ts`
  - `src/components/permissions/utils/permissionDialogSharedUtils.ts`
  - `src/components/preview/components/PreviewContent.tsx`
  - `src/components/preview/models/previewTypes.ts`
  - `src/components/preview/services/previewErrors.ts`
  - `src/services/apiClient.ts`
  - `src/services/archiveDownloader.ts`
  - `src/services/backendApi.ts`
  - `src/services/downloadApi.ts`
  - `src/services/permissionApiShared.ts`
  - `src/services/containerPermissionApi.ts`
  - `src/services/itemPermissionApi.ts`

### 3. Backend: 全量去壳

- 删除 `server/common/errorDefinitions.ts` 中的所有 `Backend*` 类与兼容参数层。
- 修改 `server/common/errorResponse.ts`
  - 只围绕 `AppError`：
    - `normalizeError(error: unknown): AppError`
    - `toApiErrorResponseBody(error: AppError): IErrorResponseBody`
    - `sendApiError`
    - `withErrorHandling`
  - 删除 `statusToCodeMap`
  - 删除 `ErrorCode`
  - 未提供 `statusCode` 时默认 500
  - 未提供 `message` 时默认 `"An unexpected server error occurred."`
  - `code` 只在原始异常本来有字符串 `code` 时保留
- 修改 `server/common/errorUtils.ts`
  - 只保留读取/提取型 helper
  - 删除：
    - `toBackendGraphError`
    - `readCodeFromStatusCode`
    - `readCategoryFromStatusCode`
    - `readSourceFromUnknownError`
    - `readErrorDetails`
- 后端所有模块统一直接 `throw new AppError({...})`
  - `server/auth.ts`
  - `server/listContainers.ts`
  - `server/createContainer.ts`
  - `server/deleteItems.ts`
  - `server/downloadHandlers.ts`
  - `server/download/downloadErrors.ts`
  - `server/download/downloadGraph.ts`
  - `server/containerPermissions/containerPermissionsError.ts`
  - `server/containerPermissions/containerPermissionsHandlers.ts`
  - `server/containerPermissions/containerPermissionsRequestParser.ts`
  - `server/itemPermissions/itemPermissionsError.ts`
  - `server/itemPermissions/itemPermissionsHandlers.ts`
  - `server/itemPermissions/itemPermissionsRequestParser.ts`
  - `server/itemPermissions/itemPermissionRoleMapper.ts`
  - `server/permissionsCore/permissionGraphReaders.ts`
- Graph 错误规则：
  - `statusCode` 直接来自原始 Graph error
  - `code` 仅保留原始 Graph error 顶层字符串 `code`
  - 更深层 code 只进入 `originError.codePath`
  - 不再将 `429/503/504` 映射成仓库自定义 code

### 4. Cleanup Boundaries

- 删除 repo 中所有“仅为错误包装存在”的壳类、壳类型、壳 re-export。
- 所有文档、测试、JSDoc 中提到以下旧名的地方都改成 `AppError`：
  - `FrontendApiError`
  - `BackendValidationError`
  - `ContainerPermissionApiError`
  - `ItemPermissionApiError`
  - 以及其他类似命名
- 所有仍在断言顶层 `requestId` 或 `retryAfterSeconds` 的测试，统一改成：
  - `error.originError?.requestId`
  - `error.originError?.retryAfter`
- 所有仍在断言 `Retry after ...` 或 `Request ID: ...` UI 文案的测试，统一改成只断言 `name: message`。

## 当前已确认的主要遗留点

### Shared 层

- `common/contracts/errorContracts.ts` 仍保留 `ErrorCode` 与泛型 `IErrorResponseBody<TCode>`。
- `common/contracts/permissionCommonContracts.ts` 仍保留 `PermissionApiErrorCode`。
- `common/appError.ts` 仍有 `readErrorCodeFromStatusCode` 和带 `status -> code` 推断的 `toAppError`。

### Frontend 层

- `src/common/errors.ts` 仍保留旧前端错误类与 `formatStandardErrorMessageForUI` 别名。
- `src/common/config.ts` 仍有 `ClientConfigError`。
- `src/services/downloadApi.ts` 仍有 `DownloadSaveTargetSelectionCancelledError` 和 `ArchiveRequestError` 风格包装。
- `src/services/permissionApiShared.ts` 仍有 `PermissionApiError`。
- `src/services/containerPermissionApi.ts` / `src/services/itemPermissionApi.ts` 仍在 re-export 权限错误别名。
- `src/services/apiErrorMapper.ts` 仍在使用 `fallbackCode` 和按状态码推导 code。

### Backend 层

- `server/common/errorDefinitions.ts` 仍保留 `BackendError`、`BackendAuthError`、`BackendValidationError`、`BackendGraphError`、`BackendInternalError`。
- `server/common/errorUtils.ts` 仍保留 `toBackendGraphError`、`readCodeFromStatusCode` 等旧逻辑。
- `server/common/errorResponse.ts` 仍保留 `statusToCodeMap` 和旧的 code 映射。
- 权限模块仍保留专用错误包装和响应构造。

## 推荐执行顺序

1. 先收紧 shared contract 和 `common/appError.ts`
2. 再删 frontend error 壳层并修通 `src/services/*`
3. 再删 backend error 壳层并统一 `server/common/errorResponse.ts`
4. 再清 permission / download / preview / files 的遗留引用
5. 最后统一测试与文档命名

## 验证清单

- 定向 Vitest
  - `server/common/errorResponse.test.ts`
  - `server/common/errors.test.ts`
  - `src/services/backendApi.test.ts`
  - `src/services/downloadApi.test.ts`
  - `src/components/preview/components/PreviewContent.test.tsx`
  - `src/components/permissions/ContainerPermissionDialog.test.tsx`
  - `src/components/permissions/ItemPermissionDialog.test.tsx`
- 类型检查
  - `npx tsc --noEmit`
  - `npx tsc -p server/tsconfig.json --noEmit`
- 代码质量
  - `npm run lint`
  - `git diff --check`

## 交接备注

- 这次目标不是“兼容迁移”，而是“彻底删壳”。
- 如果实现过程中遇到残留的 `instanceof` 控制流，不要新增兼容类，直接改成基于 `AppError.code` 或 `AppError.name` 的判断。
- 如果某处历史上依赖“稳定 code 映射”，优先重新评估是否真的需要；按当前要求，默认只保留 `statusCode`，`code` 不做自动标准化。
