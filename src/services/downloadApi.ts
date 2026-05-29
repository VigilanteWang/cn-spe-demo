/**
 * 下载准备 API 模块
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
import { FrontendApiError, FrontendUserActionError } from "../common/errors.ts";
import {
  IArchiveManifest,
  IArchiveSaveTarget,
  IShowSaveFilePickerWindow,
} from "../common/types";
import { readApiErrorResponseSummary } from "./apiErrorMapper";

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
  errors: string[]; // 严格失败模式下的致命错误列表
}

/**
 * 用户取消下载保存目标选择时抛出的稳定错误。
 *
 * 当 showSaveFilePicker 弹窗被用户关闭时抛出，
 * 调用方应捕获此错误并中止整个下载流程。
 */
export class DownloadSaveTargetSelectionCancelledError extends FrontendUserActionError {
  /**
   * 创建一个“用户主动取消下载保存”的稳定错误。
   */
  constructor() {
    super("downloadCancelled", "Download cancelled by user.", {
      name: "DownloadSaveTargetSelectionCancelledError",
    });
  }
}

/**
 * 归档下载相关后端请求失败时抛出的稳定错误类型。
 */
export class ArchiveRequestError extends FrontendApiError {
  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    options: {
      statusCode: number;
      requestId?: string;
      retryAfterSeconds?: number;
      details?: Record<string, unknown>;
    },
  ) {
    super(code, message, {
      name: "ArchiveRequestError",
      statusCode: options.statusCode,
      details: options.details,
    });
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * 根据后端响应构造归档 API 请求错误。
 *
 * @param code 前端稳定错误码。
 * @param operation 当前失败的操作名。
 * @param response 原始 HTTP 响应对象。
 * @returns 统一的前端 API 错误对象。
 */
const buildArchiveRequestError = async (
  code: string,
  operation: string,
  response: Response,
): Promise<ArchiveRequestError> => {
  const summary = await readApiErrorResponseSummary(response, {
    fallbackCode: code,
    operationLabel: operation,
  });

  return new ArchiveRequestError(summary.code, summary.message, {
    statusCode: summary.statusCode,
    requestId: summary.requestId,
    retryAfterSeconds: summary.retryAfterSeconds,
    details: summary.details,
  });
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
  throw await buildArchiveRequestError(
    "startArchivePreparationFailed",
    "startDownload",
    response,
  );
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
    // 这里直接把后端 JSON 映射成强类型进度对象，供页面驱动进度条和状态文案。
    return (await response.json()) as IJobProgress;
  }
  throw await buildArchiveRequestError(
    "archivePreparationProgressFailed",
    "getDownloadProgress",
    response,
  );
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
  throw await buildArchiveRequestError(
    "downloadManifestFailed",
    "getDownloadManifest",
    response,
  );
}

/**
 * 在用户点击手势上下文中预先弹出保存窗口。
 *
 * 这样可以避免在异步轮询回调中调用 showSaveFilePicker 导致手势校验失败。
 *
 * @param filename 建议下载文件名
 * @returns 归档输出目标（含文件名和可写流）
 * @throws 用户取消时抛出 DownloadSaveTargetSelectionCancelledError
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
      throw new DownloadSaveTargetSelectionCancelledError();
    }
    throw error;
  }
}
