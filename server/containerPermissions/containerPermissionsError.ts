import type {
  IPermissionApiErrorBody,
  PermissionApiErrorCode,
} from "../../common/contracts/permissionCommonContracts";
import type {
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";
import { readGraphToRecord } from "./containerPermissionsReaders";
import {
  type BackendErrorSource,
  BackendError,
  BackendValidationError,
} from "../common/errorDefinitions";
import {
  readErrorDetails,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
  readOriginError,
} from "../common/errorUtils";

/**
 * Graph 权限请求失败后，在服务端内部使用的错误类型。
 */
export class ContainerPermissionsApiError extends BackendError<PermissionApiErrorCode> {
  constructor(
    code: PermissionApiErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
      details?: IErrorDetail[];
      context?: Record<string, unknown>;
      cause?: unknown;
      source?: BackendErrorSource;
      originError?: IOriginErrorInfo;
    },
  ) {
    super({
      name: "ContainerPermissionsApiError",
      code,
      category:
        code === "invalidRequest"
          ? "validation"
          : code === "unauthorized" || code === "forbidden"
            ? "auth"
            : code === "throttled" ||
                code === "serviceUnavailable" ||
                code === "graphFailure"
              ? "graph"
              : "business",
      source:
        options?.source ??
        (code === "throttled" ||
        code === "serviceUnavailable" ||
        code === "graphFailure"
          ? "graph"
          : "backend"),
      message,
      statusCode: options?.statusCode,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      originError: options?.originError,
    });
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

  if (error instanceof BackendValidationError) {
    return new ContainerPermissionsApiError("invalidRequest", error.message, {
      statusCode: error.statusCode ?? 400,
      details: error.details,
      context: error.context,
      cause: error.cause ?? error,
      source: error.source,
      originError: error.originError,
    });
  }

  const statusCode = readErrorStatusCode(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const requestId = readErrorRequestId(error);
  const details = readErrorDetails(error);
  const message = readGraphErrorMessage(error);
  const originError = readOriginError(error, "microsoft-graph");

  if (statusCode === 400) {
    return new ContainerPermissionsApiError("invalidRequest", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  if (statusCode === 401) {
    return new ContainerPermissionsApiError("unauthorized", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  if (statusCode === 403) {
    return new ContainerPermissionsApiError("forbidden", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  if (statusCode === 404) {
    return new ContainerPermissionsApiError("notFound", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  return new ContainerPermissionsApiError(
    statusCode === 429
      ? "throttled"
      : statusCode === 503 || statusCode === 504
        ? "serviceUnavailable"
        : "graphFailure",
    message,
    {
      statusCode,
      retryAfterSeconds,
      requestId,
      details,
      cause: error,
      source: "graph",
      originError,
    },
  );
};

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 */
export const toContainerPermissionsApiErrorResponseBody = (
  error: ContainerPermissionsApiError,
): IPermissionApiErrorBody => ({
  error: {
    code: error.code,
    message: error.message,
    requestId: error.requestId,
    statusCode:
      error.statusCode ?? getContainerPermissionsApiErrorResponseStatus(error),
    category: error.category,
    source: error.source,
    details: error.details,
    context: error.context,
    originError: error.originError,
  },
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

const readGraphErrorMessage = (error: unknown): string => {
  const record = readGraphToRecord(error);
  const body = readGraphToRecord(record.body);
  const bodyError = readGraphToRecord(body.error);
  const nestedError = readGraphToRecord(record.error);
  const graphMessage =
    typeof bodyError.message === "string" && bodyError.message
      ? bodyError.message
      : typeof nestedError.message === "string" && nestedError.message
        ? nestedError.message
        : undefined;

  if (graphMessage) {
    return graphMessage;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  const message = record.message;
  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};
