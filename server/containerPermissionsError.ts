export type ContainerPermissionsErrorCode =
  | "invalidRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "throttled"
  | "serviceUnavailable"
  | "graphFailure";

/**
 * 容器权限后端对前端暴露的稳定错误对象。
 */
export interface IContainerPermissionsApiErrorBody {
  code: ContainerPermissionsErrorCode;
  message: string;
  retryAfterSeconds?: number;
  requestId?: string;
  statusCode?: number;
}

/**
 * Graph 权限请求失败后，在服务端内部使用的错误类型。
 */
export class ContainerPermissionsGraphError extends Error {
  readonly code: ContainerPermissionsErrorCode;

  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  readonly statusCode?: number;

  constructor(
    code: ContainerPermissionsErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(message);
    this.name = "ContainerPermissionsGraphError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
    this.statusCode = options?.statusCode;
  }
}

/**
 * 把 Graph SDK 抛出的未知错误映射成面向权限 API 的稳定错误类型。
 *
 * 这里不手写通用 retry loop。
 * SDK 自带 RetryHandler 会先处理基础 429/503/504，
 * 这个函数只负责“SDK 重试之后仍然失败”的最终错误映射。
 */
export const mapContainerPermissionsGraphError = (
  error: unknown,
): ContainerPermissionsGraphError => {
  if (error instanceof ContainerPermissionsGraphError) {
    return error;
  }

  const statusCode = readGraphStatusCode(error);
  const retryAfterSeconds = readRetryAfterSeconds(error);
  const requestId = readRequestId(error);
  const message = readGraphErrorMessage(error);

  if (statusCode === 400) {
    return new ContainerPermissionsGraphError(
      "invalidRequest",
      `Container permission request is invalid: ${message}`,
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 401) {
    return new ContainerPermissionsGraphError(
      "unauthorized",
      "Container permission authentication expired. Please sign in again.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 403) {
    return new ContainerPermissionsGraphError(
      "forbidden",
      "The current account does not have permission to manage this container.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 404) {
    return new ContainerPermissionsGraphError(
      "notFound",
      "The target container or permission record was not found.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 429) {
    return new ContainerPermissionsGraphError(
      "throttled",
      "Microsoft Graph throttled the container permission request after SDK retries were exhausted.",
      {
        statusCode,
        retryAfterSeconds,
        requestId,
      },
    );
  }

  if (statusCode === 503 || statusCode === 504) {
    return new ContainerPermissionsGraphError(
      "serviceUnavailable",
      `Container permission request still failed after SDK retries: ${message}`,
      {
        statusCode,
        retryAfterSeconds,
        requestId,
      },
    );
  }

  return new ContainerPermissionsGraphError(
    "graphFailure",
    `Microsoft Graph container permission request failed: ${message}`,
    {
      statusCode,
      retryAfterSeconds,
      requestId,
    },
  );
};

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 */
export const toContainerPermissionsApiErrorBody = (
  error: ContainerPermissionsGraphError,
): IContainerPermissionsApiErrorBody => ({
  code: error.code,
  message: error.message,
  retryAfterSeconds: error.retryAfterSeconds,
  requestId: error.requestId,
  statusCode: error.statusCode,
});

/**
 * 根据业务错误类型选择合适的 HTTP 状态码。
 */
export const getContainerPermissionsErrorStatus = (
  error: ContainerPermissionsGraphError,
): number => {
  if (error.statusCode) {
    return error.statusCode;
  }

  switch (error.code) {
    case "invalidRequest":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "notFound":
      return 404;
    case "throttled":
      return 429;
    case "serviceUnavailable":
      return 503;
    default:
      return 500;
  }
};

/**
 * 从 Graph 错误对象中读取 HTTP 状态码。
 */
const readGraphStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const statusCode = record.statusCode ?? record.status;

  return typeof statusCode === "number" ? statusCode : undefined;
};

/**
 * 尽量从错误对象里提取 Retry-After 秒数。
 */
const readRetryAfterSeconds = (error: unknown): number | undefined => {
  const headerValue =
    readHeaderValue(error, "Retry-After") ?? readHeaderValue(error, "retry-after");

  if (headerValue) {
    const retryAfterSeconds = Number(headerValue);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds;
    }
  }

  const innerError = readInnerError(error);
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

/**
 * 提取请求 id，方便前端或日志继续追踪 Graph 侧请求。
 */
const readRequestId = (error: unknown): string | undefined => {
  const headerRequestId =
    readHeaderValue(error, "request-id") ??
    readHeaderValue(error, "Request-Id") ??
    readHeaderValue(error, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const innerError = readInnerError(error);
  const requestId =
    innerError["request-id"] ??
    innerError.requestId ??
    innerError["client-request-id"];

  return typeof requestId === "string" && requestId ? requestId : undefined;
};

/**
 * 尽量保留 Graph/SDK 自带的错误细节，便于排查。
 */
const readGraphErrorMessage = (error: unknown): string => {
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
  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};

/**
 * 读取错误对象中常见的 response headers 容器。
 */
const readHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  const record = readRecord(error);
  const headersCandidate =
    record.headers ??
    record.responseHeaders ??
    readRecord(record.response).headers ??
    readRecord(record.body).headers;

  if (!headersCandidate) {
    return undefined;
  }

  if (
    typeof headersCandidate === "object" &&
    headersCandidate !== null &&
    "get" in headersCandidate &&
    typeof headersCandidate.get === "function"
  ) {
    const value = headersCandidate.get(headerName);
    return typeof value === "string" && value ? value : undefined;
  }

  const headersRecord = readRecord(headersCandidate);

  for (const [key, value] of Object.entries(headersRecord)) {
    if (key.toLowerCase() === headerName.toLowerCase()) {
      return typeof value === "string" && value ? value : undefined;
    }
  }

  return undefined;
};

/**
 * Graph 错误常把 request id、retry 等信息放在 innerError 里。
 */
const readInnerError = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const bodyRecord = readRecord(record.body);
  const errorRecord = readRecord(record.error);

  return readRecord(bodyRecord.innerError ?? errorRecord.innerError);
};

const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};
