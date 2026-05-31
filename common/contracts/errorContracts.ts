/**
 * 前后端共享的稳定错误码集合。
 *
 * 这里收敛跨模块都会识别的语义。
 * 具体模块如果已有更细的错误码，可以在此基础上继续收窄。
 */
export type ErrorCode =
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
 * 前后端共享的错误类别。
 *
 * 组件和服务层应基于稳定类别做分支，而不是解析 message 文案。
 */
export type ErrorCategory =
  | "auth"
  | "validation"
  | "config"
  | "userAction"
  | "business"
  | "internal"
  | "network"
  | "render"
  | "graph";

/**
 * 前后端共享的错误来源标识。
 *
 * 这个字段用于说明错误最初来自哪里，
 * 方便 UI、日志和调试场景统一识别。
 */
export type ErrorSource =
  | "graph"
  | "backend"
  | "frontend"
  | "node"
  | "react"
  | "browser"
  | "unknown";

/**
 * 对上游错误做最小必要收敛后的调试信息。
 *
 * 这里只保留稳定、低风险、方便排查的字段，
 * 避免把完整原始错误对象直接透传给前端。
 */
export interface IOriginErrorInfo {
  service?: string;
  code?: string;
  innerErrorCode?: string;
  status?: number;
}

/**
 * 对齐 Graph / Microsoft API Guidelines 的子错误结构。
 *
 * `details` 字段应表示子错误数组，而不是项目私有的上下文字典。
 */
export interface IErrorDetail {
  code?: string;
  message: string;
  target?: string;
}

/**
 * API 响应体中的标准错误载荷。
 *
 * `Retry-After` 不放在这里，而是统一走 HTTP header。
 */
export interface IErrorPayload<TCode extends string = string> {
  code: TCode;
  message: string;
  statusCode: number;
  category: ErrorCategory;
  source: ErrorSource;
  requestId?: string;
  details?: IErrorDetail[];
  context?: Record<string, unknown>;
  originError?: IOriginErrorInfo;
}

/**
 * 前后端统一错误响应体。
 *
 * 统一使用标准 envelope，避免继续暴露扁平化错误结构。
 */
export interface IErrorResponseBody<TCode extends string = string> {
  error: IErrorPayload<TCode>;
}
