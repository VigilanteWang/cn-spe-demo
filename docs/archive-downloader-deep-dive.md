# `downloadArchiveFromManifest` 设计模式深度解析

> **适合读者**：熟悉 JavaScript 基础 `async/await`，想了解前端流式处理与复杂异步协调的初中级开发者。

---

## 0. 先理解 fflate 和 ZIP

### 0.1 ZIP 是什么

ZIP 是一种常见的归档格式。它的作用不是“把文件内容变成另一种文件”，而是把多个文件和目录打包到一个容器里。

你可以把 ZIP 理解成“文件压缩包”或“文件箱子”：
- 它可以一次装下多个文件。
- 它会记录每个文件的名字、大小、位置等信息。
- 打开 ZIP 时，解压工具会先读末尾的目录信息，再找到每个文件的数据块。

### 0.2 fflate 是什么

fflate 是一个 JavaScript 压缩库，支持在浏览器和 Node.js 中做压缩和解压。

它在这个项目里主要负责两件事：
- 把原始文件内容压缩成 ZIP 里的数据块。
- 以“流”的方式一边处理、一边输出，避免把整包数据一次性放进内存。

### 0.3 为什么这里用 `AsyncZipDeflate`

`AsyncZipDeflate` 是 fflate 里专门用于“异步流式压缩”的类。它适合这里的原因是：

1. **适合大文件**：文件可以分块推送，不需要先读完整个文件再压缩。
2. **适合浏览器**：压缩工作可以交给内部异步处理，减少主线程卡顿。
3. **适合流水线写法**：文件下载、压缩、写入可以接成一条持续运行的管道。

和它相对的，是同步类 `ZipDeflate` 或整体打包函数 `zipSync`。它们更适合小数据或一次性处理；而这个项目处理的是多个文件的流式下载，所以更适合 `AsyncZipDeflate`。

### 0.4 一个最小的 fflate ZIP 示例

下面是一个最简单、最标准的写法，用 `Zip` + `AsyncZipDeflate` 手工创建 ZIP：

```typescript
import { AsyncZipDeflate, Zip } from "fflate";

const chunks: Uint8Array[] = [];

const zip = new Zip((error, data, final) => {
  if (error) {
    throw error;
  }

  chunks.push(data);

  if (final) {
    const zipBlob = new Blob(chunks, { type: "application/zip" });
    console.log("ZIP 已生成", zipBlob);
  }
});

const file = new AsyncZipDeflate("hello.txt", { level: 6 });
zip.add(file);

file.push(new TextEncoder().encode("Hello, fflate!"), true);
zip.end();
```

这个示例的执行顺序是：
- 先创建 `Zip` 容器。
- 再创建一个文件流 `AsyncZipDeflate`。
- 把文件流加进 ZIP。
- 用 `push(..., true)` 发送文件内容并标记结束。
- 最后调用 `zip.end()` 结束整个 ZIP 包。

### 0.5 这个项目为什么不是直接用 `zipSync`

`zipSync` 的写法更短，但它会一次性处理完整数据，更适合小文件或一次性打包。

这里的场景是：
- 要下载多个远程文件；
- 文件可能很大；
- 浏览器里不希望把所有内容同时放入内存。

所以这里必须用“流式 + 异步”的写法，而 `AsyncZipDeflate` 正好符合这个需求。

---

## 一、整体架构与数据流

`downloadArchiveFromManifest` 是一个**闭包工厂函数**。每次调用它，就像启动了一条"自动运转的流水线"，并把流水线的"控制台"（`abort` + `completion`）交还给你：

```
调用方
  │
  ▼
downloadArchiveFromManifest(manifest, saveTarget, onProgress)
  │
  ├─── 同步立即返回 ──► { abort(), completion }   ← 最小会话句柄
  │
  └─── 后台自动运行 ──► 文件1 → 文件2 → ... → 全部完成
                            │
                          fetch（下载）
                            │
                          entry.push() ──► fflate.Zip 压缩
                            │                    │
                            │              ZIP 回调（同步）
                            │                    │
                            │              writeChain.then()（串行异步）
                            │                    │
                            └────────────────► writable.write() / fallbackChunks
```

整个过程中，调用方只感知两件事：
- **`completion`**：一个 `Promise`，代表整个任务的最终状态（成功 / 失败 / 用户取消）。
- **`abort()`**：一个函数，可以在任意时刻强制中断任务并清理资源。

---

## 二、核心设计模式逐一解析

