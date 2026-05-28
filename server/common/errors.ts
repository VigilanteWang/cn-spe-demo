import type { ApiErrorCode } from "../../common/contracts/apiErrorContracts";

/**
 * 服务端内部错误分类。
 *
 * 这个分类主要给后续错误响应层和日志层使用，
 * 用来区分一条错误大致属于认证、输入校验、Graph 调用还是内部异常。
 */
export type BackendErrorCategory =
  | "auth"
  | "validation"
  | "config"
  | "graph"
  | "business"
  | "internal";

/**
 * 后端错误可选元数据。
 *
 * 这些字段会在不同错误子类之间复用，避免每个错误类都重复声明一遍。
 */
export interface IBackendErrorOptions {
  /** 对应的 HTTP 状态码。 */
  statusCode?: number;

  /** 想额外带给上层或前端的结构化信息。 */
  details?: Record<string, unknown>;

  /** 原始异常对象，便于调试和日志追踪。 */
  cause?: unknown;

  /** 上游服务返回的请求标识，常用于查 Graph 请求。 */
  requestId?: string;

  /** 上游建议的重试秒数，常见于节流场景。 */
  retryAfterSeconds?: number;
}

/**
 * 创建后端错误实例所需的完整初始化参数。
 */
interface IBackendErrorInit<TCode extends string> extends IBackendErrorOptions {
  /** 错误类名或语义名。 */
  name: string;

  /** 面向 API 响应的稳定错误码。 */
  code: TCode;

  /** 错误所属的大类。 */
  category: BackendErrorCategory;

  /** 面向调用方的错误文案。 */
  message: string;
}

/**
 * 服务端业务错误基类。
 *
 * 各模块都可以继续派生自己的稳定错误类型，
 * 让 HTTP 层根据 `code`、`category`、`statusCode`
 * 统一构造稳定的错误响应。
 *
 * @typeParam TCode 错误码类型。
 */
export class BackendError<TCode extends string = ApiErrorCode> extends Error {
  /** 面向 API 的稳定错误码。 */
  readonly code: TCode;

  /** 错误所属的大类。 */
  readonly category: BackendErrorCategory;

  /** 建议返回给 HTTP 的状态码。 */
  readonly statusCode?: number;

  /** 附带的结构化错误细节。 */
  readonly details?: Record<string, unknown>;

  /** 原始异常对象。 */
  readonly cause?: unknown;

  /** 上游请求 ID。 */
  readonly requestId?: string;

  /** 上游建议的重试秒数。 */
  readonly retryAfterSeconds?: number;

