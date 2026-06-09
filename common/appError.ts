import type { AppErrorShape, IOriginError } from "./contracts/errorContracts";

/**
 * 统一应用错误基类。
 *
 * 前后端所有稳定错误都围绕这一种对象流转，
 * 避免再维护前端/后端两套并行基类。
 */
export class AppError extends Error {
  readonly code?: string;

  readonly statusCode?: number;

  readonly originError?: IOriginError;

  readonly details?: unknown[];

  constructor(init: AppErrorShape) {
    super(init.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = init.name;
    this.code = init.code;
    this.statusCode = init.statusCode;
    this.originError = init.originError;
    this.details = init.details;
  }
}

/**
 * 读取普通对象。
 *
 * @param value 任意待读取值。
 * @returns 当输入是对象时返回原对象，否则返回空对象。
 */
export const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * 读取字符串值。
 *
 * @param value 任意待读取值。
 * @returns 当输入是非空字符串时返回该值，否则返回 undefined。
 */
export const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取数字值，同时兼容数字字符串。
 *
 * @param value 任意待读取值。
 * @returns 可解析为有限数字时返回数字，否则返回 undefined。
 */
export const readNumberLike = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

/**
 * 读取最适合展示或记录的错误文案。
 *
 * @param error 任意异常值。
 * @param fallbackMessage 当无法提取 message 时使用的兜底文案。
 * @returns 可用于展示或记录的错误文本。
 */
export const readErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = readRecord(error);
  return readString(record.message) ?? fallbackMessage;
};

/**
 * 判断当前值是否已经是统一错误实例。
 *
 * @param value 任意待判断值。
 * @returns 是否为 AppError 实例。
 */
export const isAppError = (value: unknown): value is AppError =>
  value instanceof AppError;

/**
 * 以最佳努力方式序列化任意未知值。
 *
 * @param value 任意待序列化值。
 * @param seen 用于记录访问过对象的 WeakSet，避免循环引用导致无限递归。
 * @returns 可安全传输或记录的纯数据结构。
 */
export const serializeUnknownCause = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  // 基础可序列化原始值直接返回，避免不必要的包装。
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    // bigint 无法直接 JSON 序列化，统一转字符串。
    return value.toString();
  }

  if (typeof value === "symbol") {
    // symbol 也统一转成可读字符串形式。
    return value.toString();
  }

  if (typeof value === "function") {
    // 函数按占位文本输出，保留函数名方便排查。
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (typeof value !== "object") {
    // 兜底处理其他非常规值，保证最终可输出。
    return String(value);
  }

  // 已访问过同一对象，说明进入了循环引用路径，直接返回占位符中断递归。
  if (seen.has(value)) {
    return "[Circular]";
  }

  // 先登记当前对象，再进入子节点递归，确保数组/对象自引用都能被检测到。
  seen.add(value);

  if (Array.isArray(value)) {
    // 数组逐项递归序列化，并复用同一个 seen 做环检测。
    return value.map((item) => serializeUnknownCause(item, seen));
  }

  if (value instanceof Error) {
    const errorRecord = value as Error & Record<string, unknown>;
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };

    if (value.stack) {
      // stack 不是每次都存在，存在时补充以便追踪调用链。
      serializedError.stack = value.stack;
    }

    // Error 上的自定义可枚举字段（如 code/requestId）一并保留。
    for (const key of Object.keys(errorRecord)) {
      serializedError[key] = serializeUnknownCause(errorRecord[key], seen);
    }

    // 单独兜底读取 cause，兼容某些情况下 cause 不在可枚举键中的场景。
    const nestedCause = "cause" in errorRecord ? errorRecord.cause : undefined;
    if (nestedCause !== undefined) {
      serializedError.cause = serializeUnknownCause(nestedCause, seen);
    }

    return serializedError;
  }

  const record = value as Record<string, unknown>;
  const serializedRecord: Record<string, unknown> = {};

  // 普通对象按键递归序列化，确保每个字段都可安全传输。
  for (const [key, entryValue] of Object.entries(record)) {
    serializedRecord[key] = serializeUnknownCause(entryValue, seen);
  }

  return serializedRecord;
};

/**
 * 将任意原始异常转成可挂到 `originError.cause` 的 `Error`。
 *
 * 对于已经是 `Error` 的值直接复用；
 * 其他值则包装成新的 `Error`，并把原始快照附着到实例上，方便后续序列化排查。
 *
 * @param value 任意原始异常值。
 * @param fallbackMessage 无法提取 message 时的兜底文案。
 * @param fallbackName 无法提取 name 时的兜底错误名。
 * @returns 保证可用的 Error 实例。
 */
export const ensureErrorCause = (
  value: unknown,
  fallbackMessage: string,
  fallbackName = "Error",
): Error => {
  if (value instanceof Error) {
    // 已是 Error 时直接复用，保留原始栈与上下文。
    return value;
  }

  // 尝试提取原始输入中的 name/message，组装标准 Error。
  const record = readRecord(value);
  const wrappedError = new Error(readErrorMessage(value, fallbackMessage));
  wrappedError.name = readString(record.name) ?? fallbackName;

  // 把任意输入先规整成可序列化对象，再尝试并入 Error 实例。
  const serializedValue = serializeUnknownCause(value);
  if (
    typeof serializedValue === "object" &&
    serializedValue !== null &&
    !Array.isArray(serializedValue)
  ) {
    // Object.assign 仅复制 source 的自有可枚举属性，用于把原始快照并入包装错误。
    Object.assign(
      wrappedError as Error & Record<string, unknown>,
      serializedValue as Record<string, unknown>,
    );
  }

  return wrappedError;
};

/**
 * 将统一错误对象序列化为可跨 HTTP 传输的纯数据结构。
 *
 * @param error 运行时 AppError 实例。
 * @returns 可跨层传输的纯数据错误结构。
 */
export const serializeAppError = (error: AppError): AppErrorShape => ({
  // 标准错误字段直接透传。
  name: error.name,
  message: error.message,
  code: error.code,
  statusCode: error.statusCode,
  originError:
    error.originError === undefined
      ? undefined
      : {
          ...error.originError,
          cause:
            // 仅当 originError.cause 存在时才做深度序列化。
            error.originError.cause === undefined
              ? undefined
              : // cause 可能是 Error、普通对象或其他值，统一走安全序列化。
                (serializeUnknownCause(error.originError.cause) as
                  | Error
                  | Record<string, unknown>),
        },
  details:
    // details 可选；存在时逐项规整，避免异常值破坏响应结构。
    error.details === undefined
      ? undefined
      : // details 为 unknown[]，逐项序列化后可稳定用于日志与 HTTP 传输。
        error.details.map((detail) => serializeUnknownCause(detail)),
});

/**
 * 将响应体里的统一错误结构反序列化成运行时实例。
 *
 * @param error 响应体中的统一错误数据结构。
 * @returns 运行时 AppError 实例。
 */
export const deserializeAppError = (error: AppErrorShape): AppError =>
  new AppError({
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    originError: error.originError,
    details: error.details,
  });

/**
 * 统一格式化 UI 直接展示的错误文案。
 *
 * @param error 任意异常值。
 * @param fallbackMessage 无法格式化时的兜底文案。
 * @returns 适合在 UI 直接展示的错误文本。
 */
export const formatAppErrorMessageForUI = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof Error && error.message) {
    return `${error.name || "Error"}: ${error.message}`;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (
      typeof record.name === "string" &&
      record.name &&
      typeof record.message === "string" &&
      record.message
    ) {
      return `${record.name}: ${record.message}`;
    }
  }

  return fallbackMessage;
};
