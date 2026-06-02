import {
  AppError,
  extractGraphOriginError,
  readErrorRequestId,
  readErrorRetryAfter,
  readErrorStatusCode,
} from "../../common/appError";
import type { IOriginErrorInfo } from "../../common/contracts/errorContracts";

/**
 * 从未知错误对象中提取 Graph 调试信息。
 *
 * 这里保留旧函数名，避免其他后端模块重复实现。
 */
export const readOriginError = (
  error: unknown,
  service?: string,
): IOriginErrorInfo | undefined => {
  const originError = extractGraphOriginError(error);

  if (originError) {
    return originError;
  }

  if (service) {
    return {
      source: service === "microsoft-graph" ? "microsoft-graph" : "app",
    };
  }

  return undefined;
};

/**
 * 兼容旧命名，继续暴露请求 ID 读取 helper。
 */
export { readErrorRequestId };

/**
 * 兼容旧命名，继续暴露状态码读取 helper。
 */
export { readErrorStatusCode };

/**
 * 兼容旧命名，继续暴露重试秒数读取 helper。
 */
export const readErrorRetryAfterSeconds = readErrorRetryAfter;

/**
 * 判断当前错误是否已经是后端统一错误。
 */
export const isBackendError = (error: unknown): error is AppError =>
  error instanceof AppError;
