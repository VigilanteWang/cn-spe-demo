import type {
  IPermissionApiErrorBody,
  PermissionApiErrorCode,
} from "../../common/contracts/permissionCommonContracts";
import type {
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";
import { readGraphToRecord } from "../permissionsCore/permissionGraphReaders";
import {
  BackendError,
  BackendErrorSource,
  BackendValidationError,
  readErrorDetails,
  readErrorRequestId,
  readErrorRetryAfterSeconds,
  readErrorStatusCode,
  readOriginError,
} from "../common/errors";

/**
 * 表示 item permission 后端流程里的稳定错误模型。
 *
 * 这个类负责把 Microsoft Graph、请求校验、业务分支里的不同失败，
 * 收口成前后端都能稳定识别的错误对象。
 */
export class ItemPermissionsApiError extends BackendError<PermissionApiErrorCode> {
  /**
   * 创建一个 item permission 专用错误对象。
   *
   * @param code 供前端和后端共同识别的稳定错误码。
   * @param message 面向日志和接口响应的错误说明。
   * @param options 附加的状态码、请求 ID、限流等待时间和原始异常上下文。
   */
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
      context: error.context,
      cause: error.cause ?? error,
      source: error.source,
      originError: error.originError,
    });
  }

  // 先把 Graph 异常里常用的响应元数据读出来，后面的分支会反复复用。
  const statusCode = readErrorStatusCode(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const requestId = readErrorRequestId(error);
  const details = readErrorDetails(error);
  const message = readGraphErrorMessage(error);
  const originError = readOriginError(error, "microsoft-graph");

  // 400 通常表示请求体、权限 id 或 Graph 参数不符合预期。
  if (statusCode === 400) {
    return new ItemPermissionsApiError("invalidRequest", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  // 401 说明当前登录态或 OBO token 已失效。
  if (statusCode === 401) {
    return new ItemPermissionsApiError("unauthorized", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  // 403 说明当前账号已通过认证，但没有管理该 item 的授权。
  if (statusCode === 403) {
    return new ItemPermissionsApiError("forbidden", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  // 404 表示目标 item 或具体 permission 记录不存在。
  if (statusCode === 404) {
    return new ItemPermissionsApiError("notFound", message, {
      statusCode,
      requestId,
      cause: error,
      source: "graph",
      originError,
    });
  }

  // 429 表示 Graph 已经限流，同时尽量把 retry-after 信息带给前端。
  // 其他未单独建模的失败统一收口为 graphFailure，避免把未知异常直接暴露出去。
  return new ItemPermissionsApiError(
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
 *
 * @param error 已经完成归一化的 item permission 错误。
 * @returns 可直接写回 HTTP 响应的错误对象。
 */
export const toItemPermissionsApiErrorResponseBody = (
  error: ItemPermissionsApiError,
): IPermissionApiErrorBody => ({
  error: {
    code: error.code,
    message: error.message,
    requestId: error.requestId,
    // 优先返回错误对象自带的状态码，没有时再按错误码兜底推导。
    statusCode:
      error.statusCode ?? getItemPermissionsApiErrorResponseStatus(error),
    category: error.category,
    source: error.source,
    details: error.details,
    context: error.context,
    originError: error.originError,
  },
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

  // 原生 Error 的 message 最直接，优先使用。
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // 如果没有嵌套消息，再退回到顶层 message；两者都没有时给固定兜底文案。
  const message = record.message;
  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};
