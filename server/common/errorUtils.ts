import type {
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";
import {
  type BackendErrorCategory,
  type BackendErrorSource,
  BackendError,
  BackendGraphError,
} from "./errorDefinitions";

/**
 * 尝试把未知值读成普通对象。
 */
const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * 读取字符串值。
 */
const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取 Graph / Microsoft API Guidelines 风格的 `details` 子错误数组。
 */
export const readErrorDetails = (
  error: unknown,
): IErrorDetail[] | undefined => {
  const record = readRecord(error);
  const body = readRecord(record.body);
  const bodyError = readRecord(body.error);
  const directError = readRecord(record.error);
  const candidates = [
    bodyError.details,
    directError.details,
    body.details,
    record.details,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const details = candidate
      .map((item) => {
        const detail = readRecord(item);
        const message = readString(detail.message);

        if (!message) {
          return undefined;
        }

        const errorDetail: IErrorDetail = {
          message,
        };

        const code = readString(detail.code);
        if (code) {
          errorDetail.code = code;
        }

        const target = readString(detail.target);
        if (target) {
          errorDetail.target = target;
        }

        return errorDetail;
      })
      .filter((item): item is IErrorDetail => item !== undefined);

    if (details.length > 0) {
      return details;
    }
  }

  return undefined;
};

/**
 * 读取数字值，同时兼容数字字符串。
 */
const readNumberLike = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

/**
 * 收集错误对象上可能承载响应头的容器。
 *
 * 当前仓库使用的 Graph SDK 会把失败响应头挂到 `error.headers`，
 * 但测试桩或其他错误包装仍可能使用 `response.headers` 等形态。
 */
const readErrorHeaderCandidates = (error: unknown): unknown[] => {
  const record = readRecord(error);
  const responseRecord = readRecord(record.response);
  const bodyRecord = readRecord(record.body);

  return [
    record.headers,
    responseRecord.headers,
    record.responseHeaders,
    bodyRecord.headers,
  ].filter((candidate): candidate is unknown => candidate !== undefined);
};

/**
 * 按优先级从错误对象承载的 headers 候选里读取指定响应头。
 */
const readHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  for (const headersCandidate of readErrorHeaderCandidates(error)) {
    const headersRecord = readRecord(headersCandidate);
    const directValue = headersRecord[headerName];

    if (typeof directValue === "string" && directValue) {
      return directValue;
    }

    const getCandidate = headersRecord.get;
    if (typeof getCandidate === "function") {
      const value = getCandidate.call(headersCandidate, headerName);
      if (typeof value === "string" && value) {
        return value;
      }
    }
  }

  return undefined;
};

/**
 * 尽量收窄出 Graph 风格的错误对象。
 */
const readGraphErrorRecord = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const body = readRecord(record.body);
  const bodyError = readRecord(body.error);
  const directError = readRecord(record.error);

  if (Object.keys(bodyError).length > 0) {
    return bodyError;
  }

  if (Object.keys(directError).length > 0) {
    return directError;
  }

  return {};
};

/**
 * 提取 Graph 错误对象里的 `innerError / innererror`。
 */
const readErrorInnerError = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const body = readRecord(record.body);
  const bodyError = readRecord(body.error);
  const directError = readRecord(record.error);
  const candidates = [
    readRecord(bodyError.innerError),
    readRecord(bodyError.innererror),
    readRecord(body.innerError),
    readRecord(body.innererror),
    readRecord(directError.innerError),
    readRecord(directError.innererror),
  ];

  return (
    candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
  );
};

/**
 * 从未知错误对象中提取可用于调试的上游信息。
 */
export const readOriginError = (
  error: unknown,
  service?: string,
): IOriginErrorInfo | undefined => {
  const graphError = readGraphErrorRecord(error);
  const innerError = readErrorInnerError(error);
  const status =
    readErrorStatusCode(error) ?? readNumberLike(innerError.status);
  const code = readString(graphError.code);
  const innerErrorCode = readString(innerError.code);
  const innerErrorMessage = readString(innerError.message);

  if (
    !service &&
    !code &&
    !innerErrorCode &&
    !innerErrorMessage &&
    status === undefined
  ) {
    return undefined;
  }

  return {
    service,
    code,
    innerErrorCode,
    innerErrorMessage,
    status,
  };
};