### 2.1 闭包工厂（Closure Factory）

**什么是闭包工厂？**

工厂函数返回另一个函数（或对象），被返回的函数/对象可以访问工厂函数内部的私有变量。外部调用者看不到也改不了这些变量，只能通过暴露的接口操作。

```typescript
// 每次调用工厂函数，都会创建一套完全独立的私有状态：
const session1 = downloadArchiveFromManifest(manifest1, ...);
const session2 = downloadArchiveFromManifest(manifest2, ...);
// session1 和 session2 的 downloadedBytes、activeReader 等变量互不干扰
```

**私有变量清单（每次调用独享）：**

| 变量 | 用途 |
|------|------|
| `downloadedBytes` | 已下载字节数，供进度条使用 |
| `zippedBytes` | 已压缩字节数，供进度条使用 |
| `processedFiles` | 已完成文件数 |
| `activeReader` | 当前正在读取的 Response Stream Reader |
| `writeChain` | 串行写入磁盘的 Promise 链 |
| `hasWritableClosed` | 文件流是否已正常关闭 |
| `hasWritableAborted` | 文件流是否已中止（幂等保护） |

**为什么用闭包工厂而不是 `class`？**

| 对比维度 | 闭包工厂 | class |
|---------|---------|-------|
| 私有状态 | 天然私有，外部无法访问 | 需要 `#` 或约定 `_` 前缀 |
| API 暴露 | 只返回 `abort` 和 `completion`，接口极小 | 所有 `public` 方法都暴露 |
| `this` 问题 | 不存在，闭包直接捕获变量 | 常见 `this` 指向错误 |
| Tree Shaking | 函数级别，打包工具可按需裁剪 | class 通常整体保留 |

---

### 2.2 异步 IIFE —— `completion` 为什么"立即执行"

**什么是 IIFE？**

IIFE = Immediately Invoked Function Expression，即"立即执行的函数表达式"。

```typescript
// 普通异步函数：定义后需要手动调用
const startDownload = async () => { /* ... */ };
startDownload(); // ← 还要手动触发

// 异步 IIFE：定义的同时立刻执行，省去了手动触发
const completion = (async () => {
//                  ↑ 这是一个匿名 async 函数
  /* ... 下载逻辑 ... */
})();
// ↑ 末尾的 () 表示"立刻调用这个函数"
// 函数执行后立刻返回一个 Promise，赋值给 completion
```

**为什么要用 IIFE 而不是普通函数？**

```
                  调用 downloadArchiveFromManifest(...)
                              │
          ┌───────────────────┴────────────────────┐
          │ 同步初始化（创建私有变量、abort 函数等） │
          │                                         │
          │  const completion = (async () => {...})()
          │        ↑ 此刻下载任务已自动启动！        │
          │                                         │
          │  return { abort, completion }           │
          └─────────────────────────────────────────┘
                              │
                 调用方收到句柄，后台下载已在运行
```

**三个关键好处：**

1. **自启动**：工厂函数返回的瞬间，下载任务已在后台自动开始。调用方无需再手动 `start()`。
2. **闭包捕获**：IIFE 内部直接访问外层所有私有变量（`writable`、`progressEmitter`、`writeChain` 等），无需传参。
3. **即时 Promise**：`completion` 从一开始就是"运行中"的 Promise，调用方可以直接 `await completion` 等待结果。

---

### 2.3 `completion` 为什么一开始就 `await new Promise`

这是整个设计中**最关键**的一个问题。

**问题背景：两种不兼容的异步范式**

```
fetch / 流读取          fflate.Zip 压缩引擎
─────────────           ─────────────────────
  "拉取式"                    "推送式"
async/await              回调函数（callback）
代码主动等数据            数据来了它主动叫我

for (const item of ...) {    new Zip((error, data, final) => {
  const response = await       // 压缩好了，data 来了！
    fetch(item.url);           // 但我不知道何时结束……
  entry.push(chunk);         });
}
```

两种范式无法直接混合：你没有办法在一个回调函数里用 `await`，也没有办法让 `for` 循环等待异步回调全部完成后再继续。

**解决方案：用 `new Promise` 做"范式适配器"**

