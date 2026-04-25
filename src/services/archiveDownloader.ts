/**
 * 归档下载模块（前端流式下载 + 实时压缩）。
 *
 * 模块职责：
 * 1. 消费后端返回的 manifest，逐个下载文件内容
 * 2. 使用 fflate 将下载流实时写入 ZIP，避免整包驻留内存
 * 3. 将 ZIP 输出写入用户选择的磁盘流（优先）或 Blob 回退下载
 * 4. 提供统一的取消链路与进度回调，供组件层驱动 UI
 *
 * 设计目标：
 * - 降低内存峰值：按块读取、按块压缩、按块写入
 * - 可中止：轮询/请求/流读取/写入共享 AbortSignal
 * - 可观测：关键阶段持续上报 downloaded/zipped/progress
 */
import { AsyncZipDeflate, Zip } from "fflate";
import {
  IArchiveClientProgress,
  IArchiveDownloadSession,
  IArchiveManifest,
  IArchiveSaveTarget,
} from "../common/types";

/** 可选请求参数：用于透传调用方 AbortSignal 到 fetch，支持统一取消链路。 */
interface IAbortRequestOptions {
  requestAbortSignal?: AbortSignal;
}

/**
 * 将 Uint8Array 安全转换为标准 ArrayBuffer。
 * @param chunk 需要转换的二进制块。
 * @returns 可稳定用于 writable.write 的 ArrayBuffer。
 */
const toArrayBuffer = (chunk: Uint8Array): ArrayBuffer => {
  // 报错根因：fflate 回调中的 data 在类型上可能携带 ArrayBufferLike，
  // 直接传入 write/Blob 时会与严格类型定义冲突；这里拷贝为标准 ArrayBuffer。
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer;
};

/**
 * 创建进度发射器（带节流与文件切换即时刷新）。
 * @param totalFiles 总文件数。
 * @param totalBytes 总字节数。
 * @param getSnapshot 获取当前动态进度快照。
 * @param onProgress 外部进度回调。
 * @returns emit/cleanup 两个方法。
 */
