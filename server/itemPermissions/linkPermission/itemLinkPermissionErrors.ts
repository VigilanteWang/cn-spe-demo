import { AppError, ensureErrorCause } from "../../../common/appError";

type ItemLinkPermissionErrorCode =
  | "itemLinkPermissionUnsupportedTarget"
  | "itemLinkPermissionScopeNotAllowed"
  | "itemLinkPermissionTypeNotAllowed"
  | "itemLinkPermissionGrantRoleMismatch"
  | "itemLinkPermissionGrantFailed"
  | "itemLinkPermissionRevokeFailed"
  | "itemLinkPermissionDeleteFailed"
  | "itemLinkPermissionReadFailed"
  | "itemLinkPermissionCreateFailed"
  | "itemLinkPermissionRecipientNotFound"
  | "itemLinkPermissionBetaRevokeUnavailable";

/**
 * 创建 link permission 模块专用的稳定错误。
 */
export const createItemLinkPermissionError = (
  code: ItemLinkPermissionErrorCode,
  message: string,
  options?: {
    statusCode?: number;
    cause?: unknown;
  },
): AppError => {
  const inheritedOrigin =
    options?.cause instanceof AppError ? options.cause.originError : undefined;

  return new AppError({
    name: "ItemLinkPermissionError",
    code,
    message,
    statusCode:
      options?.statusCode ??
      (options?.cause instanceof AppError
        ? options.cause.statusCode
        : undefined) ??
      500,
    originError: {
      source: inheritedOrigin?.source ?? "app",
      codePath: inheritedOrigin?.codePath,
      retryAfter: inheritedOrigin?.retryAfter,
      cause:
        options?.cause === undefined
          ? undefined
          : ensureErrorCause(options.cause, message, "ItemLinkPermissionError"),
    },
  });
};
