/**
 * 后端对外暴露的通用错误码集合。
 *
 * 这里优先收敛“跨模块稳定语义”，避免前端继续依赖 message 文案做分支。
 * 某些子模块如果已经有更细的既有 code，也可以在此基础上继续收窄。
 */
export type ApiErrorCode =
  | "invalidRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "throttled"
  | "serviceUnavailable"
  | "graphFailure"
  | "internalError";

/**
 * 后端统一错误响应体。
 *
 * `message` 会继续保留给前端直接展示或兜底，
 * 但推荐以后优先基于 `code` 和 `statusCode` 做分支。
 */
export interface IApiErrorResponseBody {
  code: ApiErrorCode | string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  requestId?: string;
  retryAfterSeconds?: number;
}