const createProgressEmitter = (
  totalFiles: number,
  totalBytes: number,
  getSnapshot: () => {
    processedFiles: number;
    downloadedBytes: number;
    zippedBytes: number;
  },
  onProgress: (progress: IArchiveClientProgress) => void,
) => {
  // 节流周期：避免高频 setState 导致 React 渲染压力过大。
  const PROGRESS_EMIT_INTERVAL_MS = 1000;
  // 记录上次真正触发 onProgress 回调的时间戳，用于计算是否应该立即发送还是等待节流。
  let lastProgressEmitAt = 0;
  // 暂存最新的进度对象，可能被多次 emitProgress 更新，定时器触发时读取其最新值。
  let pendingProgress: IArchiveClientProgress | null = null;
  // 定时器句柄，用于在回调执行时清除（避免多次触发）或取消（当检测到文件切换时）。
  let pendingProgressTimer: ReturnType<typeof setTimeout> | null = null;
  // 记录上一次报告的文件名，用于检测当前文件是否发生切换（如从 file1.txt 变成 file2.txt）。
  let lastCurrentItem = "";

  const flushProgress = () => {
    if (!pendingProgress) {
      return;
    }
    // 立即把当前缓存的进度对象交给外部回调。
    // 这是唯一真正“发送进度”的地方，发送后会清空缓存，避免同一份进度被重复上报。
    onProgress(pendingProgress);
    pendingProgress = null;
    // 更新发送时间戳，作为下一轮节流判断的基准点。
    lastProgressEmitAt = Date.now();
  };

  const emitProgress = (
    stage: IArchiveClientProgress["stage"],
    currentItem: string,
    force = false,
  ) => {
    // 重新读取当前快照，把最新的 downloaded / zipped / processed 数值打包成一个完整进度对象。
    // 这样外部收到的进度总是自洽的，不会出现文件名和字节数来自不同时间点的情况。
    const snapshot = getSnapshot();
    // 把这次生成的进度对象先放到 pendingProgress 中，后续定时器回调会读取它并统一发出。
    pendingProgress = {
      stage,
      totalFiles,
      processedFiles: snapshot.processedFiles,
      totalBytes,
      downloadedBytes: snapshot.downloadedBytes,
      zippedBytes: snapshot.zippedBytes,
      currentItem,
    };

    const now = Date.now();
    // 对比当前文件名和上次文件名，判断是不是切到了新文件。
    const itemChanged = currentItem !== lastCurrentItem;
    // 先记录本次文件名，方便下一次调用判断是否发生切换。
    lastCurrentItem = currentItem;

    // 如果文件切换了，或者调用方要求强制发送，就立刻刷新进度。
    // 这样 UI 能马上看到新文件名，不会被节流延迟影响。
    if (force || itemChanged) {
      if (pendingProgressTimer) {
        clearTimeout(pendingProgressTimer);
        pendingProgressTimer = null;
      }
      flushProgress();
      return;
    }

    // 计算距离上次真正发送已经过去多久，用于决定这次是立即发还是继续等。
    const elapsed = now - lastProgressEmitAt;
    // 超过 1000ms 就直接发送；否则先缓存起来，等到节流窗口结束再统一发出。
    if (elapsed >= PROGRESS_EMIT_INTERVAL_MS) {
      if (pendingProgressTimer) {
        clearTimeout(pendingProgressTimer);
        pendingProgressTimer = null;
      }
      flushProgress();
      return;
    }

    // 如果还没有定时器，就安排一个延迟回调。
    // 回调触发时会发送“当前最新”的 pendingProgress，所以中间多次更新会被合并。
    if (!pendingProgressTimer) {
      pendingProgressTimer = setTimeout(() => {
        pendingProgressTimer = null;
        flushProgress();
      }, PROGRESS_EMIT_INTERVAL_MS - elapsed);
    }
  };

  const cleanup = () => {
    // 清理可能仍在等待中的定时器，避免卸载组件后仍有延迟回调执行。
    if (pendingProgressTimer) {
      clearTimeout(pendingProgressTimer);
      pendingProgressTimer = null;
    }
  };
  // 返回一个进度更新函数和一个清理函数。
  return {
    emitProgress,
    cleanup,
  };
};

/**
 * 组合外部与内部取消信号，统一形成单一的执行取消源。
 * @param requestAbortSignal 上层传入的可选取消信号。
 * @param internalAbortSignal 内部会话控制器的取消信号。
 * @returns 组合后的可取消信号。
 */
const composeAbortSignal = (
  requestAbortSignal: AbortSignal | undefined,
  internalAbortSignal: AbortSignal,
): AbortSignal => {
  // 调用方未传入取消信号时，直接使用内部会话信号。
  if (!requestAbortSignal) {
    return internalAbortSignal;
  }
  // 现代组合方式：任一信号取消都会立即中止整条执行链路。
  return AbortSignal.any([requestAbortSignal, internalAbortSignal]);
};

/**
 * 闭包工厂函数（Closure-based Factory Function）说明：
 *
 * - `downloadArchiveFromManifest` 以闭包工厂的形式实现，
 *   每次调用会构建一组私有变量（如 downloadedBytes、activeReader、writeChain 等），
 *   并返回一个仅包含 `abort` 与 `completion` 的最小会话句柄给调用方。
 * - 为什么优于 class（简要总结）：
 *   1. 封装性更好：闭包天然实现私有状态，无需暴露或管理 `this`。
 *   2. API 更小：只暴露必要接口，降低误用风险并保持调用侧简单。
 *   3. 与现代函数式/组合式风格一致：便于在 React Hooks、Web Streams 场景中使用与测试。
 *   4. 无继承/原型开销：不引入 class 继承链或依赖注入复杂性，代码更轻量、打包更小，支持Tree Shaking。
 */
