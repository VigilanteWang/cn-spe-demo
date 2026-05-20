import type { Request, Response } from "restify";
import type {
  ApiErrorCode,
  IApiErrorResponseBody,
} from "../../common/contracts/apiErrorContracts";
import {
  BackendAuthError,
  BackendError,
  BackendInternalError,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
} from "./errors";

// 这里维护“HTTP 状态码 -> 前端稳定错误码”的映射，
// 让上游错误即使来源不同，也能在 API 层收口成统一语义。
const statusToCodeMap: Record<number, ApiErrorCode> = {
  400: "invalidRequest",
  401: "unauthorized",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  429: "throttled",
  503: "serviceUnavailable",
  504: "serviceUnavailable",
};

// 当上游错误对象里没有可直接复用的 message 时，
// 这里提供各类状态码对应的默认对外文案。
const statusToDefaultMessageMap: Record<number, string> = {
  400: "The request payload is invalid.",
  401: "Authentication is required for this request.",
  403: "The current account is not allowed to perform this action.",
  404: "The requested resource was not found.",
  409: "The requested operation is not available in the current state.",
  429: "The request was throttled. Please retry later.",
  503: "The upstream service is temporarily unavailable.",
  504: "The upstream service did not respond in time.",
};

/**
 * 从未知错误对象里尽量提取 message。
 *
 * @param error 原始错误对象。
 * @param defaultMessage 提取失败时的兜底文案。
 * @returns 可用于 API 响应的错误文案。
 */
const readFallbackMessage = (
  error: unknown,
  defaultMessage: string,
): string => {
  // 优先复用原生 Error.message，避免丢失更具体的上游信息。
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // 有些错误不是 Error 实例，而是普通对象，这里兼容读取它们的 message 字段。
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
  }

  // 最后兜底为调用方预设的稳定文案。
  return defaultMessage;
};

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 *
 * @param error 统一后的后端错误对象。
 * @returns 可直接返回给前端的错误响应体。
 */
export const toApiErrorResponseBody = (
  error: BackendError,
): IApiErrorResponseBody => ({
  code: error.code,
  message: error.message,
  // 某些内部错误未显式指定状态码时，统一回退为 500。
  statusCode: error.statusCode ?? 500,
  details: error.details,
  requestId: error.requestId,
  retryAfterSeconds: error.retryAfterSeconds,
});

/**
 * 把任意未知异常收口成统一的后端错误类型。
 *
 * @param error 原始异常。
 * @returns 统一后的后端错误。
 */
export const normalizeError = (error: unknown): BackendError => {
  // 如果业务层已经主动构造过 BackendError，这里直接复用，不再二次包装。
  if (error instanceof BackendError) {
    return error;
  }

  // 先尽量从未知异常里提取 Graph 或 HTTP 风格的元数据，
  // 这样后面即使做统一包装，也还能保留状态码、请求 ID 和重试信息。
  const statusCode = readErrorStatusCode(error);
  const requestId = readErrorRequestId(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);

  // 只有识别出已知状态码时，才按映射规则进一步归类成 auth / validation / graph / business。
  if (statusCode && statusToCodeMap[statusCode]) {
    const normalizedCode = statusToCodeMap[statusCode];
    const message = readFallbackMessage(
      error,
      statusToDefaultMessageMap[statusCode],
    );

    // 401 和 403 走专门的鉴权错误类型，便于上层明确区分“未认证”和“无权限”。
    if (normalizedCode === "unauthorized" || normalizedCode === "forbidden") {
      return new BackendAuthError(normalizedCode, message, {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      });
    }

    return new BackendError({
      name: "NormalizedBackendError",
      code: normalizedCode,
      // 这里按稳定错误码继续推导大类，避免每个调用点重复写同样的分类逻辑。
      category:
        normalizedCode === "invalidRequest"
          ? "validation"
          : normalizedCode === "throttled" ||
              normalizedCode === "serviceUnavailable"
            ? "graph"
            : "business",
      message,
      statusCode,
      requestId,
      retryAfterSeconds,
      cause: error,
    });
  }

  // 无法识别明确语义的错误时，统一按 500 内部错误处理，
  // 这样既能保护内部实现细节，也能保证前端总能收到稳定结构。
  return new BackendInternalError("An unexpected server error occurred.", {
    cause: error,
    requestId,
    retryAfterSeconds,
  });
};

/**
 * 统一发送 API 错误响应。
 *
 * @param res Restify 响应对象。
 * @param error 原始异常对象。
 */
export const sendApiError = (res: Response, error: unknown): void => {
  // 先把任意异常收口成统一错误模型，再转成最终响应体。
  const normalizedError = normalizeError(error);
  const responseBody = toApiErrorResponseBody(normalizedError);
  res.send(responseBody.statusCode, responseBody);
};

/**
 * 为 async 路由处理函数套上统一错误响应能力。
 *
 * @param handler 原始路由处理函数。
 * @returns 自动捕获异常并回写 API 错误的处理函数。
 */
export const withErrorHandling = (
  handler: (req: Request, res: Response) => Promise<void>,
) => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error: unknown) {
      // 路由层不直接关心错误细节，统一交给错误响应层处理。
      sendApiError(res, error);
    }
  };
};
