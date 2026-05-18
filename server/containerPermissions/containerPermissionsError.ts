import type {
  ContainerPermissionsApiErrorCode,
  IContainerPermissionsApiErrorBody,
} from "../../common/contracts/containerPermissionCommonContracts";
import { readGraphToRecord } from "./containerPermissionsReaders";

/**
 * Graph 权限请求失败后，在服务端内部使用的错误类型。
 */
export class ContainerPermissionsApiError extends Error {
  readonly code: ContainerPermissionsApiErrorCode;

  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  readonly statusCode?: number;

  constructor(
    code: ContainerPermissionsApiErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(message);
    this.name = "ContainerPermissionsApiError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
    this.statusCode = options?.statusCode;
  }
}

/**
 * 把 Graph SDK 抛出的未知错误映射成权限 API 自己的稳定错误类型。
 */
export const mapContainerPermissionsGraphError = (
  error: unknown,
): ContainerPermissionsApiError => {
  if (error instanceof ContainerPermissionsApiError) {
    return error;
  }

  const statusCode = readGraphStatusCode(error);
  const retryAfterSeconds = readRetryAfterSeconds(error);
  const requestId = readRequestId(error);
  const message = readGraphErrorMessage(error);

  if (statusCode === 400) {
    return new ContainerPermissionsApiError(
      "invalidRequest",
      `Container permission request is invalid: ${message}`,
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 401) {
    return new ContainerPermissionsApiError(
      "unauthorized",
      "Container permission authentication expired. Please sign in again.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 403) {
    return new ContainerPermissionsApiError(
      "forbidden",
      "The current account does not have permission to manage this container.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 404) {
    return new ContainerPermissionsApiError(
      "notFound",
      "The target container or permission record was not found.",
      {
        statusCode,
        requestId,
      },
    );
  }

  if (statusCode === 429) {
    return new ContainerPermissionsApiError(
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
    return new ContainerPermissionsApiError(
      "serviceUnavailable",
      `Container permission request still failed after SDK retries: ${message}`,
      {
        statusCode,
        retryAfterSeconds,
        requestId,
      },
    );
  }

  return new ContainerPermissionsApiError(
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
export const toContainerPermissionsApiErrorResponseBody = (
  error: ContainerPermissionsApiError,
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
export const getContainerPermissionsApiErrorResponseStatus = (
  error: ContainerPermissionsApiError,
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

const readGraphStatusCode = (error: unknown): number | undefined => {
  const record = readGraphToRecord(error);
  const statusCode = record.statusCode ?? record.status;

  return typeof statusCode === "number" ? statusCode : undefined;
};

const readRetryAfterSeconds = (error: unknown): number | undefined => {
  const headerValue =
    // 这里兼容大小写不同的 header 名称，避免被 SDK 或运行时的 header 形状细节绊住。
    readHeaderValue(error, "Retry-After") ??
    readHeaderValue(error, "retry-after");

  if (headerValue) {
    const retryAfterSeconds = Number(headerValue);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds;
    }
  }

  const innerError = readInnerError(error);
  // 某些 Graph/SDK 错误会把 retry 信息放在 innerError 里，所以这里继续多形状兼容读取。
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

const readRequestId = (error: unknown): string | undefined => {
  const headerRequestId =
    readHeaderValue(error, "request-id") ??
    readHeaderValue(error, "Request-Id") ??
    readHeaderValue(error, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const innerError = readInnerError(error);
  // request id 既可能在 header，也可能被包到 innerError 里，这里统一抽出来方便前端和日志追踪。
  const requestId =
    innerError["request-id"] ??
    innerError.requestId ??
    innerError["client-request-id"];

  return typeof requestId === "string" && requestId ? requestId : undefined;
};

const readGraphErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = readGraphToRecord(error);
  const nestedError = readGraphToRecord(record.error);
  const nestedMessage = nestedError.message;

  if (typeof nestedMessage === "string" && nestedMessage) {
    return nestedMessage;
  }

  const message = record.message;
  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};

const readHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  const record = readGraphToRecord(error);
  const headersCandidate =
    record.headers ??
    record.responseHeaders ??
    readGraphToRecord(record.response).headers ??
    readGraphToRecord(record.body).headers;

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

  const headersRecord = readGraphToRecord(headersCandidate);

  for (const [key, value] of Object.entries(headersRecord)) {
    if (key.toLowerCase() === headerName.toLowerCase()) {
      return typeof value === "string" && value ? value : undefined;
    }
  }

  return undefined;
};

const readInnerError = (error: unknown): Record<string, unknown> => {
  const record = readGraphToRecord(error);
  const bodyRecord = readGraphToRecord(record.body);
  const errorRecord = readGraphToRecord(record.error);

  return readGraphToRecord(bodyRecord.innerError ?? errorRecord.innerError);
};
