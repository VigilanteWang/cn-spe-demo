/**
 * 归档下载 API 模块
 *
 * 本模块封装后端 ZIP 归档任务相关的所有 REST 调用：
 * - 启动归档准备任务（startDownloadArchive）
 * - 轮询任务进度（getArchivePreparationProgress）
 * - 获取下载清单（getDownloadManifest）
 * - 弹出系统文件保存对话框（selectArchiveSaveTarget）
 *
 * 完整下载流程：
 * 1. startDownloadArchive() → 获取 jobId
 * 2. 轮询 getArchivePreparationProgress(jobId) → 等待 status === "ready"
 * 3. getDownloadManifest(jobId) → 获取文件 URL + 路径清单
 * 4. archiveDownloader.downloadArchiveFromManifest() → 前端流式下载并压缩成 ZIP
 */

import {
  IAbortRequestOptions,
  sendAuthorizedRequest,
} from "./apiClient";
import { FrontendApiError, FrontendUserActionError } from "../common/errors.ts";
import {
  IArchiveManifest,
  IArchiveSaveTarget,
  IShowSaveFilePickerWindow,
} from "../common/types";

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
  status: "queued" | "preparing" | "ready" | "failed";
  processedFiles: number; // 已处理的文件数
  totalFiles: number; // 总文件数
  currentItem: string; // 当前正在处理的文件名
  preparedBytes: number; // 已准备字节（后端阶段）
  totalBytes: number; // 总字节（后端阶段）
  errors: string[]; // 错误信息列表（部分文件可能失败）
}

/**
 * 用户取消归档保存目标选择时抛出的稳定错误。
 *
 * 当 showSaveFilePicker 弹窗被用户关闭时抛出，
 * 调用方应捕获此错误并中止整个下载流程。
 */
export class ArchiveSaveTargetSelectionCancelledError extends FrontendUserActionError {
  constructor() {
    super("downloadCancelled", "Download cancelled by user.", {
      name: "ArchiveSaveTargetSelectionCancelledError",
    });
  }
}

/**
 * 根据后端响应构造归档 API 请求错误。
 */
const buildArchiveRequestError = (
  code: string,
  operation: string,
  response: Response,
): FrontendApiError =>
  new FrontendApiError(code, `${operation} failed: ${response.status}`, {
    name: "ArchiveApiError",
    statusCode: response.status,
  });

/**
 * 启动归档下载准备任务。
 *
 * 后端会异步展开目录并生成下载清单（manifest），
 * 真正的 ZIP 压缩由前端 archiveDownloader 模块流式完成。
 * 返回 jobId 后需要轮询 getArchivePreparationProgress() 查看进度。
 *
 * @param containerId 容器 ID（即 Drive ID）
 * @param itemIds     要打包的文件/文件夹 ID 数组
 * @param abortOptions 可选中止信号
 * @returns 任务 ID（jobId），用于后续查询进度和下载
 * @throws 请求失败或未登录时抛出错误
 */
export async function startDownloadArchive(
  containerId: string,
  itemIds: string[],
  abortOptions?: IAbortRequestOptions,
): Promise<string> {
  const response = await sendAuthorizedRequest(
    "/api/downloadArchive/start",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerId, itemIds }),
    },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    const data = await response.json();
    return data.jobId as string;
  }
  throw buildArchiveRequestError(
    "startArchivePreparationFailed",
    "startDownloadArchive",
    response,
  );
}

/**
 * 查询 ZIP 归档任务的进度。
 *
 * @param jobId       任务 ID（由 startDownloadArchive 返回）
 * @param abortOptions 可选中止信号
 * @returns 任务进度信息，包含状态、已处理文件数、当前处理项等
 * @throws 请求失败或未登录时抛出错误
 */
export async function getArchivePreparationProgress(
  jobId: string,
  abortOptions?: IAbortRequestOptions,
): Promise<IJobProgress> {
  const response = await sendAuthorizedRequest(
    `/api/downloadArchive/progress/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    return (await response.json()) as IJobProgress;
  }
  throw buildArchiveRequestError(
    "archivePreparationProgressFailed",
    "getArchivePreparationProgress",
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
    `/api/downloadArchive/manifest/${encodeURIComponent(jobId)}`,
    { method: "GET" },
    abortOptions?.requestAbortSignal,
  );

  if (response.ok) {
    return (await response.json()) as IArchiveManifest;
  }
  throw buildArchiveRequestError(
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
 * @throws 用户取消时抛出 ArchiveSaveTargetSelectionCancelledError
 */
export async function selectArchiveSaveTarget(
  filename: string,
): Promise<IArchiveSaveTarget> {
  const canWriteDirectly =
    typeof window !== "undefined" &&
    typeof (window as IShowSaveFilePickerWindow).showSaveFilePicker ===
      "function";

  if (!canWriteDirectly) {
    return { filename, writable: null };
  }

  const pickerWindow = window as IShowSaveFilePickerWindow;
  const savePicker = pickerWindow.showSaveFilePicker;
  if (!savePicker) {
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
  } catch (error: any) {
    // 用户取消保存对话框时，不应继续后续下载流程
    if (error?.name === "AbortError") {
      throw new ArchiveSaveTargetSelectionCancelledError();
    }
    throw error;
  }
}
