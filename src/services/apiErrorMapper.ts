import type {
  ErrorCategory,
  ErrorSource,
  IErrorDetail,
  IErrorResponseBody,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";

/**
 * service 层归一化后的后端 API 错误信息。
 *
 * 这个结果会被各个前端 service 继续包装成自己的稳定错误类型，
 * 让上层组件不需要重复解析后端响应体。
 */
export interface IApiErrorResponseSummary {
  code: string;
  message: string;
  statusCode: number;
  category: ErrorCategory;
  source: ErrorSource;
  details?: IErrorDetail[];
  context?: Record<string, unknown>;
  requestId?: string;
  originError?: IOriginErrorInfo;
  retryAfterSeconds?: number;
}

interface IReadApiErrorResponseOptions {
  fallbackCode: string;
  operationLabel: string;
}

/**
 * 判断任意 JSON 是否满足统一 API 错误响应体的最小结构。
 *
 * @param value 待校验的未知值。
 * @returns 如果值满足统一错误响应体的最小结构，则返回 `true`。
 */
const isApiErrorResponseBody = (
  value: unknown,
): value is IErrorResponseBody => {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const payload = value.error;
  return (
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    typeof payload.code === "string" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    "statusCode" in payload &&
    typeof payload.statusCode === "number" &&
    "category" in payload &&
    typeof payload.category === "string" &&
    "source" in payload &&
    typeof payload.source === "string"
  );
};

/**
 * 从失败响应头中读取 `Retry-After` 秒数。
 *
 * 统一只从 header 读取，避免在 body 中继续复制节流字段。
 */
const readRetryAfterSecondsFromHeaders = (
  headers: Headers,
): number | undefined => {
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
 *
 * 如果响应体不是 JSON，或者 JSON 不满足共享合同结构，则返回 `null`，
 * 交给调用方走统一兜底文案。
 *
 * @param response 失败的 Fetch 响应对象。
 * @returns 结构化错误响应体；无法解析时返回 `null`。
 */
export const tryReadApiErrorResponse = async (
  response: Response,
): Promise<IErrorResponseBody | null> => {
  try {
    // 先按 JSON 解析，便于复用后端已经标准化的错误字段。
    const payload = (await response.json()) as unknown;
    // 只有满足共享合同的内容才向上层透出。
    return isApiErrorResponseBody(payload) ? payload : null;
  } catch {
    // 非 JSON 或解析失败时，交给调用方统一使用兜底文案。
    return null;
  }
};

/**
 * 把失败响应转换成 service 层可复用的统一错误摘要。
 *
 * @param response 失败的 Fetch 响应对象。
 * @param options 读取错误摘要时使用的兜底配置。
 * @returns service 层可复用的统一错误摘要。
 */
export const readApiErrorResponseSummary = async (
  response: Response,
  options: IReadApiErrorResponseOptions,
): Promise<IApiErrorResponseSummary> => {
  const payload = await tryReadApiErrorResponse(response);
  const error = payload?.error;

  return {
    // 优先使用后端返回的结构化字段，失败时再使用本地兜底值。
    code: error?.code ?? options.fallbackCode,
    // 兜底文案保留操作名和状态码，便于排查请求失败原因。
    message:
      error?.message ?? `${options.operationLabel} failed: ${response.status}`,
    // 状态码以后端返回值为准，解析不到时使用 HTTP 响应状态。
    statusCode: error?.statusCode ?? response.status,
    category: error?.category ?? "business",
    source: error?.source ?? "backend",
    details: error?.details,
    context: error?.context,
    requestId: error?.requestId,
    originError: error?.originError,
    retryAfterSeconds: readRetryAfterSecondsFromHeaders(response.headers),
  };
};
