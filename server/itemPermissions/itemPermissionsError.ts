import type {
  IItemPermissionsApiErrorBody,
  ItemPermissionsApiErrorCode,
} from "../../common/contracts/itemPermissionCommonContracts";
import { readGraphToRecord } from "../permissionsCore/permissionGraphReaders";
import {
  BackendError,
  BackendValidationError,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
} from "../common/errors";

/**
 * Graph item permission 请求失败后，在服务端内部使用的稳定错误类型。
 */
export class ItemPermissionsApiError extends BackendError<ItemPermissionsApiErrorCode> {
  constructor(
    code: ItemPermissionsApiErrorCode,
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
      name: "ItemPermissionsApiError",
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
 * 把 Graph SDK 抛出的未知错误映射成 item permission API 自己的稳定错误类型。
 */
export const mapItemPermissionsGraphError = (
  error: unknown,
): ItemPermissionsApiError => {
  if (error instanceof ItemPermissionsApiError) {
    return error;
  }

  if (error instanceof BackendValidationError) {
    return new ItemPermissionsApiError("invalidRequest", error.message, {
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
    return new ItemPermissionsApiError(
      "invalidRequest",
      `Item permission request is invalid: ${message}`,
      {
        statusCode,
        requestId,
        cause: error,
      },
    );
  }

  if (statusCode === 401) {
    return new ItemPermissionsApiError(
      "unauthorized",
      "Item permission authentication expired. Please sign in again.",
      {
        statusCode,
        requestId,
        cause: error,
      },
    );
  }

  if (statusCode === 403) {
    return new ItemPermissionsApiError(
      "forbidden",
      "The current account does not have permission to manage this item.",
      {
        statusCode,
        requestId,
        cause: error,
      },
    );
  }

  if (statusCode === 404) {
    return new ItemPermissionsApiError(
      "notFound",
      "The target item or permission record was not found.",
      {
        statusCode,
        requestId,
        cause: error,
      },
    );
  }

  if (statusCode === 429) {
    return new ItemPermissionsApiError(
      "throttled",
      "Microsoft Graph throttled the item permission request after SDK retries were exhausted.",
      {
        statusCode,
        retryAfterSeconds,
        requestId,
        cause: error,
      },
    );
  }

  if (statusCode === 503 || statusCode === 504) {
    return new ItemPermissionsApiError(
      "serviceUnavailable",
      `Item permission request still failed after SDK retries: ${message}`,
      {
        statusCode,
        retryAfterSeconds,
        requestId,
        cause: error,
      },
    );
  }

  return new ItemPermissionsApiError(
    "graphFailure",
    `Microsoft Graph item permission request failed: ${message}`,
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
export const toItemPermissionsApiErrorResponseBody = (
  error: ItemPermissionsApiError,
): IItemPermissionsApiErrorBody => ({
  code: error.code,
  message: error.message,
  retryAfterSeconds: error.retryAfterSeconds,
  requestId: error.requestId,
  statusCode: error.statusCode ?? getItemPermissionsApiErrorResponseStatus(error),
  details: error.details,
});

/**
 * 根据业务错误类型选择合适的 HTTP 状态码。
 */
export const getItemPermissionsApiErrorResponseStatus = (
  error: ItemPermissionsApiError,
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
