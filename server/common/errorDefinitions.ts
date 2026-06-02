import type {
  ErrorCategory,
  ErrorCode,
  ErrorSource,
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";

export type BackendErrorCategory = ErrorCategory;
export type BackendErrorSource = ErrorSource;

/**
 * 后端错误可选元数据。
 *
 * 这些字段会在不同错误子类之间复用，
 * 避免每个错误类都重复声明一遍。
 */
export interface IBackendErrorOptions {
  /** 对应的 HTTP 状态码。 */
  statusCode?: number;

  /** 想额外带给上层或前端的结构化信息。 */
  details?: IErrorDetail[];

  context?: Record<string, unknown>;

  /** 原始异常对象，便于调试和日志追踪。 */
  cause?: unknown;

  /** 上游服务返回的请求标识。 */
  requestId?: string;

  /** 上游建议的重试秒数，仅在响应头读取后写入。 */
  retryAfterSeconds?: number;

  /** 错误来源标识。 */
  source?: BackendErrorSource;

  /** 对上游错误做最小收敛后的调试信息。 */
  originError?: IOriginErrorInfo;
}

/**
 * 创建后端错误实例所需的完整初始化参数。
 */
interface IBackendErrorInit<TCode extends string> extends IBackendErrorOptions {
  name: string;
  code: TCode;
  category: BackendErrorCategory;
  source: BackendErrorSource;
  message: string;
}

/**
 * 服务端业务错误基类。
 *
 * 各模块都可以继续派生自己的稳定错误类型，
 * 让 HTTP 层根据 `code`、`category`、`source`、`statusCode`
 * 统一构造稳定的错误响应。
 */
export class BackendError<TCode extends string = ErrorCode> extends Error {
  readonly code: TCode;

  readonly category: BackendErrorCategory;

  readonly source: BackendErrorSource;

  readonly statusCode?: number;

  readonly details?: IErrorDetail[];

  readonly context?: Record<string, unknown>;

  readonly cause?: unknown;

  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  readonly originError?: IOriginErrorInfo;

  /**
   * 创建一个统一的后端错误对象。
   */
  constructor(init: IBackendErrorInit<TCode>) {
    super(init.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.source = init.source;
    this.statusCode = init.statusCode;
    this.details = init.details;
    this.context = init.context;
    this.cause = init.cause;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.originError = init.originError;
  }
}

/**
 * 统一的鉴权失败错误。
 */
export class BackendAuthError extends BackendError<
  "unauthorized" | "forbidden"
> {
  constructor(
    code: "unauthorized" | "forbidden",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendAuthError",
      category: "auth",
      source: options?.source ?? "backend",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}

/**
 * 统一的输入校验失败错误。
 */
export class BackendValidationError extends BackendError<"invalidRequest"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendValidationError",
      category: "validation",
      source: options?.source ?? "backend",
      code: "invalidRequest",
      message,
      statusCode: options?.statusCode ?? 400,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}

/**
 * 统一的配置错误。
 */
export class BackendConfigError extends BackendError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendConfigError",
      category: "config",
      source: options?.source ?? "backend",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}

/**
 * 统一的 Graph 请求错误。
 */
export class BackendGraphError extends BackendError<
  "throttled" | "serviceUnavailable" | "graphFailure"
> {
  constructor(
    code: "throttled" | "serviceUnavailable" | "graphFailure",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendGraphError",
      category: "graph",
      source: options?.source ?? "graph",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}

/**
 * 统一的内部错误。
 */
export class BackendInternalError extends BackendError<"internalError"> {
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendInternalError",
      category: "internal",
      source: options?.source ?? "backend",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      context: options?.context,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
      originError: options?.originError,
    });
  }
}
