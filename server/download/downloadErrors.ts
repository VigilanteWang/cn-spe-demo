import {
  BackendError,
  BackendGraphError,
  BackendInternalError,
  BackendValidationError,
} from "../common/errorDefinitions";
import { toBackendGraphError } from "../common/errorUtils";

/**
 * 提取适合写入任务状态的稳定错误文案。
 *
 * @param error 原始异常对象。
 * @param fallbackMessage 无法提取 message 时使用的兜底文案。
 * @returns 适合写入 `job.errors` 的错误文案。
 */
export const getDownloadJobFailureMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof BackendError || error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
};

/**
 * 统一构造下载模块里的 Graph 错误。
 *
 * @param error 原始 Graph 异常。
 * @param failureMessage 面向调用方的默认错误文案。
 * @returns 统一的 Graph 错误对象。
 */
export const toDownloadGraphError = (
  error: unknown,
  failureMessage: string,
): BackendGraphError =>
  toBackendGraphError(error, {
    failureMessage,
    operationDescription: "download preparation",
  });

/**
 * 构造“任务不存在或不可访问”错误。
 *
 * @returns 对应 404 的业务错误。
 */
export const createArchiveJobNotFoundError = (): BackendError =>
  new BackendError({
    name: "ArchiveJobNotFoundError",
    code: "notFound",
    category: "business",
    source: "backend",
    message: "Job not found, expired, or access denied.",
    statusCode: 404,
  });

/**
 * 构造“清单尚未准备完成”错误。
 *
 * @param status 当前任务状态。
 * @returns 对应 409 的业务错误。
 */
export const createArchiveManifestNotReadyError = (
  status: string,
): BackendError =>
  new BackendError({
    name: "ArchiveManifestNotReadyError",
    code: "conflict",
    category: "business",
    source: "backend",
    message: `Archive manifest not ready yet. Status: ${status}`,
    statusCode: 409,
  });

/**
 * 构造“清单缺失”错误。
 *
 * @returns 对应 404 的业务错误。
 */
export const createArchiveManifestNotFoundError = (): BackendError =>
  new BackendError({
    name: "ArchiveManifestNotFoundError",
    code: "notFound",
    category: "business",
    source: "backend",
    message: "Archive manifest not found.",
    statusCode: 404,
  });

/**
 * 校验创建下载任务所需的输入参数。
 *
 * @param containerId 容器 ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @param ownerOid 当前登录用户 oid。
 */
export const validateDownloadJobInput = (
  containerId: string,
  itemIds: string[],
  ownerOid: string,
): void => {
  if (!containerId || itemIds.length === 0) {
    throw new BackendValidationError(
      "containerId and a non-empty itemIds array are required.",
    );
  }

  if (!ownerOid) {
    throw new BackendInternalError(
      "The authenticated user oid is required to create a download job.",
    );
  }
};

/**
 * 构造“没有可归档文件”错误。
 *
 * @returns 对应 409 的业务错误。
 */
export const createArchiveEmptyError = (): BackendError =>
  new BackendError({
    name: "ArchiveEmptyError",
    code: "conflict",
    category: "business",
    source: "backend",
    message: "No files found to archive.",
    statusCode: 409,
  });

/**
 * 构造“文件数超限”错误。
 *
 * @param totalFiles 实际文件数。
 * @param maxFiles 允许的最大文件数。
 * @returns 对应 409 的业务错误。
 */
export const createArchiveTooManyFilesError = (
  totalFiles: number,
  maxFiles: number,
): BackendError =>
  new BackendError({
    name: "ArchiveTooManyFilesError",
    code: "conflict",
    category: "business",
    source: "backend",
    message: `Too many files (${totalFiles}). Maximum is ${maxFiles}.`,
    statusCode: 409,
    context: { totalFiles, maxFiles },
  });

/**
 * 构造“总大小超限”错误。
 *
 * @param maxBytes 允许的最大总字节数。
 * @returns 对应 409 的业务错误。
 */
export const createArchiveTooLargeError = (maxBytes: number): BackendError =>
  new BackendError({
    name: "ArchiveTooLargeError",
    code: "conflict",
    category: "business",
    source: "backend",
    message: `Archive would exceed the ${maxBytes / 1024 / 1024} MB size limit.`,
    statusCode: 409,
    context: { maxBytes },
  });
