/**
 * 下载准备 API 模块。
 *
 * 本模块封装后端 ZIP 归档任务相关的所有 REST 调用：
 * - 启动下载准备任务（startDownload）
 * - 轮询任务进度（getDownloadProgress）
 * - 获取下载清单（getDownloadManifest）
 * - 弹出系统文件保存对话框（selectDownloadSaveTarget）
 *
 * 完整下载流程：
 * 1. startDownload() → 获取 jobId
 * 2. 轮询 getDownloadProgress(jobId) → 等待 status === "ready"
 * 3. getDownloadManifest(jobId) → 获取文件 URL + 路径清单
 * 4. archiveDownloader.downloadArchiveFromManifest() → 前端流式下载并压缩成 ZIP
 */

import { IAbortRequestOptions, sendAuthorizedRequest } from "./apiClient";
import {
  AppError,
  deserializeAppError,
  ensureErrorCause,
} from "../../common/appError";
import type { AppErrorShape } from "../../common/contracts/errorContracts";
import {
  IArchiveManifest,
  IArchiveSaveTarget,
  IShowSaveFilePickerWindow,
} from "../common/types";
import { mapApiErrorResponseToAppError } from "../common/apiErrorMapper";

/**
 * ZIP 归档任务的进度信息。
 *
 * 任务按顺序流转：queued → preparing → ready / failed
 * - queued:    任务已创建，等待处理
 * - preparing: 正在遍历文件/文件夹结构并准备下载清单
 * - ready:     清单准备完成，可由前端开始流式下载和压缩
 * - failed:    任务失败
 */
export interface IJobProgress {
  /** 当前任务状态。 */
  status: "queued" | "preparing" | "ready" | "failed";
  processedFiles: number; // 已处理的文件数
  totalFiles: number; // 总文件数
  currentItem: string; // 当前正在处理的文件名
  preparedBytes: number; // 已准备字节（后端阶段）
  totalBytes: number; // 总字节（后端阶段）
  error: AppError | null; // 失败时的结构化错误对象
}

/**
 * HTTP 线上传输用的 job progress 类型（wire type）。
 *
 * 所谓 wire type，指的是“接口响应体在网络上传输时的原始数据形状”：
 * - 它描述的是 `response.json()` 刚解析出来的 plain object
 * - 它不保证字段已经被恢复成前端运行时对象
 *
 * 这里单独保留一个 wire 类型，是为了把“跨 HTTP 传输的结构”与“service 对外返回的运行时结构”分开：
 * - `IJobProgress` 是本模块返回给调用方的最终类型，`error` 已经是 `AppError | null`
 * - `IJobProgressWire` 是接口刚返回时的原始类型，`error` 仍是可序列化的 `AppErrorShape`
 *
 * 这样 `getDownloadProgress()` 可以先按 wire 类型读取响应，再统一做一次反序列化，
 * 下游 hook / UI 就不用反复判断当前拿到的是 plain object 还是 `AppError` 实例。
 */
type IJobProgressWire = Omit<IJobProgress, "error"> & {
  /** HTTP 响应里的 error 还是可序列化结构，需先反序列化成运行时 AppError。 */
  error?: AppErrorShape;
};

/**
 * 启动下载准备任务。
 *
 * 后端会异步展开目录并生成下载清单（manifest），
 * 真正的 ZIP 压缩由前端 archiveDownloader 模块流式完成。
 * 返回 jobId 后需要轮询 getDownloadProgress() 查看进度。
 *
 * @param containerId 容器 ID（即 Drive ID）
 * @param itemIds     要打包的文件/文件夹 ID 数组
 * @param abortOptions 可选中止信号
 * @returns 任务 ID（jobId），用于后续查询进度和下载
 * @throws 请求失败或未登录时抛出错误
 */
export async function startDownload(
  containerId: string,
  itemIds: string[],
  abortOptions?: IAbortRequestOptions,
): Promise<string> {
  const response = await sendAuthorizedRequest(
    "/api/download/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerId, itemIds }),
    },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    // 后端只返回 jobId，前端后续再用它轮询准备进度并读取 manifest。
    const data = await response.json();
    return data.jobId as string;
  }

  throw await mapApiErrorResponseToAppError(response, {
    operationLabel: "startDownload",
  });
}

/**
 * 查询 ZIP 归档任务的进度。
 *
 * @param jobId       任务 ID（由 startDownload 返回）
 * @param abortOptions 可选中止信号
 * @returns 任务进度信息，包含状态、已处理文件数、当前处理项等
 * @throws 请求失败或未登录时抛出错误
 */
export async function getDownloadProgress(
  jobId: string,
  abortOptions?: IAbortRequestOptions,
): Promise<IJobProgress> {
  const response = await sendAuthorizedRequest(
    `/api/download/progress/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    // 轮询接口仍返回 200 + JobProgress，这里先把跨层错误结构恢复成运行时 AppError。
    const progress = (await response.json()) as IJobProgressWire;
    return {
      ...progress,
      error: progress.error ? deserializeAppError(progress.error) : null,
    };
  }

  throw await mapApiErrorResponseToAppError(response, {
    operationLabel: "getDownloadProgress",
  });
}

/**
 * 获取归档下载清单。
 *
 * @param jobId       任务 ID
 * @param abortOptions 可选中止信号
 * @returns 后端准备好的下载清单（文件 URL + 路径）
 * @throws 请求失败或未登录时抛出错误
 */
export async function getDownloadManifest(
  jobId: string,
  abortOptions?: IAbortRequestOptions,
): Promise<IArchiveManifest> {
  const response = await sendAuthorizedRequest(
    `/api/download/manifest/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    // manifest 是前端流式下载和压缩 ZIP 的最小输入，不需要再额外拼接 Graph 数据。
    return (await response.json()) as IArchiveManifest;
  }

  throw await mapApiErrorResponseToAppError(response, {
    operationLabel: "getDownloadManifest",
  });
}

/**
 * 在用户点击手势中预先打开保存窗口。
 *
 * 这样可以避免在异步轮询回调中调用 `showSaveFilePicker` 导致手势校验失败。
 *
 * @param filename 建议下载文件名。
 * @returns 归档输出目标。
 * @throws 用户取消时抛出 `AppError`。
 */
export async function selectDownloadSaveTarget(
  filename: string,
): Promise<IArchiveSaveTarget> {
  const canWriteDirectly =
    typeof window !== "undefined" &&
    typeof (window as IShowSaveFilePickerWindow).showSaveFilePicker ===
      "function";

  if (!canWriteDirectly) {
    // 不支持 File System Access API 时回退到内存 Blob 下载路径。
    return { filename, writable: null };
  }

  const pickerWindow = window as IShowSaveFilePickerWindow;
  const savePicker = pickerWindow.showSaveFilePicker;
  if (!savePicker) {
    // 这里与上面的能力检测做双保险，避免运行时被不完整的浏览器实现击穿。
    return { filename, writable: null };
  }

  try {
    const handle = await savePicker({
      suggestedName: filename,
      types: [
        {
          description: "ZIP Archive",
          accept: { "application/zip": [".zip"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    // 统一用 filename 承载最终文件名：优先使用用户在保存对话框中确认的名称
    return { filename: handle.name || filename, writable };
  } catch (error: unknown) {
    // 用户取消保存对话框时，不应继续后续下载流程
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError({
        name: "DownloadSaveTargetSelectionCancelledError",
        code: "downloadCancelled",
        message: "Download cancelled by user.",
        originError: {
          source: "app",
          cause: ensureErrorCause(
            error,
            "Download cancelled by user.",
            "AbortError",
          ),
        },
      });
    }

    throw error;
  }
}
