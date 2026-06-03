# AppError 与 GraphError 精简改造计划

## 背景

- 提交 `f35015ece65ba2600977b21f68fc8df883d5baa3` 之后，前后端错误已经统一收敛为共享 `AppError`。
- 当前问题不在“是否继续统一”，而在于 `common/appError.ts` 对 Graph 错误做了过多猜测性解析，导致：
  - `AppError` 基类、Graph SDK 适配、通用序列化、UI 文案格式化都挤在同一个文件里。
  - Graph 错误路径里存在较多 `unknown` 判断、宽松 shape 推断、大小写兼容和多层兜底。
  - 非 Graph 错误为了贴合统一结构，被额外推断了并不稳定的字段。

## 本次改造目标

1. 继续维持当前“前后端统一 `AppError` + 共享 `AppErrorShape`/`IErrorResponseBody`”架构。
2. 非 Graph 错误采用最小归一化策略：
   - 原始错误里有什么就保留什么。
   - 没有的字段不强行补齐。
   - `originError.raw` 负责兜底保存原始错误快照。
3. Graph 错误采用 SDK 直读策略：
   - 以 `msgraph-sdk-javascript` 的 `GraphError` 真实结构为准。
   - 不再为“可能不是 Graph SDK 错误”的变体做大量兼容。
   - 在保留基本类型安全的前提下，减少 `unknown` 推断和多层 guard。
4. `common/appError.ts` 拆分职责，避免单文件继续膨胀。

## 已确认的现状落点

### 统一错误边界

- 共享 contract 在 `common/contracts/errorContracts.ts`
  - `AppErrorShape`
  - `IOriginErrorInfo`
  - `IErrorResponseBody`
- 后端统一响应在 `server/common/errorResponse.ts`
  - `normalizeError(...)`
  - `toApiErrorResponseBody(...)`
  - `sendApiError(...)`
- 前端统一反序列化在 `src/services/apiErrorMapper.ts`
  - `deserializeAppError(...)`
  - `readApiErrorResponseSummary(...)`

### 当前 Graph 相关逻辑集中点

- `common/appError.ts`
  - `extractGraphOriginError(...)`
  - `readErrorRequestId(...)`
  - `readErrorRetryAfter(...)`
  - `readErrorStatusCode(...)`
  - `readGraphCodePath(...)`
  - `buildGraphRawSnapshot(...)`
- 后端 Graph 错误入口
  - `server/common/appErrorHelpers.ts` 的 `toGraphAppError(...)`
- 后端兼容层
  - `server/common/errorUtils.ts`

### 当前前端展示入口

- `src/common/errors.ts` 负责把共享错误能力重新导出给前端。
- UI 直接依赖 `formatAppErrorMessageForUI(...)`，不应把 Graph shape 解析继续下沉到组件层。

## 推荐设计

### 1. 保留统一 AppError 外壳，不改传输协议

- 保留以下共享结构不变：
  - `AppError`
  - `AppErrorShape`
  - `IOriginErrorInfo`
  - `IErrorResponseBody`
- 保留后端响应 envelope：

```ts
{
  error: AppErrorShape;
}
```

- 保留前端收到后通过 `deserializeAppError(...)` 还原为运行时 `AppError` 的方式。

### 2. 非 Graph 错误改为最小归一化

- 非 Graph 错误统一进入 `toAppError(...)` / `normalizeError(...)` 后，只做这些事情：
  - `name`：原始错误有就保留，否则回退 `"AppError"`
  - `message`：原始错误有就保留，否则用调用方 fallback
  - `code`：仅当原始错误本身有字符串 `code` 时保留
  - `statusCode`：仅当原始错误本身有可读数值时保留，否则用默认值
  - `cause`：继续保留原始错误
  - `originError`：默认写成

```ts
{
  source: "app",
  raw: serializeUnknownCause(error),
}
```

- 不再为了统一模型去额外推断：
  - `requestId`
  - `retryAfter`
  - `codePath`
  - 任何 Graph 风格字段

### 3. Graph 错误改为 SDK 直读

- 在 Graph 专用模块中定义内部 shape，只按 SDK 已知字段读取：

```ts
type GraphSdkErrorShape = {
  name?: string;
  message?: string;
  statusCode?: number;
  code?: string;
  requestId?: string;
  date?: string;
  headers?: Headers | Record<string, string>;
  body?: unknown;
};
```

