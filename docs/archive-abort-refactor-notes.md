# ZIP 下载取消链路重构说明（面向初级开发者）

## 1. 文档目的

这份文档说明本次 ZIP 下载相关改动，重点回答以下问题：

1. 为什么之前看起来像有两套 abort 实现，是否过多。
2. 为什么异步场景下会看到较多 abort 检查点。
3. 为什么用了 addEventListener/removeEventListener，这是否符合 React 最佳实践。
4. 为什么同时存在“深层抛错”和“外层 return”两种中止处理方式。
5. 为什么深层任务不直接 return，而是要抛错中断。

目标是让你不仅知道“怎么改”，还知道“为什么这么改”。

## 2. 本次改动范围

- `src/components/files.tsx`
- `src/services/spembedded.ts`

核心方向：把原来分散的中止状态/处理器，统一为 `AbortController + AbortSignal` 的单链路取消模型。

## 3. 改动摘要（先看结论）

1. 组件层不再维护 `abortHandler + abortRequested` 双状态。
2. 组件层改为只维护一个 `downloadAbortControllerRef`，每次下载任务一个 controller。
3. 服务层新增 `IAbortRequestOptions`，将 `requestAbortSignal` 透传给 `fetch`。
4. 服务层下载执行内部也统一到 `streamAbortController`，并支持桥接上层 signal。
5. 删除旧的 `shouldAbort`、`activeFetchController` 这类分散控制点。
6. 保留两类中止判断，但语义分层明确：
   - 深层执行点：`throwIfStreamAborted()`（快速中断整条异步链）
   - 外层边界：`if (isStreamAborted()) return;`（把用户取消视为正常结束）

## 4. 两文件联动流程（2-file walkthrough）

下面用“从点击下载到完成/取消”的路径，串联两个文件。

### Step A: 入口在组件层 `startZipDownload`

组件在开始任务时创建 `runController`，并把 `downloadAbortSignal` 传给服务层接口：

- `startDownloadArchive(..., { requestAbortSignal })`
- `getArchivePreparationProgress(..., { requestAbortSignal })`
- `getDownloadManifest(..., { requestAbortSignal })`
- `downloadArchiveFromManifest(..., { requestAbortSignal })`

这样一来，点击 Abort 时，一次 `abort()` 就可以影响轮询请求、manifest 请求和最终流式下载。

### Step B: 服务层桥接到内部执行控制器

在 `downloadArchiveFromManifest` 中：

1. 创建内部 `streamAbortController`（执行层唯一真源）。
2. 如果上层传入 `requestAbortSignal`，用事件监听把它桥接到 `streamAbortController.abort(...)`。
3. 在 `finally` 里移除监听器，避免泄漏。

### Step C: 深层循环与 I/O 点主动检查中止

在下载循环、reader.read 循环、关键 await 前后调用 `throwIfStreamAborted()`。

作用：一旦中止，立刻抛错退出深层逻辑，而不是让后续步骤继续推进。

### Step D: 外层收口分类

外层 `catch` 中：

- 若 `isStreamAborted()` 为 true，直接 `return`（这是“正常取消”，不是失败）。
- 否则按真实异常处理（例如写入流失败、HTTP 非 2xx）。

这也是你看到 `emitProgress("done")` 后面紧跟 `catch` 里 `if (isStreamAborted()) return;` 的原因。

## 5. 为什么之前像有“两套 abort”，现在如何收敛

## 5.1 旧模型的问题

旧模型里同时存在：

- 组件层标记位（例如 `abortRequested`）
- 组件层函数引用（`abortHandler`）
- 服务层布尔标记（`shouldAbort`）
- 服务层临时 `activeFetchController`

这些变量有重叠职责，容易出现以下风险：

1. 某一层认为已中止，但另一层仍继续执行。
2. 取消时机和清理时机不一致，导致状态错乱。
3. 后续维护者很难判断“以谁为准”。

## 5.2 新模型的原则

新模型采用“单一事实源”：

- 组件层每次任务一个 `AbortController`。
- 服务层执行内部也是一个 controller，并通过 signal 桥接。
- 业务判断统一围绕 `signal.aborted` 展开。

简单说：状态可以有多个“观察点”，但取消信号应该只有一条“主链路”。

## 6. 为什么异步场景会有较高 abort 检查密度

这是异步程序的正常特征，不是代码坏味道。

原因：每个 `await` 都是潜在切换点。用户可能在任意时刻点击 Abort。

所以常见做法是：

1. 进入异步步骤前检查一次。
2. `await` 返回后再检查一次。
3. 在循环体每轮检查一次（特别是流读取循环）。

这能避免“用户已经取消，但代码还往下跑半程”的体验问题。

## 7. addEventListener/removeEventListener 是否符合 React 最佳实践

结论：在这里是合理且推荐的。

原因：

1. 监听对象是 `AbortSignal`（Web 平台对象），不是 React 组件 DOM 节点。
2. 这是跨层信号桥接，不属于 JSX 事件绑定范畴。
3. 搭配 `once: true` 和 `finally` 里的 remove，生命周期可控，符合资源清理原则。

React 最佳实践并不是“禁止 addEventListener”，而是“谁创建监听，谁负责清理”。本次实现满足这一点。

## 8. 为什么有两种 abort 处理：深层 throw 与外层 return

这是“机制层”和“产品层”分离：

1. 机制层（深层执行）要快速中断：使用 `throw`。
2. 产品层（边界处理）要把用户取消当作正常行为：使用 `return`。

如果深层只 `return`，通常只能退出当前函数，无法保证跨 Promise/回调/循环的完整回卷。

如果外层不 `return` 而继续抛错，UI 会把“用户主动取消”误报成“下载失败”。

所以两者同时存在且职责不同，是正确设计。

## 9. 对“为什么深层任务要抛错而不是 return”的直接回答

一句话版本：

- 深层 `return` 只能退出局部作用域。
- 深层 `throw` 才能穿透多层异步边界，把控制权带回统一 `catch/finally` 做收口。

你选中的这段：

```ts
emitProgress("done", "", true);
} catch (error: unknown) {
  if (isStreamAborted()) {
    return;
  }
```

语义是：

1. 深层一旦发现中止会抛出，快速回卷。
2. 到外层 catch 时，如果确认是中止，就静默结束（不是失败）。
3. 只有非中止异常才继续上抛给调用方。

## 10. 这次改动对维护性的收益

1. 取消链路更一致：从 UI 到 fetch 到流读取都走 signal。
2. 语义更清晰：取消与错误分流处理。
3. 排障更直接：看 signal 即可判断任务是否应继续。
4. 可扩展性更好：后续加新的网络步骤时，只需透传同一个 signal。

## 11. 给初级开发者的实践建议

1. 只要有多层异步，就尽早设计统一取消信号。
2. 不要把“取消”混同为“错误”，两者用户体验不同。
3. 在 `await` 边界和长循环里做中止检查。
4. 对事件监听必须有对应清理点（`finally` 或 `useEffect` cleanup）。
5. 中止相关命名保持显式，例如 `*Abort*`、`*Signal*`、`*Controller*`。

## 12. 后续可选优化

1. 将“中止错误”统一为专门错误类型（例如 `ArchiveAbortError`），减少 message 字符串判断。
2. 在日志层区分 `info(cancelled)` 与 `error(failed)`，便于监控统计。
3. 给下载流程补充自动化测试：
   - 轮询阶段中止
   - manifest 请求阶段中止
   - 流读取阶段中止
   - 非中止异常回传
