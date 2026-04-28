import { useCallback, useEffect, useRef, useState } from "react";
import { SelectionItemId } from "@fluentui/react-components";
import {
  IArchiveSaveTarget,
  IDriveItemExtended,
} from "../../../common/types";
import SpEmbedded from "../../../services/spembedded";
import { downloadArchiveFromManifest } from "../../../services/archiveDownloader";
import { IDownloadProgress } from "../filesTypes";
import {
  createDownloadProgressState,
  getArchiveProgressBarValue,
  getArchiveProgressPercentText,
  getArchiveProgressText,
} from "../filesUtils";

const spEmbedded = new SpEmbedded();

interface IUseFilesArchiveDownloadOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 当前目录中的文件列表。 */
  driveItems: IDriveItemExtended[];
  /** 当前选中的表格行。 */
  selectedRows: Set<SelectionItemId>;
  /** 单文件直链下载函数。 */
  onDirectDownload: (downloadUrl: string) => void;
}

/**
 * 管理 ZIP 归档下载逻辑。
 * @param options Hook 初始化参数。
 * @returns 下载状态、处理函数和文案计算结果。
 */
export const useFilesArchiveDownload = ({
  containerId,
  driveItems,
  selectedRows,
  onDirectDownload,
}: IUseFilesArchiveDownloadOptions) => {
  const [downloadProgress, setDownloadProgress] = useState<IDownloadProgress>(
    createDownloadProgressState(),
  );
  // 由于下载归档需要轮询后端任务状态，我们使用 useRef 存储定时器 ID，以便在组件卸载时清理。
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 当前 ZIP 下载流程的统一取消控制器：轮询、manifest 请求和流式下载都共享该信号。
  const downloadAbortControllerRef = useRef<AbortController | null>(null);
  // 当前 downloadArchiveFromManifest 返回的 abort 函数引用。
  // 仅靠 AbortSignal 无法触发服务层的 reader.cancel/writable.abort 等资源清理，
  // 因此需要单独存储并在 onAbortClick 中显式调用。
  const downloadSessionAbortRef = useRef<(() => void) | null>(null);

  /**
   * 中止当前下载。
   */
  const onAbortClick = useCallback(() => {
    // 先调用服务层的命令式 abort：显式取消 activeReader 和 writable，
    // 避免仅靠 AbortSignal 时这些资源被旁路而泄露。
    downloadSessionAbortRef.current?.();
    downloadSessionAbortRef.current = null;

    // 触发统一取消信号，让所有依赖该信号的异步流程尽快停止。
    downloadAbortControllerRef.current?.abort();
    downloadAbortControllerRef.current = null;

    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }

    setDownloadProgress((previousState) =>
      createDownloadProgressState({
        isAborted: true,
        backendProgress: previousState.backendProgress,
        clientProgress: previousState.clientProgress,
      }),
    );
  }, []);

  /**
   * 关闭下载状态条。
   */
  const onDismissClick = useCallback(() => {
    downloadAbortControllerRef.current = null;
    setDownloadProgress(createDownloadProgressState());
  }, []);

  /**
   * 启动 ZIP 下载任务。
   * @param itemIds 选中的文件 ID 列表。
   * @param saveTarget 保存目标。
   *
   * 完整流程：
   * 1. 调用 spEmbedded.startDownloadArchive() 启动后端准备任务
   * 2. 轮询后端进度直到状态 ready
   * 3. 获取 manifest 后在前端边下载边压缩
   * 4. 压缩完成后自动触发浏览器下载
   */
  const startZipDownload = useCallback(
    async (itemIds: string[], saveTarget: IArchiveSaveTarget) => {
      // ── 第一步：清理上一轮残留的轮询定时器 ──────────────────────────────────
      // 如果上一次下载还留有定时器未清除（例如用户快速连续点击），先停掉它。
      // 否则两个定时器会同时运行，同时更新同一个 UI 状态，导致进度条跳跃或状态混乱。
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
        downloadPollRef.current = null;
      }

      // ── 第二步：为本次下载创建一个新的取消控制器（AbortController）──────────
      // AbortController 是浏览器内置 API，用于“取消”异步操作（fetch 请求、流式读取等）。
      // 调用 runController.abort() 后，所有传入了 downloadAbortSignal 的异步操作都会收到
      // 取消信号并提前结束，避免已取消的任务继续消耗资源或更新已卸载组件的状态。
      if (downloadAbortControllerRef.current) {
        // 新任务开始前先取消旧任务，避免两条下载流程并发争用同一组 UI 状态。
        downloadAbortControllerRef.current.abort();
      }
      const runController = new AbortController();
      // 将新控制器保存到 ref，方便用户点击 Abort 时从外部调用 abort()。
      downloadAbortControllerRef.current = runController;
      // signal 是一个只读标志对象，传给每个异步调用，当 abort() 被触发时 signal.aborted 变为 true。
      const downloadAbortSignal = runController.signal;

      // ── 第三步：将 UI 进度状态切换为“准备中” ───────────────────────────────
      // 让进度条和提示文字立刻出现在界面上，给用户即时反馈。
      setDownloadProgress(
        createDownloadProgressState({
          phase: "preparing",
          isActive: true,
        }),
      );

      // ── 第四步：调用后端接口，启动归档任务，获取任务 ID ─────────────────────
      // 后端会异步地将所选文件打包成 ZIP manifest（文件清单），这里只是“提交任务”，
      // 并不等待打包完成，打包结果需要后续轮询获取。
      let jobId: string;
      try {
        jobId = await spEmbedded.startDownloadArchive(containerId, itemIds, {
          requestAbortSignal: downloadAbortSignal,
        });
      } catch (error: unknown) {
        // 如果错误是因为用户主动取消（signal.aborted），则静默退出，不展示错误 UI。
        if (downloadAbortSignal.aborted) {
          return;
        }
        // 其他真实错误（网络问题、鉴权失败等）才展示错误状态。
        setDownloadProgress(
          createDownloadProgressState({
            phase: "failed",
            errorMessage: `Failed to start download: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
        if (downloadAbortControllerRef.current === runController) {
          downloadAbortControllerRef.current = null;
        }
        return;
      }

      // ── 第五步：启动轮询，每 800ms 查询一次后端任务进度 ─────────────────────
      // 因为后端打包是异步的，无法立刻拿到结果，所以用 setInterval 定期询问：
      // “你打包好了吗？当前打包了多少个文件？”
      // isPolling 是一个本地互斥锁，防止上一次请求还未返回时，新的轮询又开始请求，
      // 造成多个并发请求同时修改 UI 状态。
      let isPolling = false;

      downloadPollRef.current = setInterval(async () => {
        // 轮询入口做并发与取消双重保护：避免重叠请求和取消后继续推进流程。
        if (isPolling || downloadAbortSignal.aborted) {
          return;
        }

        try {
          isPolling = true;
          // 查询后端当前的打包进度（已处理文件数、总文件数、状态等）。
          const progress = await spEmbedded.getArchivePreparationProgress(jobId, {
            requestAbortSignal: downloadAbortSignal,
          });

          // await 返回后再次检查：用户可能在请求进行中点击 Abort。
          // 因为 await 期间 JS 会交出控制权，用户有机会触发取消操作。
          if (downloadAbortSignal.aborted) {
            return;
          }

          // 将最新的后端进度同步到 UI，进度条会根据 backendProgress 计算填充比例。
          setDownloadProgress((previousState) => ({
            ...previousState,
            phase: progress.status === "failed" ? "failed" : "preparing",
            backendProgress: progress,
          }));

          // ── 分支 A：后端打包完成（status === "ready"）──────────────────────
          if (progress.status === "ready") {
            // 打包已完成，不再需要轮询，立刻清除定时器。
            clearInterval(downloadPollRef.current!);
            downloadPollRef.current = null;

            // 进入 manifest 阶段前检查一次，避免取消后继续触发下游下载。
            // 获取文件清单（manifest）：包含每个待下载文件的 URL 和元数据。
            // 前端将根据这份清单逐个下载文件并在本地实时压缩成 ZIP。
            const manifest = await spEmbedded.getDownloadManifest(jobId, {
              requestAbortSignal: downloadAbortSignal,
            });

            // manifest 获取后再次检查，防止取消后仍创建下载会话。
            if (downloadAbortSignal.aborted) {
              return;
            }

            // 确定最终保存的文件名：优先用用户指定名，其次用后端建议名。
            const finalSaveTarget: IArchiveSaveTarget = {
              ...saveTarget,
              // filename 优先级：用户定义名（若存在）> 前端建议默认名 > 后端默认名。
              filename: saveTarget.filename || manifest.archiveName,
            };

            // 启动前端流式下载 + 实时压缩会话：
            // downloadArchiveFromManifest 会按清单逐个下载文件，边下载边压缩，
            // 全部完成后直接保存到 finalSaveTarget 指定路径。
            // 第三个参数是进度回调（callback），每压缩完一个文件就会被调用一次，
            // 我们在这里把最新的客户端进度同步到 UI。
            const downloadSession = downloadArchiveFromManifest(
              manifest,
              finalSaveTarget,
              (clientProgress) => {
                // 回调内先检查取消标志，避免取消后仍触发 setState（会导致 React 警告）。
                if (downloadAbortSignal.aborted) {
                  return;
                }

                // 属性简写：clientProgress 等价于 clientProgress: clientProgress（ES6 语法）。
                // 后写的属性会覆盖 ...prev 中同名的 clientProgress，从而刷新进度数据。
                setDownloadProgress((previousState) => ({
                  ...previousState,
                  // stage === "done" 时表示压缩全部完成，isActive 置 false 隐藏进度条操作按钮。
                  isActive: clientProgress.stage !== "done",
                  phase:
                    clientProgress.stage === "done"
                      ? "done"
                      : clientProgress.stage,
                  clientProgress,
                }));
              },
              { requestAbortSignal: downloadAbortSignal },
            );

            // 将服务层的命令式 abort 存入 ref，让 onAbortClick 能够触发完整资源清理。
            // 仅在信号尚未中止时写入，若信号已中止则直接触发清理并返回。
            if (downloadAbortSignal.aborted) {
              downloadSession.abort();
              return;
            }
            downloadSessionAbortRef.current = downloadSession.abort;

            // 等待整个流式下载 + 压缩流程结束（completion 是一个 Promise）。
            await downloadSession.completion;

            // completion resolve 后再检查一次：用户可能在最后一刻点击 Abort。
            if (downloadAbortSignal.aborted) {
              return;
            }

            // 下载全部完成，将 UI 切换为“已完成”状态，进度条显示 100%。
            setDownloadProgress((previousState) => ({
              ...previousState,
              phase: "done",
              isActive: false,
              isCompleted: true,
              errorMessage: "",
            }));
            downloadSessionAbortRef.current = null;
            if (downloadAbortControllerRef.current === runController) {
              downloadAbortControllerRef.current = null;
            }

            // ── 分支 B：后端打包失败（status === "failed"）─────────────────────
          } else if (progress.status === "failed") {
            // 后端打包出错，停止轮询并将错误信息展示给用户。
            clearInterval(downloadPollRef.current!);
            downloadPollRef.current = null;
            setDownloadProgress(
              createDownloadProgressState({
                phase: "failed",
                backendProgress: progress,
                // 如果后端返回了具体错误列表，将其拼接展示；否则显示通用提示。
                errorMessage:
                  progress.errors.length > 0
                    ? progress.errors.join("; ")
                    : "Archive job failed.",
              }),
            );
            downloadSessionAbortRef.current = null;
            if (downloadAbortControllerRef.current === runController) {
              downloadAbortControllerRef.current = null;
            }
          }
          // 分支 C（隐式）：status 仍为 "queued"/"preparing"，什么都不做，等下一次轮询。
        } catch (error: unknown) {
          // ── 异常处理：轮询或下载过程中抛出未预期的错误 ──────────────────────
          // 例如：网络中断、服务器 500、流式写入失败等。
          if (downloadPollRef.current) {
            clearInterval(downloadPollRef.current);
            downloadPollRef.current = null;
          }

          // 取消操作本身也会导致 fetch 抛出 AbortError，此时不应展示错误 UI。
          if (!downloadAbortSignal.aborted) {
            setDownloadProgress(
              createDownloadProgressState({
                phase: "failed",
                errorMessage: `Download failed: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
            );
          }

          downloadSessionAbortRef.current = null;
          if (downloadAbortControllerRef.current === runController) {
            downloadAbortControllerRef.current = null;
          }
        } finally {
          // finally 无论成功、失败还是取消都会执行，确保互斥锁被释放，
          // 否则 isPolling 永远为 true，后续所有轮询都会被跳过。
          isPolling = false;
        }
      }, 800);
    },
    [containerId],
  );

  /**
   * 工具栏下载按钮处理。
   * - 单个非文件夹文件：使用直链下载（@microsoft.graph.downloadUrl）。
   * - 多个文件或包含文件夹：通过后端 ZIP 归档任务下载。
   */
  const onToolbarDownloadClick = useCallback(async () => {
    const selectedIds = Array.from(selectedRows) as string[];

    if (selectedIds.length === 0) {
      return;
    }

    if (selectedIds.length === 1) {
      const selectedItem = driveItems.find((item) => item.id === selectedIds[0]);

      if (selectedItem && !selectedItem.isFolder && selectedItem.downloadUrl) {
        onDirectDownload(selectedItem.downloadUrl);
        return;
      }
    }

    const defaultFilename = `SPE-${Date.now()}.zip`;

    try {
      /** 用户手势限制 (User Gesture Restriction) 是浏览器的一种安全机制。
       * 它规定某些敏感操作（如弹出窗口、自动播放音频、启动下载等）必须由用户的直接交互触发。
       * 在用户点击手势上下文中先申请保存目标，避免后续异步流程触发手势限制。
       */
      const saveTarget = await spEmbedded.selectArchiveSaveTarget(defaultFilename);
      await startZipDownload(selectedIds, saveTarget);
    } catch (error: unknown) {
      setDownloadProgress(
        createDownloadProgressState({
          phase: "failed",
          errorMessage:
            error instanceof Error &&
            error.message === "Download cancelled by user."
              ? "Download cancelled."
              : `Failed to open save dialog: ${
                  error instanceof Error ? error.message : String(error)
                }`,
        }),
      );
    }
  }, [driveItems, onDirectDownload, selectedRows, startZipDownload]);

  useEffect(() => {
    return () => {
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
      }

      downloadSessionAbortRef.current?.();
      downloadAbortControllerRef.current?.abort();
    };
  }, []);

  return {
    downloadProgress,
    onAbortClick,
    onDismissClick,
    onToolbarDownloadClick,
    getArchiveProgressBarValue: () =>
      getArchiveProgressBarValue(downloadProgress),
    getArchiveProgressPercentText: () =>
      getArchiveProgressPercentText(downloadProgress),
    getArchiveProgressText: () => getArchiveProgressText(downloadProgress),
  };
};
