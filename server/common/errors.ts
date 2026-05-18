import type { ApiErrorCode } from "../../common/contracts/apiErrorContracts";

export type BackendErrorCategory =
  | "auth"
  | "validation"
  | "config"
  | "upstream"
  | "business"
  | "internal";

export interface IBackendBusinessErrorOptions {
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
}

interface IBackendBusinessErrorInit<TCode extends string>
  extends IBackendBusinessErrorOptions {
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
export class BackendBusinessError<TCode extends string = ApiErrorCode> extends Error {
  readonly code: TCode;

  readonly category: BackendErrorCategory;

  readonly statusCode?: number;

  readonly details?: Record<string, unknown>;

  readonly cause?: unknown;

  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  constructor(init: IBackendBusinessErrorInit<TCode>) {
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
export class BackendAuthError extends BackendBusinessError<
  "unauthorized" | "forbidden"
> {
  constructor(
    code: "unauthorized" | "forbidden",
    message: string,
    options?: IBackendBusinessErrorOptions & { name?: string },
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
export class BackendValidationError extends BackendBusinessError<"invalidRequest"> {
  constructor(
    message: string,
    options?: IBackendBusinessErrorOptions & { name?: string },
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
export class BackendConfigError extends BackendBusinessError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendBusinessErrorOptions & { name?: string },
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
 * 统一的下游服务错误。
 */
export class BackendUpstreamError extends BackendBusinessError<
  "upstreamFailure" | "throttled" | "serviceUnavailable" | "graphFailure"
> {
  constructor(
    code:
      | "upstreamFailure"
      | "throttled"
      | "serviceUnavailable"
      | "graphFailure",
    message: string,
    options?: IBackendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendUpstreamError",
      category: "upstream",
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
export class BackendInternalError extends BackendBusinessError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendBusinessErrorOptions & { name?: string },
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
 * 读取下游错误上的 HTTP 状态码。
 */
export const readErrorStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const statusCode = record.statusCode ?? record.status;
  return typeof statusCode === "number" ? statusCode : undefined;
};

/**
 * 读取下游错误上的 request id。
 */
export const readErrorRequestId = (error: unknown): string | undefined => {
  const record = readRecord(error);
  const headersCandidate =
    record.headers ??
    record.responseHeaders ??
    readRecord(record.response).headers ??
    readRecord(record.body).headers;

  const headerRequestId =
    readHeaderValue(headersCandidate, "request-id") ??
    readHeaderValue(headersCandidate, "Request-Id") ??
    readHeaderValue(headersCandidate, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const bodyInnerError = readRecord(readRecord(record.body).innerError);
  const errorInnerError = readRecord(readRecord(record.error).innerError);
  const innerError =
    Object.keys(bodyInnerError).length > 0 ? bodyInnerError : errorInnerError;
  const requestId =
    innerError["request-id"] ??
    innerError.requestId ??
    innerError["client-request-id"];

  return typeof requestId === "string" && requestId ? requestId : undefined;
};

/**
 * 读取下游错误上的 Retry-After 秒数。
 */
export const readErrorRetryAfterSeconds = (
  error: unknown,
): number | undefined => {
  const record = readRecord(error);
  const headersCandidate =
    record.headers ??
    record.responseHeaders ??
    readRecord(record.response).headers ??
    readRecord(record.body).headers;

  const headerValue =
    readHeaderValue(headersCandidate, "Retry-After") ??
    readHeaderValue(headersCandidate, "retry-after");

  if (headerValue) {
    const retryAfterSeconds = Number(headerValue);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds;
    }
  }

  const bodyInnerError = readRecord(readRecord(record.body).innerError);
  const errorInnerError = readRecord(readRecord(record.error).innerError);
  const innerError =
    Object.keys(bodyInnerError).length > 0 ? bodyInnerError : errorInnerError;
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
 * 把未知下游异常收口为统一的上游服务错误。
 */
export const toBackendUpstreamError = (
  error: unknown,
  options?: {
    defaultMessage?: string;
    throttledMessage?: string;
    serviceUnavailableMessage?: string;
    graphFailureMessage?: string;
  },
): BackendUpstreamError => {
  if (error instanceof BackendUpstreamError) {
    return error;
  }

  if (
    error instanceof BackendBusinessError &&
    error.category === "upstream"
  ) {
    return error as BackendUpstreamError;
  }

  const statusCode = readErrorStatusCode(error);
  const requestId = readErrorRequestId(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const fallbackMessage =
    options?.defaultMessage ??
    "The upstream service request failed after the retry policy completed.";
  const message = readErrorMessage(error, fallbackMessage);

  if (statusCode === 429) {
    return new BackendUpstreamError(
      "throttled",
      options?.throttledMessage ??
        "The upstream service throttled this request after retries were exhausted.",
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  if (statusCode === 503 || statusCode === 504) {
    return new BackendUpstreamError(
      "serviceUnavailable",
      options?.serviceUnavailableMessage ??
        `The upstream service is temporarily unavailable: ${message}`,
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  return new BackendUpstreamError(
    "upstreamFailure",
    options?.graphFailureMessage ?? message,
    {
      statusCode: statusCode ?? 502,
      requestId,
      retryAfterSeconds,
      cause: error,
    },
  );
};
