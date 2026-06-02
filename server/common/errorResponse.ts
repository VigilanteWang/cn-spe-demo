import type { Request, Response } from "restify";
import {
  AppError,
  extractGraphOriginError,
  readErrorMessage,
  readErrorStatusCode,
  serializeAppError,
} from "../../common/appError";
import type { IErrorResponseBody } from "../../common/contracts/errorContracts";

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
 * 把统一错误对象转换成稳定的 API 响应体。
 *
 * @param error 统一后的错误对象。
 * @returns 可直接返回给前端的错误响应体。
 */
export const toApiErrorResponseBody = (
  error: AppError,
): IErrorResponseBody => ({
  error: serializeAppError(error),
});

/**
 * 把任意未知异常收口成统一错误类型。
 *
 * @param error 原始异常。
 * @returns 统一后的错误对象。
 */
export const normalizeError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  const statusCode = readErrorStatusCode(error) ?? 500;
  const errorRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;

  return new AppError({
    name:
      errorRecord && typeof errorRecord.name === "string"
        ? errorRecord.name
        : "AppError",
    code:
      errorRecord && typeof errorRecord.code === "string"
        ? errorRecord.code
        : undefined,
    message: readErrorMessage(
      error,
      statusToDefaultMessageMap[statusCode] ??
        "An unexpected server error occurred.",
    ),
    statusCode,
    originError: extractGraphOriginError(error),
    cause: error,
  });
};

/**
 * 统一发送 API 错误响应。
 *
 * @param res Restify 响应对象。
 * @param error 原始异常对象。
 */
export const sendApiError = (res: Response, error: unknown): void => {
  const normalizedError = normalizeError(error);
  const responseBody = toApiErrorResponseBody(normalizedError);

  if (normalizedError.originError?.retryAfter !== undefined) {
    res.header("Retry-After", String(normalizedError.originError.retryAfter));
  }

  res.send(normalizedError.statusCode ?? 500, responseBody);
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
      sendApiError(res, error);
    }
  };
};
