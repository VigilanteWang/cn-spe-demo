import type { Request, Response } from "restify";
import type {
  ApiErrorCode,
  IApiErrorResponseBody,
} from "../../common/contracts/apiErrorContracts";
import {
  BackendAuthError,
  BackendBusinessError,
  BackendInternalError,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
} from "./errors";

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

const readFallbackMessage = (
  error: unknown,
  defaultMessage: string,
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
  }

  return defaultMessage;
};

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 */
export const toApiErrorResponseBody = (
  error: BackendBusinessError,
): IApiErrorResponseBody => ({
  code: error.code,
  message: error.message,
  statusCode: error.statusCode ?? 500,
  details: error.details,
  requestId: error.requestId,
  retryAfterSeconds: error.retryAfterSeconds,
});

/**
 * 把任意未知异常收口为统一的服务端业务错误。
 */
export const normalizeError = (error: unknown): BackendBusinessError => {
  if (error instanceof BackendBusinessError) {
    return error;
  }

  const statusCode = readErrorStatusCode(error);
  const requestId = readErrorRequestId(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);

  if (statusCode && statusToCodeMap[statusCode]) {
    const normalizedCode = statusToCodeMap[statusCode];
    const message = readFallbackMessage(
      error,
      statusToDefaultMessageMap[statusCode],
    );

    if (normalizedCode === "unauthorized" || normalizedCode === "forbidden") {
      return new BackendAuthError(normalizedCode, message, {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      });
    }

    return new BackendBusinessError({
      name: "NormalizedBackendBusinessError",
      code: normalizedCode,
      category:
        normalizedCode === "invalidRequest"
          ? "validation"
          : normalizedCode === "throttled" ||
              normalizedCode === "serviceUnavailable"
            ? "upstream"
            : "business",
      message,
      statusCode,
      requestId,
      retryAfterSeconds,
      cause: error,
    });
  }

  return new BackendInternalError("An unexpected server error occurred.", {
    cause: error,
    requestId,
    retryAfterSeconds,
  });
};

/**
 * 统一发送错误响应。
 */
export const sendApiError = (res: Response, error: unknown): void => {
  const normalizedError = normalizeError(error);
  const responseBody = toApiErrorResponseBody(normalizedError);
  res.send(responseBody.statusCode, responseBody);
};

/**
 * 把 async 路由统一包成“自动错误响应”的形式。
 */
export const withErrorHandling = (
  handler: (req: Request, res: Response) => Promise<void>,
) => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error: unknown) {
      sendApiError(res, error);
    }
  };
};
