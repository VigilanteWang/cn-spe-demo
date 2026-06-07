import type {
  AppErrorShape,
  IOriginErrorInfo,
} from "./contracts/errorContracts";

/**
 * 统一应用错误基类。
 *
 * 前后端所有稳定错误都围绕这一种对象流转，
 * 避免再维护前端/后端两套并行基类。
 */
export class AppError extends Error {
  readonly code?: string;

  readonly statusCode?: number;

  readonly originError?: IOriginErrorInfo;

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
 */
export const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * 读取字符串值。
 */
export const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取数字值，同时兼容数字字符串。
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
 */
export const isAppError = (value: unknown): value is AppError =>
  value instanceof AppError;

/**
 * 以最佳努力方式序列化任意未知值。
 */
export const serializeUnknownCause = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
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
    return value.toString();
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeUnknownCause(item, seen));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (value instanceof Error) {
    const errorRecord = value as Error & Record<string, unknown>;
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };

    if (value.stack) {
      serializedError.stack = value.stack;
    }

    for (const key of Object.keys(errorRecord)) {
      serializedError[key] = serializeUnknownCause(errorRecord[key], seen);
    }

    const nestedCause = "cause" in errorRecord ? errorRecord.cause : undefined;
    if (nestedCause !== undefined) {
      serializedError.cause = serializeUnknownCause(nestedCause, seen);
    }

    return serializedError;
  }

  const record = value as Record<string, unknown>;
  const serializedRecord: Record<string, unknown> = {};

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
 */
export const ensureErrorCause = (
  value: unknown,
  fallbackMessage: string,
  fallbackName = "Error",
): Error => {
  if (value instanceof Error) {
    return value;
  }

  const record = readRecord(value);
  const wrappedError = new Error(readErrorMessage(value, fallbackMessage));
  wrappedError.name = readString(record.name) ?? fallbackName;

  const serializedValue = serializeUnknownCause(value);
  if (
    typeof serializedValue === "object" &&
    serializedValue !== null &&
    !Array.isArray(serializedValue)
  ) {
    Object.assign(
      wrappedError as Error & Record<string, unknown>,
      serializedValue as Record<string, unknown>,
    );
  }

  return wrappedError;
};

/**
 * 将统一错误对象序列化为可跨 HTTP 传输的纯数据结构。
 */
export const serializeAppError = (error: AppError): AppErrorShape => ({
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
            error.originError.cause === undefined
              ? undefined
              : (serializeUnknownCause(error.originError.cause) as
                  | Error
                  | Record<string, unknown>),
        },
  details:
    error.details === undefined
      ? undefined
      : error.details.map((detail) => serializeUnknownCause(detail)),
});

/**
 * 将响应体里的统一错误结构反序列化成运行时实例。
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
