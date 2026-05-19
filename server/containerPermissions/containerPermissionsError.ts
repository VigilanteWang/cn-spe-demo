import type {
  ContainerPermissionsApiErrorCode,
  IContainerPermissionsApiErrorBody,
} from "../../common/contracts/containerPermissionCommonContracts";
import { readGraphToRecord } from "./containerPermissionsReaders";
import {
  BackendError,
  BackendValidationError,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
} from "../common/errors";

/**
 * Graph 权限请求失败后，在服务端内部使用的错误类型。
 */
export class ContainerPermissionsApiError extends BackendError<ContainerPermissionsApiErrorCode> {
  constructor(
    code: ContainerPermissionsApiErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
      details?: Record<string, unknown>;
      cause?: unknown;
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
      message,
      statusCode: options?.statusCode,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      details: options?.details,
      cause: options?.cause,
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
      cause: error.cause ?? error,
    });
  }

  const statusCode = readErrorStatusCode(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const requestId = readErrorRequestId(error);
  const message = readGraphErrorMessage(error);

  if (statusCode === 400) {
    return new ContainerPermissionsApiError(
      "invalidRequest",
      `Container permission request is invalid: ${message}`,
      {
        statusCode,
        requestId,
        cause: error,
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
        cause: error,
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
        cause: error,
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
        cause: error,
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
        cause: error,
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
        cause: error,
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
      cause: error,
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
  statusCode: error.statusCode ?? getContainerPermissionsApiErrorResponseStatus(error),
  details: error.details,
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
