import type {
  ErrorCategory,
  ErrorCode,
  ErrorSource,
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";

export type BackendErrorCategory = ErrorCategory;
export type BackendErrorSource = ErrorSource;

/**
 * 后端错误可选元数据。
 *
 * 这些字段会在不同错误子类之间复用，
 * 避免每个错误类都重复声明一遍。
 */
export interface IBackendErrorOptions {
  /** 对应的 HTTP 状态码。 */
  statusCode?: number;

  /** 想额外带给上层或前端的结构化信息。 */
  details?: IErrorDetail[];

  context?: Record<string, unknown>;

  /** 原始异常对象，便于调试和日志追踪。 */
  cause?: unknown;

  /** 上游服务返回的请求标识。 */
  requestId?: string;

  /** 上游建议的重试秒数，仅在响应头读取后写入。 */
  retryAfterSeconds?: number;

  /** 错误来源标识。 */
  source?: BackendErrorSource;

  /** 对上游错误做最小收敛后的调试信息。 */
  originError?: IOriginErrorInfo;
}

/**
 * 创建后端错误实例所需的完整初始化参数。
 */
interface IBackendErrorInit<TCode extends string> extends IBackendErrorOptions {
  name: string;
  code: TCode;
  category: BackendErrorCategory;
  source: BackendErrorSource;
  message: string;
}

/**
 * 服务端业务错误基类。
 *
 * 各模块都可以继续派生自己的稳定错误类型，
 * 让 HTTP 层根据 `code`、`category`、`source`、`statusCode`
 * 统一构造稳定的错误响应。
 */
export class BackendError<TCode extends string = ErrorCode> extends Error {
  readonly code: TCode;

  readonly category: BackendErrorCategory;

  readonly source: BackendErrorSource;

  readonly statusCode?: number;

  readonly details?: IErrorDetail[];

  readonly context?: Record<string, unknown>;

  readonly cause?: unknown;

  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  readonly originError?: IOriginErrorInfo;

  /**
   * 创建一个统一的后端错误对象。
   */
  constructor(init: IBackendErrorInit<TCode>) {
    super(init.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.source = init.source;
    this.statusCode = init.statusCode;
    this.details = init.details;
    this.context = init.context;
    this.cause = init.cause;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.originError = init.originError;
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
      source: options?.source ?? "backend",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
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
      source: options?.source ?? "backend",
      code: "invalidRequest",
      message,
      statusCode: options?.statusCode ?? 400,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
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
      source: options?.source ?? "backend",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
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
      source: options?.source ?? "graph",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
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
      source: options?.source ?? "backend",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}

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
 * 从 headers 候选对象里读取指定响应头。
 */
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
 * 提取错误对象里可能承载响应头的容器。
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
  const headersCandidate = readErrorHeadersCandidate(error);

  const headerRequestId =
    readHeaderValue(headersCandidate, "request-id") ??
    readHeaderValue(headersCandidate, "Request-Id") ??
    readHeaderValue(headersCandidate, "client-request-id");

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
  const headersCandidate = readErrorHeadersCandidate(error);
  const headerValue =
    readHeaderValue(headersCandidate, "Retry-After") ??
    readHeaderValue(headersCandidate, "retry-after");

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
