/**
 * 统一错误对象里可标识的来源。
 *
 * 这里不再区分前端/后端/React 等实现细节，
 * 只保留当前 demo 真正关心的诊断来源。
 */
export type AppErrorSource =
  | "microsoft-graph"
  | "app"
  | "network"
  | "validation";

/**
 * 对原始错误来源做最小必要收敛后的调试信息。
 *
 * 这个对象默认会直接透传到前端 DevTools，
 * 因此这里优先保留可排查性，而不是做过度裁剪。
 */
export interface IOriginErrorInfo {
  source?: AppErrorSource;
  raw?: unknown;
  codePath?: string[];
  requestId?: string;
  retryAfter?: number;
}

/**
 * 前后端统一错误对象形状。
 *
 * `cause` 会在跨 HTTP 传输时做最佳努力序列化，
 * 不保证保留原始原型链。
 */
export interface AppErrorShape {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  originError?: IOriginErrorInfo;
  cause?: unknown;
}

/**
 * 前后端统一错误响应体。
 *
 * 继续保留 `{ error: ... }` envelope，
 * 方便现有前端 service 统一解析。
 */
export interface IErrorResponseBody {
  error: AppErrorShape;
}
