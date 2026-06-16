# AppError / Graph 错误精简计划复核版（2026-06-05）

## 结论

- 这份 change 仍然有效，不应删除。
- 但它已经不再是“继续做大一统重构”，而是一个更小的 cleanup。
- `AppError` 主体统一已经完成；现在剩下的是：
  - 缩减 `common/appError.ts` 里对 Graph 错误的猜测性解析
  - 清理少量仍保留语义包装名的前端错误壳层

## 当前已完成、因此不该再作为计划主体的内容

以下内容已经落地，不应继续按“待实现”写：

### 1. 共享错误 contract 已经统一

- `common/contracts/errorContracts.ts`
- 现在只保留：
  - `AppErrorShape`
  - `IOriginErrorInfo`
  - `IErrorResponseBody`

### 2. `src/common/errors.ts` 已经是纯 re-export facade

- 前端已经不再维持独立 `Frontend*` 基类

### 3. `src/services/apiErrorMapper.ts` 已经切到统一反序列化模型

- 结构化错误直接 `deserializeAppError(...)`
- 不再有旧的 `fallbackCode`
- 不再按 `response.status` 自动推导稳定 `code`

### 4. 后端旧的 `Backend*` 错误体系已经不再是主路径

- `server/common/errorDefinitions.ts` 已不存在
- `server/common/errorResponse.ts` 已围绕 `AppError` 做统一收口

### 5. 权限共享 contract 已经不再保留旧的权限错误码体系

- `common/contracts/permissionCommonContracts.ts`
- 现在只把权限接口错误响应别名到 `IErrorResponseBody`

## 当前仍然有效的问题

### 1. `common/appError.ts` 仍承担过多职责

目前它同时包含：

- `AppError` 类定义
- 通用 `unknown -> AppError` 归一化
- Graph 错误形状识别
- 多路径 header 读取
- `innerError / innererror` 兼容链
- 原始错误序列化
- UI 文案格式化

这会带来两个问题：

- 文件过大，职责边界不清
- Graph 解析逻辑会继续吸附到“统一错误中心”里，难以收紧

### 2. Graph 错误识别仍然偏猜测式

`common/appError.ts` 当前仍保留多种兼容路径：

- `record.headers`
- `record.response.headers`
- `record.responseHeaders`
- `record.body.headers`
- `body.error`
- `record.error`
- `innerError`
- `innererror`

以及“只要长得像 GraphError 就按 Graph 处理”的策略。

这与当前目标不一致，因为我们现在更想要的是：

- Graph 入口明确时才做 Graph 读取
- 非 Graph 错误尽量少猜

### 3. `normalizeError()` / `toAppError()` 仍会对普通未知错误做 Graph 探测

- `server/common/errorResponse.ts`
- `common/appError.ts`

这意味着很多未知错误即使只是普通对象或普通 `Error`，也会先经过 Graph shape 探测。

### 4. 前端仍有少量语义包装名残留

这些不再是大问题，但仍属于 cleanup 范围：

- `src/services/downloadApi.ts`
  - `ArchiveRequestError`
  - `DownloadSaveTargetSelectionCancelledError`
- `src/components/permissions/services/directoryPrincipalSearch/directoryPrincipalSearchError.ts`
  - `DirectoryPrincipalSearchAppError`
- `src/services/itemPermissionApi.ts`
  - `ItemPermissionApiError` 类型别名

这里不是说这些名字一定都要删光，而是需要重新判断：

- 它们是否真的提供了不可替代的业务语义
- 还是只是统一后遗留的“额外壳”

## 更新后的建议范围

这轮 issue 建议收窄成两个目标。

### Goal 1：把 Graph 解析限制在明确的 Graph 边界函数里

建议方向：

1. 让 `toGraphAppError(...)` 继续作为 Graph 专用入口
2. 把大部分 Graph shape 读取逻辑从 `common/appError.ts` 挪到独立模块
3. 收紧 Graph 识别来源，优先只支持当前仓库真实在用的 SDK/响应形状
4. 非 Graph 路径默认不主动做大量 Graph 风格探测

### Goal 2：清掉少量已经不再必要的包装壳

优先复核这些点：

1. `ArchiveRequestError`
   - 如果只是给 API 错误换名，可直接返回 `AppError`
2. `ItemPermissionApiError`
   - 如果只是 `type alias`，可删
3. `DirectoryPrincipalSearchAppError`
   - 如果它仍提供稳定 `code` 联合与模块边界，可保留
   - 如果只是为了保留旧类名，需要评估是否降级成工厂函数
4. `DownloadSaveTargetSelectionCancelledError`
   - 这是“用户主动取消”的业务语义名，可能值得保留
   - 不建议在没有替代判断方式前机械删除

## 不建议继续照旧执行的内容

以下做法在当前现状下不建议继续原样推进：

- 不要再把 issue 定义成“全仓彻底删光所有语义化错误名”
- 不要把已经完成的 shared contract / `Frontend*` / `Backend*` 删壳重新列成主体任务
- 不要在本轮顺手改传输协议
- 不要为了“纯度”删除确实承载用户动作语义的取消类错误

## 更新后的实施顺序

### Step 1：先做 Graph 解析收紧

建议改动：

1. 抽 `common/appError/graphSdkError.ts` 或等价模块
2. 让 `extractGraphOriginError(...)` 只服务于明确 Graph 路径
3. 收紧这些兼容分支是否仍需要存在：
   - `responseHeaders`
   - `body.headers`
   - `innererror`
   - `record.error`

### Step 2：再复核残余包装壳

建议逐个判定：

1. `ArchiveRequestError`
2. `ItemPermissionApiError`
3. `DirectoryPrincipalSearchAppError`
4. `DownloadSaveTargetSelectionCancelledError`

判定标准：

- 是否提供稳定业务语义
- 是否还有调用方依赖其 `name` / `code` / `instanceof`
- 删除后是否会让测试和 UI 判断更简单

### Step 3：同步测试到“更少猜测、更少包装”的目标

重点关注：

- `server/common/errors.test.ts`
- `server/common/errorResponse.test.ts`
- `src/services/downloadApi.test.ts`
- `src/components/permissions/services/directoryPrincipalSearch/*.test.ts`

## 建议写入 issue 的任务定义

如果要写 GitHub issue，建议标题和范围都聚焦为：

- “精简 Graph 错误解析并清理残余 AppError 包装壳”

而不是继续使用“彻底统一化”这一类表述。

因为从今天的代码现状看，这已经不是架构改造主工程，而是一个 targeted cleanup。