```typescript
await new Promise<void>((resolve, reject) => {
  //   ↑ 创建一个手动控制生命周期的 Promise
  //     我们自己决定它什么时候 resolve（成功）或 reject（失败）

  const zip = new Zip((error, data, final) => {
    // ... 处理压缩数据 ...
    if (final) {
      writeChain.then(resolve); // ← 所有数据写完，才 resolve！
    }
  });

  const run = async () => {
    // ... fetch 下载 ... entry.push() ...
    zip.end(); // ← 告诉 ZIP 引擎没有更多文件了
  };

  void run(); // ← 启动下载（非阻塞，见 2.4 节）
});
// await 会一直等在这里，直到 Promise resolve 或 reject
// resolve 的条件：ZIP final 回调触发 + writeChain 全部写完
```

**如果不用 `await new Promise` 会怎样？（反面教材）**

```typescript
// ❌ 错误写法
for (const item of manifest.items) {
  const response = await fetch(item.downloadUrl);
  entry.push(data);
}
zip.end();
await writable.close(); // ← 危险！

// 时序问题：
// for 循环结束 ≠ 压缩完成 ≠ 磁盘写入完成
// zip.end() 调用后，压缩引擎还在后台处理最后的数据块
// writable.close() 此时调用，文件被提前截断，尾部数据永久丢失！
```

**`resolve` 的精确触发时机：**

```
fflate ZIP 回调
  └── 收到 final = true
        └── 等待 writeChain（最后一批数据写入磁盘）
              └── writeChain.then(resolveOnce)  ← 这里才真正 resolve！
```

三段管道（下载 → 压缩 → 写入磁盘）全部冲刷干净，`await` 才放行，后续的 `writable.close()` 才能安全执行。

---

### 2.4 `void run()` —— 为什么不能 `await run()`

在 `new Promise` 的执行器（executor）内部，使用了 `void run()` 而非 `await run()`。

**`new Promise` 执行器的同步本质：**

```typescript
new Promise<void>((resolve, reject) => {
  // 这个函数是"同步"调用的！
  // JS 引擎不知道也不关心你在里面 await 了什么
  // 如果你写 await run()，执行器函数就变成了 async，
  // 它会返回一个 Promise——但 new Promise 完全不会去 await 它，直接忽略！

  await run(); // ❌ 执行器里的 await，错误被 new Promise 吞掉，永远不会 reject 外层 Promise
});
```

**正确做法：`void run()` + 内部 `rejectOnce`**

```typescript
new Promise<void>((resolve, reject) => {
  const run = async () => {
    try {
      // ... 下载逻辑 ...
    } catch (error) {
      rejectOnce(error); // ← run 内部捕获错误，通过 rejectOnce 桥接给外层 Promise
    }
  };

  void run();
  // void 的作用：
  // 1. 立刻调用 run()，不等待它完成（非阻塞启动）
  // 2. 明确告诉读者和 TypeScript 规则："我知道这是 Promise，我有意不 await 它"
  //    避免 no-floating-promises lint 规则报警告
});
```

**`void run()` 的执行流程：**

```
void run()
  │
  ├── run() 开始执行
  │     │
  │     ├── 第一个 await fetch(...) ← 遇到第一个异步点
  │     │         │
  │     │         └── run() 暂时挂起，把控制权还给执行器
  │     │
  │     └── 执行器继续同步执行（此时 zip 已创建好，回调已注册好）
  │
  └── new Promise(...) 完整初始化完毕，执行器返回
        │
        └── JS 事件循环继续 → fetch 响应到来 → run() 从暂停点继续 → ...
```

---

### 2.5 ZIP 回调是**同步**触发的！

这是理解 `writeChain` 必要性的前提。

```typescript
// 在 run() 的 while 循环里：
entry.push(value, false);
//   ↑ 这行代码执行时，fflate 会在同一个调用栈里立刻调用 ZIP 回调！
//     不是异步的，不是微任务，就是同步的函数调用。

// ZIP 回调：
const zip = new Zip((error, data, final) => {
  // 当 run() 调用 entry.push() 时，这里立刻被调用
  // 此时 run() 的 while 循环还在等着...
  writeChain = writeChain.then(async () => {
    await writable.write(toArrayBuffer(data)); // ← 磁盘写入是异步的
  });
  // 注册完写入任务后，回调返回，entry.push() 才返回，while 循环才继续
});
```

**为什么需要 `writeChain` 串行写入队列？**

```
ZIP 回调触发顺序（同步）:       writeChain 写入顺序（异步串行）:
  chunk1 → 注册写入任务1              任务1 执行 → await write(chunk1)
  chunk2 → 注册写入任务2                  完成 → 任务2 执行 → await write(chunk2)
  chunk3 → 注册写入任务3                      完成 → 任务3 执行 → await write(chunk3)
  ...                                              ...
  final  → writeChain.then(resolve)               完成 → resolve() ← Promise 才 resolve！
```

