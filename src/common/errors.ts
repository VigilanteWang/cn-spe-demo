import type {
  ErrorCategory,
  ErrorSource,
  IErrorDetail,
  IOriginErrorInfo,
} from "../../common/contracts/errorContracts";

export type FrontendErrorCategory = ErrorCategory;
export type FrontendErrorSource = ErrorSource;

/**
 * 描述前端错误对象的通用可选元信息。
 */
export interface IFrontendErrorOptions {
  statusCode?: number;
  details?: IErrorDetail[];
  context?: Record<string, unknown>;
  requestId?: string;
  retryAfterSeconds?: number;
  cause?: unknown;
  originError?: IOriginErrorInfo;
  category?: FrontendErrorCategory;
  source?: FrontendErrorSource;
}

/**
 * 定义创建前端错误实例时需要的完整参数。
 */
interface IFrontendErrorInit extends IFrontendErrorOptions {
  name: string;
  category: FrontendErrorCategory;
  source: FrontendErrorSource;
  code: string;
  message: string;
}

/**
 * 描述可能附带标准化元信息的错误对象形状。
 *
 * 这个内部接口用于在格式化错误文案时安全读取附加字段，
 * 例如 `requestId` 和 `retryAfterSeconds`。
 */
interface IStandardErrorWithMetadataShape {
  message: string;
  code?: unknown;
  requestId?: unknown;
  retryAfterSeconds?: unknown;
}

/**
 * 前端统一错误基类。
 *
 * 所有前端可消费的稳定错误对象都应继承这个基类，
 * 让 UI 可以基于 `code`、`category` 和 `source` 做分支处理。
 */
export class FrontendErrorBase extends Error {
  readonly code: string;

  readonly category: FrontendErrorCategory;

  readonly source: FrontendErrorSource;

  readonly statusCode?: number;

  readonly requestId?: string;

  readonly retryAfterSeconds?: number;

  readonly details?: IErrorDetail[];

  readonly context?: Record<string, unknown>;

  readonly cause?: unknown;

  readonly originError?: IOriginErrorInfo;

  /**
   * 使用统一结构初始化前端错误实例。
   */
  constructor(init: IFrontendErrorInit) {
    super(init.message);
    Object.setPrototypeOf(this, new.target.prototype);
    // 保留更具体的错误名称，方便日志和调试时快速识别来源。
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.source = init.source;
    this.statusCode = init.statusCode;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.details = init.details;
    this.context = init.context;
    this.cause = init.cause;
    this.originError = init.originError;
  }
}

/**
 * 表示接口调用相关的前端稳定错误。
 */
export class FrontendApiError extends FrontendErrorBase {
  /**
   * 创建一个 API 风格的前端错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendApiError",
      category: options?.category ?? "business",
      source: options?.source ?? "frontend",
      code,
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
 * 表示参数校验或输入校验相关的前端错误。
 */
export class FrontendValidationError extends FrontendErrorBase {
  /**
   * 创建一个 validation 类别的前端错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendValidationError",
      category: "validation",
      source: options?.source ?? "frontend",
      code,
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
 * 表示配置缺失或配置异常相关的前端错误。
 */
export class FrontendConfigError extends FrontendErrorBase {
  /**
   * 创建一个 config 类别的前端错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendConfigError",
      category: "config",
      source: options?.source ?? "frontend",
      code,
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
 * 表示用户主动取消、关闭或中断操作的前端错误。
 */
export class FrontendUserActionError extends FrontendErrorBase {
  /**
   * 创建一个 userAction 类别的前端错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendUserActionError",
      category: "userAction",
      source: options?.source ?? "frontend",
      code,
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
 * 读取最适合直接展示给 UI 的错误文案。
 *
 * 如果拿到的是标准 `Error`，优先返回其中的 `message`；
 * 否则回退到调用方提供的兜底文案。
 */
export const readErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  // 只有真正的 Error 且包含 message 时，才直接复用原始错误文案。
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
  }

  return fallbackMessage;
};

/**
 * 从标准化错误对象中拼出更适合 UI 展示的错误文案。
 *
 * 这个方法会优先复用稳定的元信息字段，
 * 例如 `retryAfterSeconds` 和 `requestId`，
 * 避免每个组件都自己解析错误对象结构。
 *
 * 处理顺序如下：
 * 1. 如果传入值不是带有 `message` 的 `Error`，直接返回兜底文案。
 * 2. 如果错误表示限流，并且能读到重试秒数，则在文案后追加重试提示。
 * 3. 如果存在请求追踪用的 `requestId`，则在文案后追加排查线索。
 * 4. 否则直接返回原始错误文案。
 *
 * @param error 需要被格式化的未知错误对象，通常来自接口请求、服务调用或运行时异常。
 * @param fallbackMessage 当错误对象不可读或缺少有效 `message` 时使用的兜底文案。
 * @returns 适合直接显示在 UI 上的错误提示文案。
 */
export const formatStandardErrorMessageForUI = (
  error: unknown,
  fallbackMessage: string,
): string => {
  // 如果连基础的 Error 形状都不满足，就只能返回兜底文案。
  if (!(error instanceof Error) || !error.message) {
    return fallbackMessage;
  }

  const errorWithMetadata = error as Error & IStandardErrorWithMetadataShape;
  // 统一只读取顶层 requestId，避免 formatter 自己再去猜测 details 的私有结构。
  const requestId =
    typeof errorWithMetadata.requestId === "string"
      ? errorWithMetadata.requestId
      : undefined;
  // 统一只读取顶层 retryAfterSeconds，由 service 层负责从 header 注入。
  const retryAfterSeconds =
    typeof errorWithMetadata.retryAfterSeconds === "number"
      ? errorWithMetadata.retryAfterSeconds
      : undefined;
  // 只在 code 是字符串时才继续使用，避免把未知值带进展示文案。
  const code =
    typeof errorWithMetadata.code === "string"
      ? errorWithMetadata.code
      : undefined;

  // 统一把补充信息按顺序拼到原始 message 后面，避免不同 UI 自己再重复组装。
  const messageParts = [error.message];

  // 对限流错误追加重试时间，帮助用户理解何时可以再次发起请求。
  if (code === "throttled" && retryAfterSeconds) {
    messageParts.push(`Retry after ${retryAfterSeconds} seconds.`);
  }

  // 如果有 requestId，就拼进文案，便于用户反馈问题时携带排查线索。
  if (requestId) {
    messageParts.push(`Request ID: ${requestId}.`);
  }

  return messageParts.join(" ");
};
