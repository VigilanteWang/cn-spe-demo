import type { ApiErrorCode } from "../../common/contracts/apiErrorContracts";

export type BackendErrorCategory =
  | "auth"
  | "validation"
  | "config"
  | "graph"
  | "business"
  | "internal";

export interface IBackendErrorOptions {
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
}

interface IBackendErrorInit<TCode extends string> extends IBackendErrorOptions {
  name: string;
  code: TCode;
  category: BackendErrorCategory;
  message: string;
}

/**
 * 服务端业务错误基类。
 *
 * 各模块可以继续派生自己的稳定错误类型，
 * 让 HTTP 层根据 code/category/statusCode 统一构造响应。
 */
export class BackendError<TCode extends string = ApiErrorCode> extends Error {
  readonly code: TCode;

  readonly category: BackendErrorCategory;

  readonly statusCode?: number;

  readonly details?: Record<string, unknown>;

  readonly cause?: unknown;

  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  constructor(init: IBackendErrorInit<TCode>) {
    super(init.message);
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.statusCode = init.statusCode;
    this.details = init.details;
    this.cause = init.cause;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/**
 * 统一的鉴权失败错误。
 */
export class BackendAuthError extends BackendError<
  "unauthorized" | "forbidden"
> {
  constructor(
    code: "unauthorized" | "forbidden",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendAuthError",
      category: "auth",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的输入校验失败错误。
 */
export class BackendValidationError extends BackendError<"invalidRequest"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendValidationError",
      category: "validation",
      code: "invalidRequest",
      message,
      statusCode: options?.statusCode ?? 400,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的配置错误。
 */
export class BackendConfigError extends BackendError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendConfigError",
      category: "config",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的 Graph 请求错误。
 */
export class BackendGraphError extends BackendError<
  "throttled" | "serviceUnavailable" | "graphFailure"
> {
  constructor(
    code: "throttled" | "serviceUnavailable" | "graphFailure",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendGraphError",
      category: "graph",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的内部错误。
 */
export class BackendInternalError extends BackendError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendInternalError",
      category: "internal",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const readHeaderValue = (
  headersCandidate: unknown,
  headerName: string,
): string | undefined => {
  const headersRecord = readRecord(headersCandidate);
  const directValue = headersRecord[headerName];

  if (typeof directValue === "string" && directValue) {
    return directValue;
  }

  const getCandidate = headersRecord.get;
  if (typeof getCandidate === "function") {
    const value = getCandidate.call(headersCandidate, headerName);
    return typeof value === "string" && value ? value : undefined;
  }

  return undefined;
};

/**
 * 提取 Graph 错误对象里可能承载响应头的容器。
 *
 * 不同来源的错误对象结构不完全一致，所以这里按常见位置依次兜底。
 */
const readErrorHeadersCandidate = (error: unknown): unknown => {
  const record = readRecord(error);
  return (
    record.headers ??
    record.responseHeaders ??
    readRecord(record.response).headers ??
    readRecord(record.body).headers
  );
};

/**
 * 提取 Graph 错误对象里的 innerError。
 *
 * Graph SDK 有时会把 innerError 放在 body.error.innerError，
 * 也有时直接挂在 error.innerError 上，这里统一收口。
 */
const readErrorInnerError = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const bodyInnerError = readRecord(readRecord(record.body).innerError);
  const errorInnerError = readRecord(readRecord(record.error).innerError);

  return Object.keys(bodyInnerError).length > 0
    ? bodyInnerError
    : errorInnerError;
};

/**
 * 读取 Graph 错误上的 HTTP 状态码。
 */
export const readErrorStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const statusCode = record.statusCode ?? record.status;
  return typeof statusCode === "number" ? statusCode : undefined;
};

/**
 * 读取 Graph 错误上的 request id。
 */
export const readErrorRequestId = (error: unknown): string | undefined => {
  const headersCandidate = readErrorHeadersCandidate(error);

  const headerRequestId =
    readHeaderValue(headersCandidate, "request-id") ??
    readHeaderValue(headersCandidate, "Request-Id") ??
    readHeaderValue(headersCandidate, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const innerError = readErrorInnerError(error);
  const requestId =
    innerError["request-id"] ??
    innerError.requestId ??
    innerError["client-request-id"];

  return typeof requestId === "string" && requestId ? requestId : undefined;
};

/**
 * 读取 Graph 错误上的 Retry-After 秒数。
 */
export const readErrorRetryAfterSeconds = (
  error: unknown,
): number | undefined => {
  const headersCandidate = readErrorHeadersCandidate(error);

  const headerValue =
    readHeaderValue(headersCandidate, "Retry-After") ??
    readHeaderValue(headersCandidate, "retry-after");

  if (headerValue) {
    const retryAfterSeconds = Number(headerValue);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds;
    }
  }

  const innerError = readErrorInnerError(error);
  const retryAfter =
    innerError.retryAfter ??
    innerError.retryAfterSeconds ??
    innerError["retry-after"];

  if (typeof retryAfter === "number") {
    return retryAfter;
  }

  if (typeof retryAfter === "string" && retryAfter) {
    const retryAfterSeconds = Number.parseInt(retryAfter, 10);
    return Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds;
  }

  return undefined;
};

const readErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = readRecord(error);
  const nestedError = readRecord(record.error);
  const nestedMessage = nestedError.message;
  if (typeof nestedMessage === "string" && nestedMessage) {
    return nestedMessage;
  }

  const message = record.message;
  return typeof message === "string" && message ? message : fallbackMessage;
};

/**
 * 把未知 Graph 异常收口为统一的 Graph 错误。
 */
export const toBackendGraphError = (
  error: unknown,
  options?: {
    defaultMessage?: string;
    throttledMessage?: string;
    serviceUnavailableMessage?: string;
    graphFailureMessage?: string;
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
  const fallbackMessage =
    options?.defaultMessage ??
    "The Microsoft Graph request failed after the retry policy completed.";
  const message = readErrorMessage(error, fallbackMessage);

  if (statusCode === 429) {
    return new BackendGraphError(
      "throttled",
      options?.throttledMessage ??
        "Microsoft Graph throttled this request after retries were exhausted.",
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  if (statusCode === 503 || statusCode === 504) {
    return new BackendGraphError(
      "serviceUnavailable",
      options?.serviceUnavailableMessage ??
        `Microsoft Graph is temporarily unavailable: ${message}`,
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  return new BackendGraphError(
    "graphFailure",
    options?.graphFailureMessage ?? message,
    {
      statusCode: statusCode ?? 502,
      requestId,
      retryAfterSeconds,
      cause: error,
    },
  );
};