`writeChain` 保证了：
1. **顺序写入**：chunk1 一定在 chunk2 之前写入磁盘，ZIP 文件字节不会乱序。
2. **背压控制**：如果磁盘写入慢，后续任务会自动排队等待，不会并发写入导致乱序。
3. **完整性保证**：`resolve` 一定要等最后一个写入任务完成，确保文件完整。

---

### 2.6 `isSettled` 幂等保护

```typescript
let isSettled = false;

const resolveOnce = () => {
  if (isSettled) return; // ← 已经 settle 过了，忽略此次调用
  isSettled = true;
  resolve();
};

const rejectOnce = (error: unknown) => {
  if (isSettled) return;
  isSettled = true;
  reject(error);
};
```

**为什么需要这个保护？**

ZIP 回调 + `writeChain` + `run()` 三条路都可能触发 reject：

```
情景：下载到一半，网络断开了
  │
  ├── fetch 抛出 NetworkError
  │     └── run() 的 catch → rejectOnce(NetworkError)  ← 第一次 reject
  │
  └── 同时，ZIP 引擎察觉到错误，也可能触发回调
        └── ZIP 回调的 error 分支 → rejectOnce(zipError)  ← 如果没有保护，第二次 reject！
```

原生 Promise 虽然会忽略第二次 `reject/resolve`，但 `isSettled` 让代码的意图更明确，也防止了后续可能添加的逻辑中出现重复处理。

---

### 2.7 `entry.push(new Uint8Array(0), true)` 的含义

```typescript
// 文件所有数据块读取完毕后：
entry.push(new Uint8Array(0), true);
//               ↑ 空数组      ↑ final = true

// 这行代码的意思：
// "告诉 ZIP 引擎：这个文件的所有数据我已经全部推送完了，请把剩余压缩缓冲区冲刷出来并关闭这个文件条目。"
// fflate 收到 final=true 后会：
//   1. 把内部缓冲区里最后的数据压缩完并触发一次 ZIP 回调
//   2. 写入该文件条目的结束标记
//   3. 这个 entry 就此关闭，不能再 push 数据
```

---

### 2.8 `zip.end()` 的含义

```typescript
zip.end();
// 所有文件的 entry 都已经 push(final=true) 完毕后，调用 zip.end()
// 含义："告诉 ZIP 引擎：没有更多文件了，请写入 ZIP 文件的中央目录（Central Directory）并结束。"
//
// ZIP 格式规范：文件末尾必须有一个"中央目录"，记录所有文件条目的偏移量和元数据。
// zip.end() 触发这个中央目录的写入，之后 ZIP 回调会收到最后一次 final=true 的调用。
// 最后一次 ZIP 回调 → writeChain.then(resolveOnce) → 整个 await new Promise 才真正 resolve。
```

---

## 三、完整执行时序图

```
downloadArchiveFromManifest() 被调用
    │
    ├─ [同步] 初始化私有变量
    ├─ [同步] 创建 AbortController
    ├─ [同步] 创建 progressEmitter
    ├─ [同步] 定义 abort()
    ├─ [同步] writeChain = Promise.resolve()
    ├─ [同步] completion = (async IIFE 立刻启动)
    │             │
    │             ├─ [微任务] await new Promise 开始等待
    │             │             │
    │             │             ├─ [同步] 创建 isSettled, resolveOnce, rejectOnce
    │             │             ├─ [同步] 创建 zip（ZIP 引擎），注册输出回调
    │             │             ├─ [同步] 定义 run()
    │             │             └─ [同步] void run()  ← run() 开始执行
    │             │                           │
    │             │                 [异步循环开始]
    │             │                  for item1:
    │             │                    await fetch(item1) ── 网络等待 ──► 响应回来
    │             │                    activeReader = response.body.getReader()
    │             │                    while:
    │             │                      await reader.read() → 得到 chunk
    │             │                      entry.push(chunk, false)
    │             │                        └─[同步] ZIP 回调触发
    │             │                              └─ writeChain.then(write chunk) 追加
    │             │                      ... 循环读取 ...
    │             │                    entry.push([], true) ← 文件结束信号
    │             │                        └─[同步] ZIP 回调触发（可能含 final）
    │             │                  for item2: ... (同上)
    │             │                  zip.end()
    │             │                    └─[同步] ZIP 最终回调 final=true
    │             │                          └─ writeChain.then(resolveOnce)
    │             │                                └─[异步] 最后写入完成
    │             │                                      └─ resolveOnce() 触发！
    │             │
    │             ├─ await new Promise 的 Promise resolve 了！
    │             ├─ await writable.close()  ─ 或 ─  创建 Blob 触发下载
    │             └─ progressEmitter.emitProgress("done", "", true)
    │
    └─ [同步] return { abort, completion }  ← 调用方拿到句柄
```

