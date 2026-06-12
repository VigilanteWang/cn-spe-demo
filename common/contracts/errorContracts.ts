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
 * 可跨 HTTP 传输的原始异常快照。
 *
 * 运行时 `originError.cause` 优先保存真正的 `Error`；
 * 序列化后允许降级为这个 plain object 结构，不要求恢复原型链。
 */
export interface ISerializedErrorCause {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  [key: string]: unknown;
}

/**
 * 对原始错误来源做最小必要收敛后的调试信息。
 *
 * 这个对象默认会直接透传到前端 DevTools，
 * 因此这里优先保留可排查性，而不是做过度裁剪。
 */
export interface IOriginError {
  source?: AppErrorSource;
  cause?: Error | ISerializedErrorCause;
  codePath?: string[];
  retryAfter?: number;
}

/**
 * 前后端统一错误对象形状。
 *
 * `details` 会在跨 HTTP 传输时做最佳努力序列化，
 * 不保证保留原始原型链。
 */
export interface AppErrorShape {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  originError?: IOriginError;
  details?: unknown[];
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
