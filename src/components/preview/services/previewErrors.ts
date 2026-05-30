import {
  FrontendApiError,
  FrontendValidationError,
} from "../../../common/errors.ts";

/**
 * 构造“缺少预览目标”的稳定校验错误。
 */
export const createMissingPreviewTargetError = () =>
  new FrontendValidationError(
    "missingPreviewTarget",
    "Unable to get drive or file information.",
  );

/**
 * 构造“当前文件无法预览”的稳定接口错误。
 */
export const createPreviewUnavailableError = () =>
  new FrontendApiError(
    "previewUnavailable",
    "Preview not available for this file.",
  );

/**
 * 构造“加载预览失败”的稳定接口错误。
 */
export const createPreviewLoadFailedError = () =>
  new FrontendApiError("previewLoadFailed", "Failed to load preview.");
