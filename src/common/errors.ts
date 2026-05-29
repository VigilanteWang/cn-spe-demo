/**
 * 约束前端统一使用的错误类别。
 *
 * 这些类别用于帮助 UI 按错误来源选择提示方式，
 * 避免上层组件直接依赖某个具体错误类名。
 */
export type FrontendErrorCategory =
  | "api"
  | "validation"
  | "config"
  | "userAction";

/**
 * 描述前端业务错误的通用可选元信息。
 *
 * 这里只保留跨模块都稳定可用的字段，
 * 避免上层代码依赖某个局部实现里的私有结构。
 */
export interface IFrontendBusinessErrorOptions {
  statusCode?: number;
  details?: Record<string, unknown>;
}

/**
 * 描述可能附带标准化元信息的错误对象形状。
 *
 * 这个内部接口用于在格式化错误文案时安全读取附加字段，
 * 例如 `requestId`、`retryAfterSeconds` 和 `details`。
 */
interface IStandardErrorWithMetadataShape {
  message: string;
  code?: unknown;
  requestId?: unknown;
  retryAfterSeconds?: unknown;
  details?: unknown;
}

/**
 * 定义创建前端业务错误实例时需要的完整参数。
 *
 * 与对外暴露的可选参数相比，这里补齐了错误类别、错误码和名称，
 * 便于基类统一初始化。
 */
interface IFrontendBusinessErrorInit extends IFrontendBusinessErrorOptions {
  name: string;
  category: FrontendErrorCategory;
  code: string;
  message: string;
}

/**
 * 前端业务错误基类。
 *
 * 各模块可以在这个基类之上派生稳定的错误类型，
 * 让 UI 优先基于 `code` 和 `category` 做分支处理，
 * 而不是去解析不稳定的错误文案。
 */
export class FrontendBusinessError extends Error {
  readonly code: string;

  readonly category: FrontendErrorCategory;

  readonly statusCode?: number;

  readonly details?: Record<string, unknown>;

  /**
   * 使用统一结构初始化前端业务错误实例。
   */
  constructor(init: IFrontendBusinessErrorInit) {
    super(init.message);
    // 保留更具体的错误名称，方便日志和调试时快速识别来源。
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.statusCode = init.statusCode;
    this.details = init.details;
  }
}

/**
 * 表示接口调用相关的前端业务错误。
 */
export class FrontendApiError extends FrontendBusinessError {
  /**
   * 创建一个 API 类别的业务错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendApiError",
      category: "api",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 表示参数校验或输入校验相关的前端业务错误。
 */
export class FrontendValidationError extends FrontendBusinessError {
  /**
   * 创建一个 validation 类别的业务错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendValidationError",
      category: "validation",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 表示配置缺失或配置异常相关的前端业务错误。
 */
export class FrontendConfigError extends FrontendBusinessError {
  /**
   * 创建一个 config 类别的业务错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendConfigError",
      category: "config",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 表示用户主动取消、关闭或中断操作的前端业务错误。
 */
export class FrontendUserActionError extends FrontendBusinessError {
  /**
   * 创建一个 userAction 类别的业务错误实例。
   */
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendUserActionError",
      category: "userAction",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
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
  // `details` 可能来自后端错误体，这里先收窄成可安全读取的对象。
  const details =
    typeof errorWithMetadata.details === "object" &&
    errorWithMetadata.details !== null
      ? (errorWithMetadata.details as Record<string, unknown>)
      : null;
  // 优先读取顶层 requestId；如果没有，再尝试从 details 里补拿。
  const requestId =
    typeof errorWithMetadata.requestId === "string"
      ? errorWithMetadata.requestId
      : typeof details?.requestId === "string"
        ? details.requestId
        : undefined;
  // 限流重试秒数同样支持顶层字段和 details 两种来源。
  const retryAfterSeconds =
    typeof errorWithMetadata.retryAfterSeconds === "number"
      ? errorWithMetadata.retryAfterSeconds
      : typeof details?.retryAfterSeconds === "number"
        ? details.retryAfterSeconds
        : undefined;
  // 只在 code 是字符串时才继续使用，避免把未知值带进展示文案。
  const code =
    typeof errorWithMetadata.code === "string"
      ? errorWithMetadata.code
      : undefined;

  // 对限流错误追加重试时间，帮助用户理解何时可以再次发起请求。
  if (code === "throttled" && retryAfterSeconds) {
    return `${error.message} Retry after ${retryAfterSeconds} seconds.`;
  }

  // 如果有 requestId，就拼进文案，便于用户反馈问题时携带排查线索。
  if (requestId) {
    return `${error.message} Request ID: ${requestId}.`;
  }

  return error.message;
};
