# ZIP 下载取消链路重构说明（面向初级开发者）

## 1. 文档目的

这份文档说明本次 ZIP 下载相关改动，重点回答以下问题：

1. 为什么之前看起来像有两套 abort 实现，是否过多。
2. 为什么异步场景下会看到较多 abort 检查点。
3. 为什么改为使用 AbortSignal.any 组合信号，这是否符合当前最佳实践。
4. 为什么同时存在“深层抛错”和“外层 return”两种中止处理方式。
5. 为什么深层任务不直接 return，而是要抛错中断。

目标是让你不仅知道“怎么改”，还知道“为什么这么改”。

## 2. AbortController 是什么，怎么用

> **参考文档**：[MDN – AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) | [MDN – AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

### 2.1 核心概念

`AbortController` 是浏览器（及 Node.js 14.17+）内置的 Web 标准 API，用于**主动取消**一个或多个异步操作。它由两个配合使用的对象组成：

| 对象              | 作用                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `AbortController` | 控制器，持有 `signal`，并对外暴露 `.abort()` 方法                                               |
| `AbortSignal`     | 信号对象，传给异步操作；一旦 `abort()` 被调用，`signal.aborted` 变为 `true` 并触发 `abort` 事件 |

你可以把它理解为一个"紧急停止开关"：

- 你按下开关（`controller.abort()`）。
- 所有持有同一个 `signal` 的操作都能感知到，然后自行停止。

### 2.2 基础用法：取消 fetch 请求

```typescript
// 1. 创建控制器（每次任务 new 一个，不要复用）
const controller = new AbortController();
const signal = controller.signal;

// 2. 把 signal 传给 fetch
fetch("/api/data", { signal })
  .then((res) => res.json())
  .then((data) => console.log(data))
  .catch((err) => {
    // fetch 被 abort 时，会以 AbortError 的形式 reject
    if (err.name === "AbortError") {
      console.log("请求已被取消，属于正常行为");
    } else {
      console.error("真实网络错误：", err);
    }
  });

// 3. 需要取消时，调用 abort()
controller.abort();
```

> **注意**：`AbortSignal` 是一次性的。一旦 `abort()` 被调用，该 signal 就永久处于已中止状态，无法"重置"。下次任务需要 `new AbortController()` 重新创建。

### 2.3 在自定义异步函数中支持取消

调用 controller.abort() 时，JavaScript 引擎会执行以下操作：

- 将 signal.aborted 属性设置为 true。
- 将 signal.reason 设置为传入的参数。
- 在 signal 对象上触发 abort 事件。

如果你自己写了一个 Promise 函数，也可以接受并响应 `signal`：

```typescript
function doSlowWork(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    // 如果传进来时 signal 已经中止，立即 reject
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(() => resolve("完成！"), 5000);

    // 监听 abort 事件，一旦触发就停止工作
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason); // signal.reason 是 abort() 传入的原因
      },
      { once: true },
    ); // once: true 防止重复触发，也便于 GC 回收
  });
}

// 使用方式
const controller = new AbortController();
doSlowWork(controller.signal)
  .then((result) => console.log(result))
  .catch((err) => {
    if (err.name === "AbortError") console.log("任务被取消");
  });

// 2 秒后取消
setTimeout(() => controller.abort(new Error("用户主动取消")), 2000);
```

### 2.4 其他实用 API

#### `signal.throwIfAborted()`

在异步流程中，可以在任意检查点调用此方法。如果 signal 已中止，它会直接抛出中止原因，省去手动 `if (signal.aborted) throw ...` 的写法：

```typescript
async function processItems(items: string[], signal: AbortSignal) {
  for (const item of items) {
    signal.throwIfAborted(); // 每轮循环前检查，已中止则立即抛出
    await processOne(item);
  }
}
```

#### `AbortSignal.timeout(ms)`

创建一个会在指定毫秒后自动触发的 signal，无需手动管理 `setTimeout`：

```typescript
// 5 秒内没响应则自动取消
const res = await fetch("/api/data", { signal: AbortSignal.timeout(5000) });
```

#### `AbortSignal.any([...signals])`

合并多个 signal，任意一个触发时，组合 signal 也触发。常用于"超时或用户手动取消，哪个先到以哪个为准"：

```typescript
const controller = new AbortController();
const combined = AbortSignal.any([
  controller.signal,
  AbortSignal.timeout(5000),
]);
await fetch("/api/data", { signal: combined });
```

### 2.5 与本项目的关系

本文档后续章节描述的改动，正是将原本分散的手动标记位（`abortRequested`、`shouldAbort` 等）全部替换为标准的 `AbortController + AbortSignal` 链路。理解了上面的基础用法，再看后面的设计决策会更容易。

---

## 3. 本次改动范围

- `src/components/files.tsx`
- `src/services/spembedded.ts`
- `src/services/archiveDownloader.ts`

核心方向：把原来分散的中止状态/处理器，统一为 `AbortController + AbortSignal` 的单链路取消模型。

## 4. 改动摘要（先看结论）

1. 组件层不再维护 `abortHandler + abortRequested` 双状态。
2. 组件层改为只维护一个 `downloadAbortControllerRef`，每次下载任务一个 controller。
3. 服务层新增 `IAbortRequestOptions`，将 `requestAbortSignal` 透传给 `fetch`。
4. 服务层下载执行内部统一到 `streamAbortController`，并通过 `AbortSignal.any` 合并上层 signal。
5. 删除旧的 `shouldAbort`、`activeFetchController` 这类分散控制点。
6. 保留两类中止判断，但语义分层明确：

- 深层执行点：`streamAbortSignal.throwIfAborted()`（快速中断整条异步链）
- 外层边界：`if (isStreamAborted()) return;`（把用户取消视为正常结束）

## 5. 两文件联动流程（2-file walkthrough）

下面用“从点击下载到完成/取消”的路径，串联两个文件。

### Step A: 入口在组件层 `startZipDownload`

组件在开始任务时创建 `runController`，并把 `downloadAbortSignal` 传给服务层接口：

- `startDownloadArchive(..., { requestAbortSignal })`
- `getArchivePreparationProgress(..., { requestAbortSignal })`
- `getDownloadManifest(..., { requestAbortSignal })`
- `downloadArchiveFromManifest(..., { requestAbortSignal })`

这样一来，点击 Abort 时，一次 `abort()` 就可以影响轮询请求、manifest 请求和最终流式下载。

### Step B: 服务层将上下游信号组合为统一执行信号

在 `downloadArchiveFromManifest` 中：

1. 创建内部 `streamAbortController`（执行层唯一真源）。
2. 如果上层传入 `requestAbortSignal`，通过 `AbortSignal.any([requestAbortSignal, streamAbortController.signal])` 合成为一个统一信号。
3. 后续 `fetch`、流式读取循环都只消费这一个统一信号。

### Step C: 深层循环与 I/O 点主动检查中止

在下载循环、reader.read 循环、关键 await 前后调用 `streamAbortSignal.throwIfAborted()`。

作用：一旦中止，立刻抛错退出深层逻辑，而不是让后续步骤继续推进。

### Step D: 外层收口分类

外层 `catch` 中：

- 若 `isStreamAborted()` 为 true，直接 `return`（这是“正常取消”，不是失败）。
- 否则按真实异常处理（例如写入流失败、HTTP 非 2xx）。

这也是你看到 `emitProgress("done")` 后面紧跟 `catch` 里 `if (isStreamAborted()) return;` 的原因。

## 6. 为什么之前像有“两套 abort”，现在如何收敛

## 6.1 旧模型的问题

旧模型里同时存在：

- 组件层标记位（例如 `abortRequested`）
- 组件层函数引用（`abortHandler`）
- 服务层布尔标记（`shouldAbort`）
- 服务层临时 `activeFetchController`

这些变量有重叠职责，容易出现以下风险：

1. 某一层认为已中止，但另一层仍继续执行。
2. 取消时机和清理时机不一致，导致状态错乱。
3. 后续维护者很难判断“以谁为准”。

## 6.2 新模型的原则

新模型采用“单一事实源”：

- 组件层每次任务一个 `AbortController`。
- 服务层执行内部也是一个 controller，并通过 `AbortSignal.any` 合并为单一执行信号。
- 业务判断统一围绕 `signal.aborted` 展开。

简单说：状态可以有多个“观察点”，但取消信号应该只有一条“主链路”。

## 7. 为什么异步场景会有较高 abort 检查密度

这是异步程序的正常特征，不是代码坏味道。

原因：每个 `await` 都是潜在切换点。用户可能在任意时刻点击 Abort。

所以常见做法是：

1. 进入异步步骤前检查一次。
2. `await` 返回后再检查一次。
3. 在循环体每轮检查一次（特别是流读取循环）。

这能避免“用户已经取消，但代码还往下跑半程”的体验问题。

## 8. AbortSignal.any 是否符合当前最佳实践

结论：在这里是合理且推荐的。

原因：

1. `AbortSignal.any` 是 Web 标准提供的多信号组合能力，语义比手写桥接更直接。
2. 它天然表达“任一信号中止即整体中止”的需求，减少手写事件监听样板代码。
3. 统一信号后，调用点只需围绕同一 `signal` 进行 `throwIfAborted()` 与 `fetch({ signal })`，维护成本更低。

这属于平台级取消机制设计，不依赖 React 事件系统；在 React 项目中同样是推荐用法。

## 9. 为什么有两种 abort 处理：深层 throw 与外层 return

这是“机制层”和“产品层”分离：

1. 机制层（深层执行）要快速中断：使用 `throw`。
2. 产品层（边界处理）要把用户取消当作正常行为：使用 `return`。

如果深层只 `return`，通常只能退出当前函数，无法保证跨 Promise/回调/循环的完整回卷。

如果外层不 `return` 而继续抛错，UI 会把“用户主动取消”误报成“下载失败”。

所以两者同时存在且职责不同，是正确设计。

## 10. 对“为什么深层任务要抛错而不是 return”的直接回答

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

## 11. 这次改动对维护性的收益

1. 取消链路更一致：从 UI 到 fetch 到流读取都走 signal。
2. 语义更清晰：取消与错误分流处理。
3. 排障更直接：看 signal 即可判断任务是否应继续。
4. 可扩展性更好：后续加新的网络步骤时，只需透传同一个 signal。

## 12. 给初级开发者的实践建议

1. 只要有多层异步，就尽早设计统一取消信号。
2. 不要把“取消”混同为“错误”，两者用户体验不同。
3. 在 `await` 边界和长循环里做中止检查。
4. 优先使用 `AbortSignal.any` 组合多取消源，避免手写监听桥接。
5. 中止相关命名保持显式，例如 `*Abort*`、`*Signal*`、`*Controller*`。

## 13. 后续可选优化

1. 将“中止错误”统一为专门错误类型（例如 `ArchiveAbortError`），减少 message 字符串判断。
2. 在日志层区分 `info(cancelled)` 与 `error(failed)`，便于监控统计。
3. 给下载流程补充自动化测试：
   - 轮询阶段中止
   - manifest 请求阶段中止
   - 流读取阶段中止
   - 非中止异常回传