  /**
   * 创建一个统一的后端错误对象。
   *
   * @param init 错误初始化参数。
   */
  constructor(init: IBackendErrorInit<TCode>) {
    super(init.message);
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.statusCode = init.statusCode;
    this.details = init.details;
    this.cause = init.cause;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/**
 * 统一的鉴权失败错误。
 *
 * 用于表达“没有登录”或“已登录但无权限”两类错误。
 */
export class BackendAuthError extends BackendError<
  "unauthorized" | "forbidden"
> {
  /**
   * 创建鉴权错误。
   *
   * @param code `unauthorized` 或 `forbidden`。
   * @param message 面向调用方的错误文案。
   * @param options 额外错误元数据。
   */
  constructor(
    code: "unauthorized" | "forbidden",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendAuthError",
      category: "auth",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的输入校验失败错误。
 */
export class BackendValidationError extends BackendError<"invalidRequest"> {
  /**
   * 创建输入校验错误。
   *
   * @param message 面向调用方的错误文案。
   * @param options 额外错误元数据。
   */
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendValidationError",
      category: "validation",
      code: "invalidRequest",
      message,
      statusCode: options?.statusCode ?? 400,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的配置错误。
 *
 * 这类错误通常意味着服务端启动参数、环境变量或依赖配置不完整。
 */
export class BackendConfigError extends BackendError<"internalError"> {
  /**
   * 创建配置错误。
   *
   * @param message 面向调用方的错误文案。
   * @param options 额外错误元数据。
   */
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendConfigError",
      category: "config",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的 Graph 请求错误。
 *
 * 这里把 Graph 相关错误再细分为：
 * - `throttled`：被节流
 * - `serviceUnavailable`：上游暂时不可用
 * - `graphFailure`：其余一般性失败
 */
export class BackendGraphError extends BackendError<
  "throttled" | "serviceUnavailable" | "graphFailure"
> {
  /**
   * 创建 Graph 错误。
   *
   * @param code Graph 错误码。
   * @param message 面向调用方的错误文案。
   * @param options 额外错误元数据。
   */
  constructor(
    code: "throttled" | "serviceUnavailable" | "graphFailure",
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendGraphError",
      category: "graph",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 统一的内部错误。
 *
 * 用于兜底那些不应该直接暴露实现细节的服务端异常。
 */
export class BackendInternalError extends BackendError<"internalError"> {
  /**
   * 创建内部错误。
   *
   * @param message 面向调用方的错误文案。
   * @param options 额外错误元数据。
   */
  constructor(
    message: string,
    options?: IBackendErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "BackendInternalError",
      category: "internal",
      code: "internalError",
      message,
      statusCode: options?.statusCode ?? 500,
      details: options?.details,
      cause: options?.cause,
      requestId: options?.requestId,
      retryAfterSeconds: options?.retryAfterSeconds,
    });
  }
}

/**
 * 尝试把未知值读成普通对象。
 *
 * 这是很多错误提取函数的基础工具，用来避免对 `null` 或原始值直接取属性。
 *
 * @param value 未知输入值。
 * @returns 普通对象；若无法识别则返回空对象。
 */
const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * 从 headers 候选对象里读取指定响应头。
 *
 * 这里同时兼容：
 * - 普通对象风格：`headers["Retry-After"]`
 * - `Headers` 实例风格：`headers.get("Retry-After")`
 *
 * @param headersCandidate 可能承载响应头的对象。
 * @param headerName 要读取的响应头名。
 * @returns 读到的头值；否则返回 `undefined`。
 */
const readHeaderValue = (
  headersCandidate: unknown,
  headerName: string,
): string | undefined => {
  const headersRecord = readRecord(headersCandidate);
  const directValue = headersRecord[headerName];

  if (typeof directValue === "string" && directValue) {
    return directValue;
  }

  const getCandidate = headersRecord.get;
  if (typeof getCandidate === "function") {
    const value = getCandidate.call(headersCandidate, headerName);
    return typeof value === "string" && value ? value : undefined;
  }

  return undefined;
};

/**
 * 提取 Graph 错误对象里可能承载响应头的容器。
 *
 * 不同来源的错误对象结构并不完全一致，
 * 所以这里按常见位置依次兜底查找。
 *
 * @param error 原始错误对象。
 * @returns 可能的 headers 容器。
 */
const readErrorHeadersCandidate = (error: unknown): unknown => {
  const record = readRecord(error);
  return (
    record.headers ??
    record.responseHeaders ??
    readRecord(record.response).headers ??
    readRecord(record.body).headers
  );
};

/**
 * 提取 Graph 错误对象里的 `innerError`。
 *
 * Graph SDK 有时把 `innerError` 放在 `body.innerError`，
 * 也有时挂在 `error.innerError` 下，这里统一收口。
 *
 * @param error 原始错误对象。
 * @returns 提取出的 `innerError` 记录对象；找不到时返回空对象。
 */
const readErrorInnerError = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const bodyInnerError = readRecord(readRecord(record.body).innerError);
  const errorInnerError = readRecord(readRecord(record.error).innerError);

  return Object.keys(bodyInnerError).length > 0
    ? bodyInnerError
    : errorInnerError;
};

/**
 * 读取错误对象上的 HTTP 状态码。
 *
 * @param error 原始错误对象。
 * @returns 状态码；读取不到时返回 `undefined`。
 */
export const readErrorStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const statusCode = record.statusCode ?? record.status;
  return typeof statusCode === "number" ? statusCode : undefined;
};

/**
 * 读取错误对象上的请求 ID。
 *
 * 优先从响应头读取，读不到再回退到 `innerError`。
 *
 * @param error 原始错误对象。
 * @returns 请求 ID；读取不到时返回 `undefined`。
 */
export const readErrorRequestId = (error: unknown): string | undefined => {
  const headersCandidate = readErrorHeadersCandidate(error);

  const headerRequestId =
    readHeaderValue(headersCandidate, "request-id") ??
    readHeaderValue(headersCandidate, "Request-Id") ??
    readHeaderValue(headersCandidate, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const innerError = readErrorInnerError(error);
  const requestId =
    innerError["request-id"] ??
    innerError.requestId ??
    innerError["client-request-id"];

  return typeof requestId === "string" && requestId ? requestId : undefined;
};

/**
 * 读取错误对象上的 `Retry-After` 秒数。
 *
 * 先查响应头，再回退到 `innerError`，同时兼容数字和字符串格式。
 *
 * @param error 原始错误对象。
 * @returns 建议重试秒数；读取不到时返回 `undefined`。
 */
export const readErrorRetryAfterSeconds = (
  error: unknown,
): number | undefined => {
  const headersCandidate = readErrorHeadersCandidate(error);

  const headerValue =
    readHeaderValue(headersCandidate, "Retry-After") ??
    readHeaderValue(headersCandidate, "retry-after");

  if (headerValue) {
    const retryAfterSeconds = Number(headerValue);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds;
    }
  }

  const innerError = readErrorInnerError(error);
  const retryAfter =
    innerError.retryAfter ??
    innerError.retryAfterSeconds ??
    innerError["retry-after"];

  if (typeof retryAfter === "number") {
    return retryAfter;
  }

  if (typeof retryAfter === "string" && retryAfter) {
    const retryAfterSeconds = Number.parseInt(retryAfter, 10);
    return Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds;
  }

  return undefined;
};

/**
 * 尽量从未知错误中提取对调用方友好的 message。
 *
 * 提取顺序是：
 * 1. 原生 `Error.message`
 * 2. 嵌套的 `error.message`
 * 3. 当前对象的 `message`
 * 4. 调用方传入的兜底文案
 *
 * @param error 原始错误对象。
 * @param fallbackMessage 兜底文案。
 * @returns 最终错误文案。
 */
const readErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = readRecord(error);
  const nestedError = readRecord(record.error);
  const nestedMessage = nestedError.message;
  if (typeof nestedMessage === "string" && nestedMessage) {
    return nestedMessage;
  }

  const message = record.message;
  return typeof message === "string" && message ? message : fallbackMessage;
};

/**
 * 为错误文案拼出更自然的“请求标签”。
 *
 * 例如传入 `download preparation` 后，会得到
 * `the download preparation request`。
 *
 * @param operationDescription 业务操作描述。
 * @returns 可拼接进错误文案的请求标签。
 */
const buildGraphOperationRequestLabel = (
  operationDescription?: string,
): string | undefined =>
  operationDescription ? `the ${operationDescription} request` : undefined;

/**
 * 把未知 Graph 异常收口成统一的 `BackendGraphError`。
 *
 * 这个函数的目标不是“保留所有上游细节”，
 * 而是把不同来源、不同结构的 Graph 错误，
 * 归一化成后端其余模块可以稳定消费的错误对象。
 *
 * @param error 原始异常对象。
 * @param options 归一化过程的附加选项。
 * @returns 统一后的 Graph 错误。
 */
export const toBackendGraphError = (
  error: unknown,
  options?: {
    /** 面向调用方的兜底失败文案。 */
    failureMessage?: string;

    /** 当前操作的人类可读描述，用于拼装更自然的错误文案。 */
    operationDescription?: string;
  },
): BackendGraphError => {
  if (error instanceof BackendGraphError) {
    return error;
  }

  // 某些模块可能已经把错误包装成 graph 类 BackendError，这里直接复用，避免重复包裹。
  if (error instanceof BackendError && error.category === "graph") {
    return error as BackendGraphError;
  }

  const statusCode = readErrorStatusCode(error);
  const requestId = readErrorRequestId(error);
  const retryAfterSeconds = readErrorRetryAfterSeconds(error);
  const operationRequestLabel = buildGraphOperationRequestLabel(
    options?.operationDescription,
  );
  const fallbackMessage =
    options?.failureMessage ??
    "The Microsoft Graph request failed after the retry policy completed.";
  const message = readErrorMessage(error, fallbackMessage);

  if (statusCode === 429) {
    return new BackendGraphError(
      "throttled",
      operationRequestLabel
        ? `Microsoft Graph throttled ${operationRequestLabel} after retries were exhausted.`
        : "Microsoft Graph throttled this request after retries were exhausted.",
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  if (statusCode === 503 || statusCode === 504) {
    return new BackendGraphError(
      "serviceUnavailable",
      operationRequestLabel
        ? `Microsoft Graph is temporarily unavailable for ${operationRequestLabel}.`
        : `Microsoft Graph is temporarily unavailable: ${message}`,
      {
        statusCode,
        requestId,
        retryAfterSeconds,
        cause: error,
      },
    );
  }

  // 其他情况统一按一般性 Graph 失败处理，默认回退为 502。
  return new BackendGraphError(
    "graphFailure",
    options?.failureMessage ?? message,
    {
      statusCode: statusCode ?? 502,
      requestId,
      retryAfterSeconds,
      cause: error,
    },
  );
};
