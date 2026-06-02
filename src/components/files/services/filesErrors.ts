import { AppError, readErrorMessage } from "../../../common/errors.ts";

/**
 * 统一描述 files 模块里一次失败操作的标准化错误选项。
 */
interface INormalizeFilesOperationErrorOptions {
  /** 稳定错误码。 */
  code: string;
  /** 原始错误不可读时使用的兜底文案。 */
  fallbackMessage: string;
  /** 自定义错误名称，便于日志排查。 */
  name?: string;
  /** 需要透传到错误对象里的附加上下文。 */
  context?: Record<string, unknown>;
}

/**
 * 统一描述一次文件上传失败条目。
 */
interface IUploadFailureEntry {
  /** 失败文件的相对路径。 */
  relativePath: string;
  /** 该文件对应的标准化错误对象。 */
  error: AppError;
}

/**
 * 将 files 模块里的未知错误归一化为稳定前端错误对象。
 *
 * 如果上游已经抛出了标准化业务错误，则直接复用；
 * 否则包装成 `AppError`，避免页面层继续依赖裸字符串。
 *
 * @param error 原始未知错误。
 * @param options 当前操作的错误码、兜底文案和附加上下文。
 * @returns 可被 UI 稳定消费的错误对象。
 */
export const normalizeFilesOperationError = (
  error: unknown,
  options: INormalizeFilesOperationErrorOptions,
): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    name: options.name ?? "FilesOperationError",
    code: options.code,
    message: readErrorMessage(error, options.fallbackMessage),
    originError: {
      source: "app",
    },
    cause: options.context ? { error, context: options.context } : error,
  });
};

/**
 * 将多文件上传中的失败条目汇总为页面层可消费的统一错误对象。
 *
 * 单文件失败时复用原始标准化错误，避免丢失更具体的错误语义；
 * 多文件失败时生成批量失败摘要，让进度区能稳定展示聚合后的错误信息。
 *
 * @param failedUploads 本轮上传中收集到的失败条目。
 * @returns 聚合后的上传错误；若没有失败则返回 null。
 */
export const buildUploadFailureSummaryError = (
  failedUploads: IUploadFailureEntry[],
): AppError | null => {
  if (failedUploads.length === 0) {
    return null;
  }

  if (failedUploads.length === 1) {
    return failedUploads[0].error;
  }

  const latestFailure = failedUploads[failedUploads.length - 1];

  return new AppError({
    name: "FilesUploadError",
    code: "uploadBatchPartiallyFailed",
    message: `${failedUploads.length} files failed to upload. Latest failure: ${latestFailure.error.message}`,
    originError: {
      source: "app",
    },
    cause: {
      failedUploads: failedUploads.map(
        ({ relativePath, error: uploadError }) => ({
          relativePath,
          code: uploadError.code,
          message: uploadError.message,
        }),
      ),
    },
  });
};

/**
 * 将批量删除里未成功删除的项目汇总为对话框可消费的统一错误对象。
 *
 * @param failedItems 后端返回的失败项列表。
 * @returns 包含失败摘要和原始失败细节的标准化错误对象。
 */
export const buildDeletePartialFailureError = (
  failedItems: Array<{ id: string; reason: string }>,
): AppError => {
  const readableReasons = failedItems
    .map((item) => item.reason.trim())
    .filter((reason) => reason.length > 0);

  const message =
    readableReasons.length > 0
      ? readableReasons.join("; ")
      : "Some selected items could not be deleted.";

  return new AppError({
    name: "FilesDeleteError",
    code: "deleteItemsPartiallyFailed",
    message,
    originError: {
      source: "app",
    },
    cause: { failedItems },
  });
};
