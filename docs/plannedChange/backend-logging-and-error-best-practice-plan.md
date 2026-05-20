# 后端日志系统与错误系统对齐最佳实践计划

## Summary

为让当前后端错误处理真正接近生产级最佳实践，本次计划把工作拆成两条并行但相互配合的主线：

1. 建立一套通用后端日志基础设施。
   默认写本地 `JSON Lines` 日志文件，并把传输层抽象出来，后续可替换为 Linux 服务器本地日志采集、Splunk、ELK 或其他外部服务，而不重写业务代码。
2. 修正后端错误系统。
   保持现有 `code / statusCode / requestId / retryAfterSeconds` 兼容，同时补齐“面向用户的稳定提示”和“面向开发者的诊断信息分离”，避免继续把上游 Graph message 直接当终端文案使用。

结论上，`logging` 不是“语法层面绝对必须”，但如果目标是对齐最佳实践，那么它在这个项目里应视为 `必须补齐的基础设施`，否则一旦把错误 message 稳定化，原始 Graph / OBO / token / upstream 诊断信息就没有可靠落点。

## Key Changes

### 1. 通用日志系统设计

- 在后端新增统一 logger facade，不允许业务模块直接写 `console.log` / `console.error`。
- logger 抽象分三层：
  - `Logger` 接口：`debug / info / warn / error / child`
  - `LogRecord` 结构：时间、级别、message、event、module、requestId、traceId、operation、error 元信息、任意 context
  - `LogTransport` 接口：负责把 record 写到目标介质
- 默认实现只做本地文件输出：
  - 格式：`JSON Lines`
  - 位置：默认 `./logs/server.log`
  - 配置化：`LOG_LEVEL`、`LOG_DIR`、`LOG_FILE_NAME`、`LOG_ENABLE_CONSOLE`
- 同时保留一个可选 console transport 用于本地开发观察，但文件日志是主落点。
- 设计时不引入任何和 Splunk/ELK 绑定的字段命名；只保证结构化、稳定、可扩展。
- logger 要支持 `child logger`，便于在 `auth`、`download`、`containerPermissions` 等子域预置 `module`。
- 明确日志脱敏规则：
  - 不记录 access token、authorization header、client secret、原始 JWT、PII
  - Graph / auth 相关日志仅保留 request id、status、code、operation、安全 message
- 增加请求级上下文：
  - 为每个 HTTP 请求生成 `requestId`，若请求头已有可接受的 request id 则复用，否则服务端生成
  - 将 requestId 回写到响应头，并注入该次请求的 logger context
- 统一记录的关键事件：
  - 服务启动
  - 每次请求开始 / 结束
  - 认证失败
  - Graph 调用失败
  - 下载任务失败
  - 未捕获异常归一化后的最终错误

### 2. 错误系统与 Microsoft 风格对齐

- 保留现有稳定外部 contract：
  - `code`
  - `message`
  - `statusCode`
  - `requestId`
  - `retryAfterSeconds`
  - `details`
- 在错误响应中新增可选 `userMessage`：
  - `message` 逐步回归“开发者/诊断语义”
  - `userMessage` 作为前端更安全、更稳定的展示文案
  - 现有前端暂不强制立即全面切换，但新计划要求新增/修改的后端路径都补充 `userMessage`
- 扩展 `BackendError` / `BackendGraphError` 的内部诊断能力：
  - 提取上游 `status`
  - 提取 Graph `error.code`
  - 提取最深层 `innererror.code`
  - 提取安全的 `upstreamMessage`
  - 这些信息默认进入日志或 `details`，不默认直接暴露给终端用户
- 调整 `toBackendGraphError` 语义：
  - `defaultMessage` 改为稳定用户文案来源，而不是“顺便覆盖全部错误 message”
  - 新增开发者诊断字段生成逻辑，确保原始 Graph 错误信息不会因为稳定 message 而彻底丢失
- 调整 `normalizeError` / `sendApiError`：
  - 归一化后统一打结构化错误日志
  - 日志内容包含 backend code、status、requestId、cause chain、upstream graph metadata
  - 对未知错误继续返回安全 500，不泄漏原始 message
- 保持现有 container permissions 的精细映射思路，但逐步复用新的公共 Graph 诊断提取器，避免重复读取 `status / requestId / retry-after / message`

### 3. 公共接口与兼容策略

- 公共错误响应 contract 增加：
  - `userMessage?: string`
- 请求级日志上下文 contract 增加：
  - `requestId: string`
  - `method`
  - `path`
  - `module?`
  - `operation?`
- 本次不要求：
  - 接入真实外部日志平台
  - 完整实现分布式 trace
  - 改造前端所有页面一次性切到 `userMessage`
  - 改造成功响应结构

## Test Plan

- 日志系统单元测试：
  - logger 能输出合法 JSON 行
  - file transport 能写入目标文件
  - `child logger` 会继承并覆盖 context
  - error 对象被序列化为安全字段，不泄漏 token / secret
