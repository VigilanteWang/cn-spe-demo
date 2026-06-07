import { AppError, deserializeAppError } from "../../common/appError";
import type {
  AppErrorShape,
  IErrorResponseBody,
} from "../../common/contracts/errorContracts";

interface IReadApiErrorResponseOptions {
  operationLabel: string;
}

/**
 * 判断任意 JSON 是否满足统一错误对象的最小结构。
 * @param value 待校验的未知值。
 * @returns 如果值满足统一错误对象的最小结构，则返回 `true`。
 */
const isAppErrorShape = (value: unknown): value is AppErrorShape => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "name" in value &&
    typeof value.name === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
};

/**
 * 判断任意 JSON 是否满足统一 API 错误响应体的最小结构。
 * @param value 待校验的未知值。
 * @returns 如果值满足统一错误响应体的最小结构，则返回 `true`。
 */
const isApiErrorResponseBody = (
  value: unknown,
): value is IErrorResponseBody => {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  return isAppErrorShape(value.error);
};

/**
 * 从失败响应头中读取 `Retry-After` 秒数。
 * 统一只从 header 读取，避免在 body 中继续复制节流字段。
 */
const readRetryAfterFromHeaders = (headers: Headers): number | undefined => {
  const retryAfter =
    headers.get("Retry-After") ?? headers.get("retry-after") ?? undefined;

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number.parseInt(retryAfter, 10);
  return Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds;
};

/**
 * 尝试读取后端返回的结构化错误响应体。
 * @param response 失败的 Fetch 响应对象。
 * @returns 结构化错误响应体；无法解析时返回 `null`。
 */
export const tryReadApiErrorResponse = async (
  response: Response,
): Promise<IErrorResponseBody | null> => {
  try {
    const payload = (await response.json()) as unknown;
    return isApiErrorResponseBody(payload) ? payload : null;
  } catch {
    return null;
  }
};

/**
 * 将失败响应转换成统一 `AppError`。
 * @param response 失败的 Fetch 响应对象。
 * @param options 读取错误时使用的兜底配置。
 * @returns 可直接向上抛出的统一错误实例。
 */
export const readApiErrorResponseSummary = async (
  response: Response,
  options: IReadApiErrorResponseOptions,
): Promise<AppError> => {
  const payload = await tryReadApiErrorResponse(response);
  const responseError = payload?.error;

  if (responseError) {
    const appError = deserializeAppError(responseError);
    const retryAfter = readRetryAfterFromHeaders(response.headers);

    if (retryAfter === undefined) {
      return appError;
    }

    return new AppError({
      name: appError.name,
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
      originError: {
        ...appError.originError,
        retryAfter,
      },
      details: appError.details,
    });
  }

  return new AppError({
    name: "AppError",
    message: `${options.operationLabel} failed: ${response.status}`,
    statusCode: response.status,
    originError: {
      source: response.status === 400 ? "validation" : "network",
      retryAfter: readRetryAfterFromHeaders(response.headers),
    },
  });
};
