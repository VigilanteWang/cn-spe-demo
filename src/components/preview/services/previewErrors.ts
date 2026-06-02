import { AppError } from "../../../common/errors.ts";

/**
 * 构造“缺少预览目标”的稳定校验错误。
 */
export const createMissingPreviewTargetError = () =>
  new AppError({
    name: "PreviewValidationError",
    code: "missingPreviewTarget",
    message: "Unable to get drive or file information.",
    originError: {
      source: "validation",
    },
  });

/**
 * 构造“当前文件无法预览”的稳定接口错误。
 */
export const createPreviewUnavailableError = () =>
  new AppError({
    name: "PreviewError",
    code: "previewUnavailable",
    message: "Preview not available for this file.",
    originError: {
      source: "app",
    },
  });

/**
 * 构造“加载预览失败”的稳定接口错误。
 */
export const createPreviewLoadFailedError = () =>
  new AppError({
    name: "PreviewError",
    code: "previewLoadFailed",
    message: "Failed to load preview.",
    originError: {
      source: "app",
    },
  });