/**
 * 读取错误对象上的 HTTP 状态码。
 */
export const readErrorStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const innerError = readErrorInnerError(error);

  return (
    readNumberLike(record.statusCode) ??
    readNumberLike(record.status) ??
    readNumberLike(readRecord(record.response).status) ??
    readNumberLike(innerError.status)
  );
};

/**
 * 读取错误对象上的请求 ID。
 */
export const readErrorRequestId = (error: unknown): string | undefined => {
  const headerRequestId =
    readHeaderValue(error, "request-id") ??
    readHeaderValue(error, "Request-Id") ??
    readHeaderValue(error, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const innerError = readErrorInnerError(error);
  return (
    readString(innerError["request-id"]) ??
    readString(innerError.requestId) ??
    readString(innerError["client-request-id"])
  );
};

/**
 * 读取错误对象上的 `Retry-After` 秒数。
 *
 * 统一只从响应头读取，不再从 body 或 innerError 兜底。
 */
export const readErrorRetryAfterSeconds = (
  error: unknown,
): number | undefined => {
  const headerValue =
    readHeaderValue(error, "Retry-After") ??
    readHeaderValue(error, "retry-after");

  return readNumberLike(headerValue);
};

/**
 * 尽量从未知错误中提取对调用方友好的 message。
 */
const readErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const graphError = readGraphErrorRecord(error);
  const graphMessage = readString(graphError.message);
  if (graphMessage) {
    return graphMessage;
  }

  const record = readRecord(error);
  const message = readString(record.message);
  return message ?? fallbackMessage;
};

/**
 * 识别 Node.js 风格错误来源。
 */
const isNodeStyleError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const record = readRecord(error);
  const code = readString(record.code);
  return Boolean(code && /^[A-Z_]+$/.test(code));
};

/**
 * 把未知 Graph 异常收口成统一的 `BackendGraphError`。
 */
export const toBackendGraphError = (
  error: unknown,
  options?: {
    failureMessage?: string;
    operationDescription?: string;
  },
): BackendGraphError => {
  if (error instanceof BackendGraphError) {
    return error;
  }

  if (error instanceof BackendError && error.category === "graph") {
    return error as BackendGraphError;
  }

  const statusCode = readErrorStatusCode(error);
  const requestId = readErrorRequestId(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const details = readErrorDetails(error);
  const originError = readOriginError(error, "microsoft-graph");
  const message = readErrorMessage(
    error,
    options?.failureMessage ??
      "The Microsoft Graph request failed after the retry policy completed.",
  );

  if (statusCode === 429) {
    return new BackendGraphError("throttled", message, {
      statusCode,
      requestId,
      retryAfterSeconds,
      details,
      cause: error,
      originError,
    });
  }

  if (statusCode === 503 || statusCode === 504) {
    return new BackendGraphError("serviceUnavailable", message, {
      statusCode,
      requestId,
      retryAfterSeconds,
      details,
      cause: error,
      originError,
    });
  }

  return new BackendGraphError("graphFailure", message, {
    statusCode: statusCode ?? 502,
    requestId,
    retryAfterSeconds,
    details,
    cause: error,
    originError,
  });
};

/**
 * 基于状态码为未知错误推导稳定错误类别。
 */
export const readCategoryFromStatusCode = (
  statusCode: number,
): BackendErrorCategory =>
  statusCode === 400
    ? "validation"
    : statusCode === 401 || statusCode === 403
      ? "auth"
      : statusCode === 429 || statusCode === 503 || statusCode === 504
        ? "graph"
        : "business";

/**
 * 基于上下文为未知错误推导稳定错误来源。
 */
export const readSourceFromUnknownError = (
  error: unknown,
  category: BackendErrorCategory,
): BackendErrorSource => {
  if (category === "graph") {
    return "graph";
  }

  if (isNodeStyleError(error)) {
    return "node";
  }

  if (error instanceof Error) {
    return "node";
  }

  return "unknown";
};
