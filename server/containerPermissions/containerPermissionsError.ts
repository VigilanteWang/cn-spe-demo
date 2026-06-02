import type { IPermissionApiErrorBody } from "../../common/contracts/permissionCommonContracts";
import { AppError, serializeAppError } from "../../common/appError";
import { readGraphToRecord } from "./containerPermissionsReaders";
import { toGraphAppError } from "../common/appErrorHelpers";

/**
 * 把 Graph SDK 抛出的未知错误映射成权限 API 自己的稳定错误类型。
 */
export const mapContainerPermissionsGraphError = (error: unknown): AppError =>
  toGraphAppError(error, readGraphErrorMessage(error), 500);

/**
 * 把服务端内部错误对象转换成稳定的 API 响应体。
 */
export const toContainerPermissionsApiErrorResponseBody = (
  error: AppError,
): IPermissionApiErrorBody => ({
  error: serializeAppError(error),
});

/**
 * 根据业务错误类型选择合适的 HTTP 状态码。
 */
export const getContainerPermissionsApiErrorResponseStatus = (
  error: AppError,
): number => error.statusCode ?? 500;

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
