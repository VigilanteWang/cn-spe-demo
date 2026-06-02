import type { IPermissionApiErrorBody } from "../../common/contracts/permissionCommonContracts";
import { AppError, serializeAppError } from "../../common/appError";
import { readGraphToRecord } from "../permissionsCore/permissionGraphReaders";
import { toGraphAppError } from "../common/appErrorHelpers";

/**
 * 把 Graph SDK 或服务端内部抛出的异常映射成稳定的 item permission 错误。
 *
 * @param error 原始异常，可能来自 Graph SDK、参数校验或其他服务端逻辑。
 * @returns 统一后的 `ItemPermissionsApiError`，供 handler 直接返回给调用方。
 */
export const mapItemPermissionsGraphError = (error: unknown): AppError =>
  toGraphAppError(error, readGraphErrorMessage(error), 500);

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 *
 * @param error 已经完成归一化的 item permission 错误。
 * @returns 可直接写回 HTTP 响应的错误对象。
 */
export const toItemPermissionsApiErrorResponseBody = (
  error: AppError,
): IPermissionApiErrorBody => ({
  error: serializeAppError(error),
});

/**
 * 根据稳定错误码推导默认的 HTTP 状态码。
 *
 * @param error 已归一化的 item permission 错误对象。
 * @returns 适合写入 HTTP 响应的状态码。
 */
export const getItemPermissionsApiErrorResponseStatus = (
  error: AppError,
): number => error.statusCode ?? 500;

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
