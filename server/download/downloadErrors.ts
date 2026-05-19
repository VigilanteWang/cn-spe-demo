import {
  BackendError,
  BackendInternalError,
  BackendGraphError,
  BackendValidationError,
  toBackendGraphError,
} from "../common/errors";

/**
 * 读取适合写入任务状态的稳定错误文案。
 *
 * @param error 原始异常对象。
 * @param fallbackMessage 无法提取 message 时的兜底文案。
 * @returns 适合写入 `job.errors` 的稳定文案。
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
 * 统一构造下载模块的 Graph 错误。
 *
 * @param error 原始 Graph 异常。
 * @param defaultMessage 面向调用方的默认错误文案。
 * @returns 统一的 Graph 错误对象。
 */
export const toDownloadGraphError = (
  error: unknown,
  defaultMessage: string,
): BackendGraphError =>
  toBackendGraphError(error, {
    defaultMessage,
    throttledMessage:
      "Microsoft Graph throttled the download preparation request after retries were exhausted.",
    serviceUnavailableMessage:
      "Microsoft Graph is temporarily unavailable for the download preparation request.",
    graphFailureMessage: defaultMessage,
  });

/**
 * 统一构造任务不存在错误。
 *
 * @returns 对应 404 的业务错误。
 */
export const createArchiveJobNotFoundError = (): BackendError =>
  new BackendError({
    name: "ArchiveJobNotFoundError",
    code: "notFound",
    category: "business",
    message: "Job not found, expired, or access denied.",
    statusCode: 404,
  });

/**
 * 统一构造清单尚未就绪错误。
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
    message: `Archive manifest not ready yet. Status: ${status}`,
    statusCode: 409,
  });

/**
 * 统一构造清单缺失错误。
 *
 * @returns 对应 404 的业务错误。
 */
export const createArchiveManifestNotFoundError = (): BackendError =>
  new BackendError({
    name: "ArchiveManifestNotFoundError",
    code: "notFound",
    category: "business",
    message: "Archive manifest not found.",
    statusCode: 404,
  });

/**
 * 统一构造下载参数校验错误。
 *
 * @param containerId 当前容器 ID。
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
 * 统一构造“无可下载文件”错误。
 *
 * @returns 对应 409 的业务错误。
 */
export const createArchiveEmptyError = (): BackendError =>
  new BackendError({
    name: "ArchiveEmptyError",
    code: "conflict",
    category: "business",
    message: "No files found to archive.",
    statusCode: 409,
  });

/**
 * 统一构造文件数量超限错误。
 *
 * @param totalFiles 实际文件数。
 * @param maxFiles 系统允许的最大文件数。
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
    message: `Too many files (${totalFiles}). Maximum is ${maxFiles}.`,
    statusCode: 409,
    details: { totalFiles, maxFiles },
  });

/**
 * 统一构造体积超限错误。
 *
 * @param maxBytes 系统允许的最大总字节数。
 * @returns 对应 409 的业务错误。
 */
export const createArchiveTooLargeError = (maxBytes: number): BackendError =>
  new BackendError({
    name: "ArchiveTooLargeError",
    code: "conflict",
    category: "business",
    message: `Archive would exceed the ${maxBytes / 1024 / 1024} MB size limit.`,
    statusCode: 409,
    details: { maxBytes },
  });
