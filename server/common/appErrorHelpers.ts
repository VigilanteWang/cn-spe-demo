import {
  AppError,
  extractGraphOriginError,
  toAppError,
} from "../../common/appError";

/**
 * 创建后端输入校验错误。
 *
 * 这类错误来自我们自己的请求边界，因此显式标记为 validation。
 */
export const createValidationError = (message: string): AppError =>
  new AppError({
    name: "ValidationError",
    code: "invalidRequest",
    message,
    statusCode: 400,
    originError: {
      source: "validation",
    },
  });

/**
 * 创建后端鉴权错误。
 *
 * 401/403 都属于我们在服务边界上的显式判断，因此这里保留明确 code。
 */
export const createAuthError = (
  code: "unauthorized" | "forbidden",
  message: string,
): AppError =>
  new AppError({
    name: "AuthError",
    code,
    message,
    statusCode: code === "forbidden" ? 403 : 401,
    originError: {
      source: "app",
    },
  });

/**
 * 创建后端内部错误。
 */
export const createInternalError = (
  message: string,
  options?: {
    statusCode?: number;
    cause?: unknown;
  },
): AppError =>
  new AppError({
    name: "InternalError",
    message,
    statusCode: options?.statusCode ?? 500,
    originError: {
      source: "app",
    },
    cause: options?.cause,
  });

/**
 * 将 Microsoft Graph 或其下游请求失败收口为统一 `AppError`。
 *
 * 这里不再按状态码推导仓库自定义 code，只保留原始错误自带的 code。
 */
export const toGraphAppError = (
  error: unknown,
  failureMessage: string,
  defaultStatusCode = 502,
): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  return toAppError(error, {
    defaultName: "GraphError",
    defaultMessage: failureMessage,
    defaultStatusCode,
    originError: extractGraphOriginError(error) ?? {
      source: "microsoft-graph",
    },
  });
};
