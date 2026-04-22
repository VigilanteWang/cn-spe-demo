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

/** 可选请求参数：用于透传 AbortSignal 到 fetch，支持统一取消链路。 */
interface IAbortRequestOptions {
  requestAbortSignal?: AbortSignal;
}

/**
 * 将 Uint8Array 安全转换为标准 ArrayBuffer。
 * @param chunk 需要转换的二进制块。
 * @returns 可稳定用于 writable.write/Blob 的 ArrayBuffer。
 */
const toArrayBuffer = (chunk: Uint8Array): ArrayBuffer => {
  // 报错根因：fflate 回调中的 data 在类型上可能携带 ArrayBufferLike，
  // 直接传入 write/Blob 时会与严格类型定义冲突；这里拷贝为标准 ArrayBuffer。
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer;
};

/**
 * 创建进度事件发射器（带节流与文件切换即时刷新）。
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
  let lastProgressEmitAt = 0;
  let pendingProgress: IArchiveClientProgress | null = null;
  let pendingProgressTimer: ReturnType<typeof setTimeout> | null = null;
  let lastCurrentItem = "";

  const flushProgress = () => {
    if (!pendingProgress) {
      return;
    }
    // 真正触发组件层回调的唯一出口，保证进度写入行为集中可控。
    onProgress(pendingProgress);
    pendingProgress = null;
    lastProgressEmitAt = Date.now();
  };

  const emitProgress = (
    stage: IArchiveClientProgress["stage"],
    currentItem: string,
    force = false,
  ) => {
    // 每次发射都重新抓取快照，确保 downloaded/zipped/processed 同步最新值。
    const snapshot = getSnapshot();
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
    const itemChanged = currentItem !== lastCurrentItem;
    lastCurrentItem = currentItem;

    // 当前文件发生切换时立即刷新，避免用户观察到文件名延迟。
    if (force || itemChanged) {
      if (pendingProgressTimer) {
        clearTimeout(pendingProgressTimer);
        pendingProgressTimer = null;
      }
      flushProgress();
      return;
    }

    const elapsed = now - lastProgressEmitAt;
    if (elapsed >= PROGRESS_EMIT_INTERVAL_MS) {
      if (pendingProgressTimer) {
        clearTimeout(pendingProgressTimer);
        pendingProgressTimer = null;
      }
      flushProgress();
      return;
    }

    if (!pendingProgressTimer) {
      pendingProgressTimer = setTimeout(() => {
        pendingProgressTimer = null;
        flushProgress();
      }, PROGRESS_EMIT_INTERVAL_MS - elapsed);
    }
  };

  const cleanup = () => {
    if (pendingProgressTimer) {
      clearTimeout(pendingProgressTimer);
      pendingProgressTimer = null;
    }
  };

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
 * 在前端流式下载并压缩归档，完成后自动触发浏览器下载。
 *
 * 该实现会边读取远程文件流边推入 ZIP 压缩器，避免把每个文件完整加载到内存中。
 * 在支持 File System Access API 的浏览器中，ZIP 输出会直接写入磁盘流，进一步降低内存峰值。
 *
 * @param manifest 后端返回的下载清单。
 * @param saveTarget 归档输出目标。
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
  // Blob 构造参数要求的是稳定的二进制片段类型；这里统一收集 ArrayBuffer。
  const fallbackChunks: ArrayBuffer[] = [];

  const writable = saveTarget.writable;

  // ── 第一步：创建内部取消控制器，并与上层信号合成为统一取消源 ───────────
  // 这样组件层点击 Abort 后，fetch/reader/writable 都能收到同一取消信号。
  const streamAbortController = new AbortController();
  const streamAbortSignal = composeAbortSignal(
    abortOptions?.requestAbortSignal,
    streamAbortController.signal,
  );

  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let hasWritableClosed = false;
  let hasWritableAborted = false;

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
  // 约定：abort() 可重复调用且幂等，不会因为二次调用抛异常。
  const abort = () => {
    if (isStreamAborted()) {
      return;
    }

    streamAbortController.abort(new Error(ABORT_ERROR_MESSAGE));
    progressEmitter.cleanup();

    if (activeReader) {
      void activeReader.cancel().catch((error) => {
        console.error("Reader cancel error:", error);
      });
      activeReader = null;
    }

    if (writable && !hasWritableClosed && !hasWritableAborted) {
      hasWritableAborted = true;
      void writable.abort().catch((error) => {
        console.error("Writable abort error:", error);
      });
    }
  };

  // ── 第四步：启动主下载流程（逐文件 fetch -> 流式压缩 -> 写入目标）─────
  // writeChain 用于串行化 ZIP 输出写入，避免多段压缩数据并发写入目标流。
  let writeChain: Promise<void> = Promise.resolve();

  const completion = (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        // 保护 Promise：无论出现多少回调事件，只允许 settle 一次。
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

        const zip = new Zip((error, data, final) => {
          if (error) {
            if (!isStreamAborted()) {
              rejectOnce(error);
            }
            return;
          }

          if (isStreamAborted()) {
            return;
          }

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
            writeChain.then(resolveOnce).catch(rejectOnce);
          }
        });

        const run = async () => {
          try {
            // ── 第五步：遍历 manifest，逐文件下载并推送到 ZIP ────────────────
            for (const item of manifest.items) {
              streamAbortSignal.throwIfAborted();

              // 第五步：每个文件开始时先通知当前处理项，提升 UI 可感知性。
              progressEmitter.emitProgress("downloading", item.relativePath);

              const entry = new AsyncZipDeflate(item.relativePath, {
                level: 6,
              });
              zip.add(entry);

              const response = await fetch(item.downloadUrl, {
                method: "GET",
                // 将统一的取消信号透传给 fetch，实现真正 I/O 级别中止。
                signal: streamAbortSignal,
              });

              if (!response.ok) {
                throw new Error(
                  `Failed to download ${item.relativePath}. HTTP ${response.status}`,
                );
              }

              if (!response.body) {
                // 某些响应可能不暴露可读流，这里退化为一次性 arrayBuffer 读取。
                streamAbortSignal.throwIfAborted();

                const buffer = new Uint8Array(await response.arrayBuffer());
                downloadedBytes += buffer.length;
                progressEmitter.emitProgress("downloading", item.relativePath);
                entry.push(buffer, true);
                processedFiles += 1;
                continue;
              }

              activeReader = response.body.getReader();
              try {
                while (true) {
                  // 流式读取循环必须每轮检查取消，确保 Abort 能快速生效。
                  streamAbortSignal.throwIfAborted();

                  const { done, value } = await activeReader.read();
                  if (done) {
                    break;
                  }

                  if (value) {
                    downloadedBytes += value.length;
                    progressEmitter.emitProgress("downloading", item.relativePath);
                    entry.push(value, false);
                  }
                }
              } finally {
                activeReader = null;
              }

              streamAbortSignal.throwIfAborted();

              entry.push(new Uint8Array(0), true);
              processedFiles += 1;
            }

            streamAbortSignal.throwIfAborted();
            zip.end();
          } catch (error) {
            rejectOnce(error);
          }
        };

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
      if (isStreamAborted()) {
        return;
      }

      if (writable && !hasWritableClosed && !hasWritableAborted) {
        hasWritableAborted = true;
        await writable.abort().catch((abortError) => {
          console.error("Writable abort error:", abortError);
        });
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