- `toGraphAppError(...)` 继续保留，作为“这里明确在处理 Graph SDK 错误”的边界函数。
- 进入该函数后：
  - 直接读取顶层 `statusCode`
  - 直接读取顶层 `code`
  - 直接读取顶层 `requestId`
  - `retryAfter` 只从顶层 `headers` 读取
  - `raw` 保留 Graph SDK 顶层快照
- 若 `body` 符合标准 Graph error JSON，再从标准 `error.innerError` 链提取 `codePath`。
- 不再继续做这些兼容：
  - `innerError` / `innererror` 双分支兼容
  - `response.headers` / `responseHeaders` / `body.headers` 多路径兜底
  - `error.error`、`body.error`、`directError` 多层猜测
  - “看起来像 GraphError 就按 GraphError 处理”的宽松识别

### 4. 拆分 `common/appError.ts`

- 推荐改为 `common/appError/` 目录：
  - `AppError.ts`
  - `appErrorGuards.ts`
  - `appErrorSerialization.ts`
  - `appErrorNormalization.ts`
  - `appErrorUi.ts`
  - `graphSdkError.ts`
  - `index.ts`
- 职责建议：
  - `AppError.ts`：只放类定义与 `IAppErrorInit`
  - `appErrorGuards.ts`：只放 `isAppError`
  - `appErrorSerialization.ts`：只放 `serializeUnknownCause`、`serializeAppError`、`deserializeAppError`
  - `appErrorNormalization.ts`：只放通用 `toAppError`、`readErrorMessage`、`readErrorStatusCode`
  - `graphSdkError.ts`：只放 Graph SDK 读取与 `extractGraphOriginError`
  - `appErrorUi.ts`：只放 `formatAppErrorMessageForUI`
- 为减少改动面：
  - `common/appError.ts` 暂时保留为兼容 re-export 层。
  - `src/common/errors.ts` 继续作为前端 facade，不要求一次性修改全仓 import。

## 共享 contract 建议

- `common/contracts/errorContracts.ts` 不新增新的共享字段。
- `IOriginErrorInfo` 继续保持当前最小集合：

```ts
interface IOriginErrorInfo {
  source?: "microsoft-graph" | "app" | "network" | "validation";
  raw?: unknown;
  codePath?: string[];
  requestId?: string;
  retryAfter?: number;
}
```

- 本次不为 React、TypeScript、Node 等非 Graph 错误单独扩展共享字段。

## 实施顺序

1. 先拆 `common/appError.ts`，但先通过 re-export 保持外部 import 不变。
2. 再把 Graph 解析逻辑迁移到 `graphSdkError.ts`，删除多余 shape 猜测。
3. 再收紧 `toAppError(...)` 和 `normalizeError(...)` 的非 Graph 归一化逻辑。
4. 最后补测试并检查前后端调用点是否仍符合统一 `AppError` 协议。

## 建议验证

### 后端

- `server/common/errors.test.ts`
  - Graph SDK 错误应直接读出 `statusCode`、`code`、`requestId`、`Retry-After`
  - 若 `body` 是标准 Graph error JSON，应能提取 `codePath`
  - 若 `body` 不是标准结构，应停止猜测，但 `raw` 仍完整保留
- `server/common/errorResponse.test.ts`
  - 原生 `Error`
  - 普通对象错误
  - 字符串 / 非对象抛错
  - 都应生成统一 `AppError`

### 前端

- `src/services/apiErrorMapper.ts`
  - 结构化后端错误应能正确反序列化
  - `Retry-After` header 仍应覆盖到 `originError.retryAfter`
- 相关调用点验证：
  - `src/services/backendApi.ts`
  - `src/components/containers/index.tsx`
  - `src/components/files/index.tsx`
  - `src/components/preview/components/PreviewContent.tsx`

### 类型检查

- `npm test -- --run server/common/errors.test.ts server/common/errorResponse.test.ts`
- `npx tsc --noEmit`

## 需要特别避免的实现方式

- 不要把“统一 AppError”再次做成“所有错误字段都必须被推断出来”的大而全模型。
- 不要在 Graph 专用入口里继续维护大量“也许不是 SDK GraphError”的兼容分支。
- 不要为这次重构新增新的错误大类、错误继承树或额外共享协议。
- 不要让 UI 组件自己再去识别 Graph 错误结构。

## 与昨天文档的关系

- `temp/app-error-unification-handoff-2026-06-02.md` 更偏向“彻底统一化”的大方案。
- 本文档是这轮更精确的后续方案：
  - 保留统一 `AppError`
  - 精简 Graph SDK 处理
  - 放宽非 Graph 错误的归一化要求
  - 拆分 `common/appError.ts`