- 请求链路测试：
  - 请求进入时生成或复用 requestId
  - requestId 会进入响应头
  - handler 抛错时日志里能看到相同 requestId
- 错误系统测试：
  - 未知错误仍返回安全 500，不泄漏原始异常 message
  - Graph 429/503 能同时保留 `requestId` 和 `retryAfterSeconds`
  - Graph 错误覆盖稳定用户文案时，原始 upstream 诊断信息仍可进入日志
  - `userMessage` 存在时，`message` 与 `userMessage` 语义分离
- 回归测试：
  - 现有容器权限错误流仍返回旧字段并通过现有前端消费
  - 下载模块现有 `errors: string[]` 状态不改 contract
  - 后端 `npm run build:backend` 和相关 Vitest 保持通过

## Step Prompts

### Step 1: 设计并落地日志基础设施

目标：新增后端通用 logging system，只实现本地文件 JSON Lines 输出和可选 console 输出，不接外部服务，但接口必须能适配 Linux 文件采集与 Splunk/ELK。

要求：
- 扫描 `server/` 当前 `console.*` 使用点与启动入口。
- 设计 `Logger`、`LogTransport`、`LogRecord`、`child logger`、请求级 `requestId` 上下文。
- 默认写 `./logs/server.log`，通过环境变量控制 `LOG_LEVEL`、`LOG_DIR`、`LOG_FILE_NAME`、`LOG_ENABLE_CONSOLE`。
- 增加请求开始/结束、服务启动、统一异常日志。
- 不记录 token、Authorization header、client secret、原始 JWT、PII。
- 保持注释和 JSDoc 为简体中文。
- 实现后运行最相关测试与 `npm run build:backend`。
- 最后总结：接口设计、日志字段、配置项、测试结果、剩余风险。

### Step 2: 改造错误系统以分离用户文案与诊断信息

目标：在不破坏现有前端 contract 的前提下，把后端错误系统调整到更接近 Microsoft/生产最佳实践。

要求：
- 基于现有 `server/common/errors.ts`、`server/common/errorResponse.ts`、`common/contracts/apiErrorContracts.ts` 改造。
- 在统一错误响应中新增可选 `userMessage`，保留现有 `message` 兼容。
- 提取 Graph `error.code`、最深层 `innererror.code`、安全 `upstreamMessage`、`status`、`requestId`、`retryAfterSeconds`。
- 调整 `toBackendGraphError`，让稳定用户文案与开发者诊断信息分离；不要因为覆盖 message 而丢失 upstream 诊断能力。
- 统一错误发送路径必须打结构化日志，并串上 requestId。
- 保持未知错误不向客户端泄漏原始异常细节。
- 保持容器权限和下载等现有业务 contract 尽量不破坏。
- 实现后运行相关单测和 `npm run build:backend`。
- 最后总结：新增字段、兼容性、测试结果、前端影响。

### Step 3: 把关键后端模块迁移到统一 logger + 新错误语义

目标：把最关键的 server 模块接入新 logger，并把 Graph 相关错误路径统一迁移到新语义。

要求：
- 优先覆盖 `server/index.ts`、`server/auth.ts`、通用 error path，以及至少一条 Graph 读路径、一条 Graph 写路径、一条下载路径。
- 去掉后端运行路径中的零散 `console.*`，统一改用 logger。
- 确保容器权限模块与公共错误提取器之间尽量复用，不保留重复解析逻辑。
- 对每类失败场景补足必要测试：认证失败、Graph 429、Graph 503、未知异常、下载准备失败。
- 如有必要，补充 README 中关于新日志配置和错误响应语义的说明。
- 最后总结：覆盖范围、未迁移点、建议下一步。

### Step 4: 前端错误消费收口与文档同步

目标：让前端逐步优先消费 `userMessage`，并补齐文档，完成最佳实践闭环。

要求：
- 扫描当前前端对后端 `message` / `requestId` / `retryAfterSeconds` 的消费点。
- 在不扩大改动面的前提下，把共享 API 错误读取逻辑收敛成优先显示 `userMessage`，没有时再退回 `message`。
- 不重做全部前端错误系统，只修当前后端 contract 的主要消费入口。
- 更新后端 README 或相关开发文档，说明：
  - 错误响应字段语义
  - 日志配置项
  - 本地日志文件位置
  - 未来接外部日志平台时应复用 transport abstraction
- 运行最相关前端/后端测试。
- 最后总结：前端兼容状态、文档更新、剩余技术债。

## Assumptions

- 默认选择 `JSON 行日志文件` 作为主输出格式。
- 默认在本次计划中新增 `userMessage`，而不是让 `message` 继续长期兼任终端展示文案。
- 本次只设计“可扩展 logging abstraction + 本地文件落地”，不接真实外部日志服务。
- 现有前端短期内继续兼容 `message`，逐步迁移到优先展示 `userMessage`。
- 日志滚动、压缩、归档策略暂不在第一步实现；先保证接口与格式可被 Linux 日志采集或外部平台消费。
