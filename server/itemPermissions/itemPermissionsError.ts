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
 * 表示 item permission 后端流程里的稳定错误模型。
 *
 * 这个类负责把 Microsoft Graph、请求校验、业务分支里的不同失败，
 * 收口成前后端都能稳定识别的错误对象。
 */
export class ItemPermissionsApiError extends BackendError<ItemPermissionsApiErrorCode> {
  /**
   * 创建一个 item permission 专用错误对象。
   *
   * @param code 供前端和后端共同识别的稳定错误码。
   * @param message 面向日志和接口响应的错误说明。
   * @param options 附加的状态码、请求 ID、限流等待时间和原始异常上下文。
   */
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
      // 根据稳定错误码推导错误类别，便于上层统一决定日志和响应策略。
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
 * 把 Graph SDK 或服务端内部抛出的异常映射成稳定的 item permission 错误。
 *
 * @param error 原始异常，可能来自 Graph SDK、参数校验或其他服务端逻辑。
 * @returns 统一后的 `ItemPermissionsApiError`，供 handler 直接返回给调用方。
 */
export const mapItemPermissionsGraphError = (
  error: unknown,
): ItemPermissionsApiError => {
  // 已经是稳定错误时直接透传，避免重复包裹后丢失原始语义。
  if (error instanceof ItemPermissionsApiError) {
    return error;
  }

  // 请求解析阶段抛出的校验错误，统一映射成 invalidRequest。
  if (error instanceof BackendValidationError) {
    return new ItemPermissionsApiError("invalidRequest", error.message, {
      statusCode: error.statusCode ?? 400,
      details: error.details,
      cause: error.cause ?? error,
    });
  }

  // 先把 Graph 异常里常用的响应元数据读出来，后面的分支会反复复用。
  const statusCode = readErrorStatusCode(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const requestId = readErrorRequestId(error);
  const message = readGraphErrorMessage(error);

  // 400 通常表示请求体、权限 id 或 Graph 参数不符合预期。
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

  // 401 说明当前登录态或 OBO token 已失效。
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

  // 403 说明当前账号已通过认证，但没有管理该 item 的授权。
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

  // 404 表示目标 item 或具体 permission 记录不存在。
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

  // 429 表示 Graph 已经限流，同时尽量把 retry-after 信息带给前端。
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

  // 503/504 更接近上游暂时不可用，保留原始消息帮助排查重试失败原因。
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

  // 其他未单独建模的失败统一收口为 graphFailure，避免把未知异常直接暴露出去。
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
 *
 * @param error 已经完成归一化的 item permission 错误。
 * @returns 可直接写回 HTTP 响应的错误对象。
 */
export const toItemPermissionsApiErrorResponseBody = (
  error: ItemPermissionsApiError,
): IItemPermissionsApiErrorBody => ({
  code: error.code,
  message: error.message,
  retryAfterSeconds: error.retryAfterSeconds,
  requestId: error.requestId,
  // 优先返回错误对象自带的状态码，没有时再按错误码兜底推导。
  statusCode:
    error.statusCode ?? getItemPermissionsApiErrorResponseStatus(error),
  details: error.details,
});

/**
 * 根据稳定错误码推导默认的 HTTP 状态码。
 *
 * @param error 已归一化的 item permission 错误对象。
 * @returns 适合写入 HTTP 响应的状态码。
 */
export const getItemPermissionsApiErrorResponseStatus = (
  error: ItemPermissionsApiError,
): number => {
  // 如果上游已经明确给出状态码，就优先沿用，避免二次猜测。
  if (error.statusCode) {
    return error.statusCode;
  }

  // 没有显式状态码时，再按稳定错误码映射默认响应。
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
 * 尽量从不同形态的 Graph 异常对象里提取可读错误消息。
 *
 * @param error 原始异常对象。
 * @returns 适合拼接到日志或接口响应里的错误说明。
 */
const readGraphErrorMessage = (error: unknown): string => {
  // 原生 Error 的 message 最直接，优先使用。
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // Graph SDK 有时会把真正的错误消息放在嵌套的 error.message 里。
  const record = readGraphToRecord(error);
  const nestedError = readGraphToRecord(record.error);
  const nestedMessage = nestedError.message;

  if (typeof nestedMessage === "string" && nestedMessage) {
    return nestedMessage;
  }

  // 如果没有嵌套消息，再退回到顶层 message；两者都没有时给固定兜底文案。
  const message = record.message;
  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};