/**
 * 在前端流式下载多个文件文件夹并压缩归档，完成后自动触发浏览器下载。
 *
 * 该实现会边读取远程文件流边推入 ZIP 压缩器。如果浏览器支持，ZIP 输出会直接写入磁盘流。
 * 做到 “边下载，边压缩，边写入”，减少内存占用。
 *
 * @param manifest 后端返回的下载清单。
 * @param saveTarget zip保存文件，拿到文件写入器。
 * @param onProgress 进度回调，用于更新下载与压缩进度。
 * @param abortOptions 可选中止参数，用于接入外层 AbortSignal 并与内部信号合并。
 * @returns IArchiveDownloadSession 可中止的下载会话。
 */
export const downloadArchiveFromManifest = (
  manifest: IArchiveManifest,
  saveTarget: IArchiveSaveTarget,
  onProgress: (progress: IArchiveClientProgress) => void,
  abortOptions?: IAbortRequestOptions,
): IArchiveDownloadSession => {
  // ── 第零步：初始化归档上下文与计数器 ───────────────────────────────────
  // totalFiles/totalBytes 来自后端清单，用于进度条计算。
  const totalFiles = manifest.totalFiles;
  const totalBytes = manifest.totalBytes;
  const ABORT_ERROR_MESSAGE = "Archive download aborted.";

  let downloadedBytes = 0;
  let zippedBytes = 0;
  let processedFiles = 0;
  // 回退Blob下载方式，要求统一收集 ArrayBuffer。
  const fallbackChunks: ArrayBuffer[] = [];
  //  FileSystemWritableFileStream 写入器
  const writable = saveTarget.writable;

  // ── 第一步：创建内部 AbortController，并与上层信号合成为统一取消源 ───────────
  // 这样上层点击 Abort 后，fetch/reader/writable 都能收到同一取消信号。
  const streamAbortController = new AbortController();
  const streamAbortSignal = composeAbortSignal(
    abortOptions?.requestAbortSignal,
    streamAbortController.signal,
  );

  // 来自 response.body.getReader()
  // 用于逐块读取远端响应的 Uint8Array 数据，读取完成或中止后需释放（设为 null）。
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  // 目标 writable 是否已成功 close，避免重复 close/在已 close 状态下调用 abort。
  let hasWritableClosed = false;

  // 目标 writable 是否已被 abort（中止），用于保持 abort 调用的幂等性。
  let hasWritableAborted = false;
  // 辅助函数：检查当前有没有 Abort 信号。
  const isStreamAborted = () => streamAbortSignal.aborted;

  // ── 第二步：创建进度发射器，统一管理节流与即时刷新逻辑 ───────────────
  // 组件无需关心节流细节，只订阅结构化进度对象即可。
  const progressEmitter = createProgressEmitter(
    totalFiles,
    totalBytes,
    () => ({
      processedFiles,
      downloadedBytes,
      zippedBytes,
    }),
    onProgress,
  );

  // ── 第三步：暴露中止方法，统一处理 reader/writable/定时器资源回收 ─────
  // 注意：这里不进行 isStreamAborted() 前置检查。
  // 原因：当上层的 requestAbortSignal 已经中止时，streamAbortSignal.aborted 为 true，
  // 如果在此处返回， reader.cancel / writable.abort 等命令式清理将被忽略，
  // 导致 FileSystemWritableFileStream 句柄泄露。
  // 幂等性通过 hasWritableAborted / hasWritableClosed / activeReader === null 等标志保证。
  const abort = () => {
    // 先触发内部中止信号，把 fetch / read / 写入链路统一切到取消态。
    // 这里保留命令式清理，不依赖 signal 本身来释放资源。
    streamAbortController.abort(new Error(ABORT_ERROR_MESSAGE));

    // 先清掉进度定时器，避免取消后仍然延迟刷新 UI。
    progressEmitter.cleanup();

    if (activeReader) {
      // 主动取消当前 reader，尽快释放正在占用的网络流。
      void activeReader.cancel().catch((error) => {
        console.error("Reader cancel error:", error);
      });
      activeReader = null;
    }

    if (writable && !hasWritableClosed && !hasWritableAborted) {
      // 直接中止可写文件流，确保文件句柄被及时释放。
      hasWritableAborted = true;
      void writable.abort().catch((error) => {
        console.error("Writable abort error:", error);
      });
    }
  };

  // ── 第四步：启动主下载流程（逐文件 fetch -> 流式压缩 -> 写入目标）─────

  // writeChain 初始化为一个已解决的 Promise，它就会立刻执行后续的 then() 回调。
  // 每当 ZIP 输出一段数据时，都会把写入操作链到 writeChain 上，形成一个串行的 Promise 链。
  let writeChain: Promise<void> = Promise.resolve();

  // ── 异步 IIFE（立即执行函数表达式）说明 ─────────────────────────────────
  // completion 被写成 "(async () => { ... })()" 的形式：
  //   - "async () => { ... }" 是一个匿名异步函数。
  //   - 末尾的 "()" 表示"定义完立刻调用"，函数一经声明就自动执行，返回的 Promise 赋值给 completion。
  //
  // 为什么用 IIFE 而不是普通 async 函数？
  //   1. 【自启动】工厂函数 return 的瞬间，下载任务已在后台自动开始，调用方无需再手动触发。
  //   2. 【闭包捕获】IIFE 内部可以直接访问上面声明的所有私有变量（writable、progressEmitter 等）。
  //   3. 【即时 Promise】completion 从工厂函数同步执行期间就已经是"运行中"的 Promise，
  //      调用方直接 await completion 即可等待整个任务结束，无需额外触发动作。
  const completion = (async () => {
    try {
      // ── 为什么 completion 一开始就 await new Promise？（范式桥接层）────────
      // 问题背景：
      //   - 下载层（fetch + 流读取）是"拉取式"：代码用 async/await 一步步等待数据块到来。
      //   - 压缩层（fflate.Zip）是"推送式"：数据压缩好后它主动调用回调函数通知我们。
      //   这两种范式（async/await vs 回调）无法直接组合，需要一个"转换适配器"。
      //
      // 解决方案：用 new Promise 手动包裹整条管道，自己掌控 resolve / reject 的触发时机：
      //   - resolve 的时机：ZIP 回调收到 final=true，且最后一段数据已写入磁盘（writeChain 完成）。
      //   - reject 的时机：任意环节（网络失败/写入失败/压缩失败）调用 rejectOnce 时。
      //
      // 如果不用 await new Promise 会怎样？
      //   for 循环跑完 ≠ 压缩完成 ≠ 磁盘写入完成。
      //   若直接调用 writable.close()，文件将被提前截断，尾部数据永久丢失。
      await new Promise<void>((resolve, reject) => {
        // 保护 Promise：无论出现多少回调事件，只允许 settle 一次。
        // 原因：ZIP 回调、writeChain、run() 三条路都可能触发 reject，需防止重复 settle。
        let isSettled = false;

        const resolveOnce = () => {
          if (isSettled) {
            return;
          }
          isSettled = true;
          resolve();
        };

        const rejectOnce = (error: unknown) => {
          if (isSettled) {
            return;
          }
          isSettled = true;
          reject(error);
        };

        // ── ZIP 引擎初始化 ──────────────────────────────────────────────────
        // ZIP 和 fflate 介绍，参考 archive-downloader-deep-dive.md 文档。
        // fflate.Zip 构造时接收一个"输出回调"，每当有一批压缩好的数据块准备好时就会触发。
        //
        // 【重要】这个回调是在 entry.push() 的同步调用栈中触发的——不是异步的！
        // 当 run() 调用 entry.push(chunk) 时，fflate 会在同一调用帧内立刻调用此回调，
        // 把压缩好的数据"推"过来。回调执行完毕，entry.push() 才返回，run() 才继续循环。
        //
        // 由于回调是同步的，但磁盘写入是异步的，我们用 writeChain（串行 Promise 链）来排队：
        //   每次回调触发 → 追加一个写入任务到 writeChain 末尾 → 前一个写完再写下一个 → 保证顺序。
        const zip = new Zip((error, data, final) => {
          if (error) {
            // 压缩引擎内部错误，非用户取消，才需要 reject 外层 Promise。
            if (!isStreamAborted()) {
              rejectOnce(error);
            }
            return;
          }

          // 如果已经收到中止信号，停止写入，避免无用的磁盘 I/O。
          if (isStreamAborted()) {
            return;
          }
          // async function通常会返回一个新的 Promise，但由于 Promise flattening,
          // 外层的 then 会等待它完成，这样即使 writeChain.then(async).then(async)
          // 每个 async 操作就会被串行化，确保数据按顺序写入。
          // 如果没有 Promise flattening，因为 async 执行到 await 异步等待 时就会立刻返回，
          // then 看到返回后就会立刻resolve，交由下一个 then 执行，导致数据写入可能乱序。
          writeChain = writeChain
            .then(async () => {
              // ZIP 回调可能非常频繁；每段数据都需要累加并写入输出目标。
              zippedBytes += data.length;
              if (writable) {
                // 先转成标准 ArrayBuffer，再写入磁盘流，规避 Uint8Array 泛型缓冲区差异。
                await writable.write(toArrayBuffer(data));
              } else {
                // 回退路径同样存放 ArrayBuffer，确保 new Blob(...) 的参数类型稳定。
                fallbackChunks.push(toArrayBuffer(data));
              }
            })
            .catch(rejectOnce);

          if (final) {
            // ZIP 引擎已输出所有数据（包含中央目录结束标记）。
            // 但最后几段数据的磁盘写入可能还在 writeChain 里排队中——
            // 必须等 writeChain 全部冲刷完毕，才能 resolve 外层 Promise，
            // 这样后续的 writable.close() 或 Blob 下载才能在数据完整落盘后安全执行。
            writeChain.then(resolveOnce).catch(rejectOnce);
          }
        });

        // run 是真正执行下载流程的异步工作函数：
        // 因为 外层执行函数必须是同步的（new Promise 的执行器要求），所以这里定义一个 async function 来跑异步代码。
        // 它会先同步跑完前面的普通代码，遇到第一个 await 才暂停，并把控制权交回事件循环。
        // 完成后，async function 会自动 fulfill 返回的 Promise，或者在抛出错误时 reject 这个 Promise。
        const run = async () => {
          try {
            // 这里开始真正处理每个文件。
            // 做法是：先下载，再压缩，最后把压缩结果交给 ZIP。
            for (const item of manifest.items) {
              // 每轮开始先检查一次取消信号，避免用户已经点了停止还继续跑。
              streamAbortSignal.throwIfAborted();

              // 先告诉界面：现在正在处理哪个文件。
              progressEmitter.emitProgress("downloading", item.relativePath);

              // 为当前文件创建一个压缩入口。
              // 这个入口会接收原始字节，再把压缩后的内容交给 ZIP。
              const entry = new AsyncZipDeflate(item.relativePath, {
                level: 6,
              });
              zip.add(entry);

              //  这里不是直接下载到内存，而是拿到一个可读流，边下载边读，配合 entry.push() 实现流式压缩。
              const response = await fetch(item.downloadUrl, {
                method: "GET",
                // 将统一的取消信号透传给 fetch，实现真正 I/O 级别中止。
                signal: streamAbortSignal,
              });

              if (!response.ok) {
                // HTTP 返回失败时，直接中断整个归档流程。
                throw new Error(
                  `Failed to download ${item.relativePath}. HTTP ${response.status}`,
                );
              }

              if (!response.body) {
                // 有些响应没有流，只能一次性读完整个文件。
                streamAbortSignal.throwIfAborted();

                const buffer = new Uint8Array(await response.arrayBuffer());
                // 记录已经下载了多少字节，方便进度条更新。
                downloadedBytes += buffer.length;
                progressEmitter.emitProgress("downloading", item.relativePath);
                // 把完整文件一次性推给压缩器。
                entry.push(buffer, true);
                // 这个文件已经处理完成。
                processedFiles += 1;
                continue;
              }

              // 如果有下载可读流，就按块读取，这样更省内存。
              activeReader = response.body.getReader();
              try {
                while (true) {
                  // 每读一轮都检查一次取消，保证停止按钮能尽快生效。
                  streamAbortSignal.throwIfAborted();

                  // 读取下一块数据。
                  const { done, value } = await activeReader.read();
                  if (done) {
                    // 读完了就跳出循环。
                    break;
                  }

                  if (value) {
                    // 记录已下载字节数，并把进度发给界面。
                    downloadedBytes += value.length;
                    progressEmitter.emitProgress(
                      "downloading",
                      item.relativePath,
                    );
                    // 把这一小块原始数据推给压缩器。
                    entry.push(value, false);
                  }
                }
              } finally {
                // 不管成功还是失败，都释放 reader。
                activeReader = null;
              }

              // 再检查一次取消信号，避免刚读完就被取消后继续收尾。
              streamAbortSignal.throwIfAborted();

              // 告诉压缩器：这个文件结束了。
              // true 表示 final，压缩器会把剩下的内容一次性吐出来。
              entry.push(new Uint8Array(0), true);
              // 这个文件已经完整处理完。
              processedFiles += 1;
            }

            streamAbortSignal.throwIfAborted();
            // 所有文件都处理完后，通知 ZIP 开始收尾。
            // 这里会写出 ZIP 结尾需要的目录信息。
            zip.end();
          } catch (error) {
            // 任何一步出错，都交给外层统一处理。
            rejectOnce(error);
          }
        };

        // ── 为什么这里写 void run()，而不是 await run()？──────────────────
        // 外层 new Promise 的执行器（(resolve, reject) => { ... }）本身必须是同步函数。
        // 这里调用 run() 时，它会立刻返回一个 Promise，但 外层 Promise 构造函数不会自动等待这个返回值。
        //
        // 如果把执行器写成 async，然后在里面写 await run()，那么执行器自己会额外返回一个 Promise。
        // 这个“执行器返回的 Promise”不会被 new Promise 使用，所以它里面的错误也不会自动传给外层的 reject。
        //
        // 现在的写法是：
        //   1. run() 负责真正执行下载工作，并在内部用 try/catch 把错误转成 rejectOnce(error)。
        //   2. void 只是告诉阅读者和 TypeScript：这里故意不等待 run() 的返回值，
        //      因为外层已经通过 resolveOnce / rejectOnce 接管了结果。
        //   3. run() 一调用就开始执行，先同步跑一段代码，遇到第一个 await 后再挂起到事件循环。
        //      它完成后，会自动 fulfill。
        //
        // 简单说：void run() 的作用是“启动它”，不是“等待它”。
        void run();
      });

      if (isStreamAborted()) {
        return;
      }

      // ── 第六步：根据输出模式落盘（磁盘流优先，Blob 回退）────────────────
      // writable 存在：直接写入用户选择的目标文件。
      // writable 不存在：组装 Blob 并触发浏览器下载。
      if (writable) {
        await writable.close();
        hasWritableClosed = true;
      } else {
        const zipBlob = new Blob(fallbackChunks, { type: "application/zip" });
        const blobUrl = URL.createObjectURL(zipBlob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = saveTarget.filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      }

      // ── 第七步：最终强制发射 done，确保 UI 立即收敛到完成态 ─────────────
      progressEmitter.emitProgress("done", "", true);
    } catch (error: unknown) {
      // 无论是用户主动取消还是真实错误，都需要先确保 writable 被正确释放。
      // 注意：若 abort() 已经执行过，hasWritableAborted 标志会阻止重复调用。
      if (writable && !hasWritableClosed && !hasWritableAborted) {
        hasWritableAborted = true;
        await writable.abort().catch((abortError) => {
          console.error("Writable abort error:", abortError);
        });
      }

      // 中止信号触发的错误是预期行为（用户主动取消），静默恢复即可。
      // 真实错误（网络中断、写入失败等）才需要向上抛出，让外层 catch 展示错误 UI。
      if (isStreamAborted()) {
        return;
      }

      throw error;
    } finally {
      // ── 第八步：统一清理资源，避免组件卸载后仍存在延迟回调或事件监听 ───
      progressEmitter.cleanup();

      activeReader = null;
    }
  })();

  return {
    abort,
    completion,
  };
};