---

## 四、错误处理全链路

```
出错来源                    传播路径                        最终处理
──────────────              ──────────────────────          ──────────────
run() 里的 fetch 失败   →   run catch → rejectOnce()   →   外层 completion
                                                            catch 捕获错误
ZIP 压缩回调 error      →   ZIP 回调 error 分支        →   rejectOnce()
                            → rejectOnce()

磁盘写入 writable.write →   writeChain .catch(rejectOnce) → rejectOnce()
失败

用户调用 abort()        →   streamAbortController.abort() → fetch/read 抛出
                            → streamAbortSignal.throwIfAborted()
                            → run catch → rejectOnce()
                            → completion catch isStreamAborted()
                            → 静默返回（正常取消，不算错误）
```

**`completion` 的 `catch` 块保护：**
```typescript
} catch (error: unknown) {
  // 1. 先确保 writable 被中止（避免文件句柄泄露）
  if (writable && !hasWritableClosed && !hasWritableAborted) {
    await writable.abort();
  }

  // 2. 如果是用户主动取消，静默处理（这不是真正的错误）
  if (isStreamAborted()) {
    return; // 不向外抛
  }

  // 3. 真实错误（网络断开、磁盘满等）才向上抛，让组件显示错误 UI
  throw error;
}
```

---

## 五、常见误解解析

**❓ 误解1："completion 是在 `return` 语句之后才开始执行的"**

❌ 错误。IIFE 在 `const completion = (async () => {...})()` 这一行就立刻开始执行了，比 `return` 语句更早。`return` 只是把已经在运行的 Promise 句柄返回给调用方。

---

**❓ 误解2："ZIP 回调里写了 `writeChain.then()`，说明 ZIP 是异步调用回调的"**

❌ 错误。ZIP 回调本身是**同步**调用的（在 `entry.push()` 的调用栈里）。只是在回调里注册了一个**异步**的写入任务到 `writeChain` 上。"注册任务"这个动作是同步的，"写入磁盘"是异步的。

---

**❓ 误解3："`void run()` 中 `void` 是在放弃 Promise，错误会被吞掉"**

❌ 错误。`void` 只是告诉 TypeScript"我知道这个 Promise 我不打算 await"。`run()` 内部有完整的 `try/catch`，所有错误都通过 `rejectOnce(error)` 桥接给了外层 `new Promise` 的 `reject`，不会被静默吞掉。

---

**❓ 误解4："只要 for 循环跑完，下载就完成了"**

❌ 错误。for 循环跑完只代表**所有数据已推入 ZIP 引擎**。实际上：
- ZIP 引擎内部可能还有未输出的压缩缓冲区（需要 `zip.end()` 冲刷）
- `writeChain` 里可能还有未完成的磁盘写入任务

只有 `resolveOnce()` 被调用（即 `writeChain` 全部完成 + ZIP final 回调触发）后，任务才真正完成。

---

## 六、设计模式速查表

| 模式 | 代码体现 | 解决的问题 |
|------|---------|-----------|
| **闭包工厂** | `downloadArchiveFromManifest` 函数本身 | 私有状态隔离，多任务并发安全 |
| **异步 IIFE** | `const completion = (async () => {...})()` | 任务自启动，无需手动 trigger |
| **范式桥接** | `await new Promise((resolve, reject) => {...})` | 连接 async/await 与回调两种异步范式 |
| **串行写入队列** | `writeChain = writeChain.then(...)` | 保证 ZIP 数据块按顺序写入磁盘 |
| **幂等保护** | `isSettled` + `resolveOnce/rejectOnce` | 防止 Promise 被多次 settle |
| **非阻塞启动** | `void run()` | 在同步 Promise 执行器里启动异步工作 |
| **最小接口暴露** | `return { abort, completion }` | 调用方只能操作必要接口，降低误用风险 |
| **组合取消信号** | `AbortSignal.any([外部, 内部])` | 统一两个 AbortSignal，任一触发即中止 |
