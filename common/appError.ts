import type {
  AppErrorShape,
  IOriginErrorInfo,
} from "./contracts/errorContracts";

/**
 * 创建统一错误实例时可传入的完整初始化参数。
 */
export type IAppErrorInit = AppErrorShape;

/**
 * 统一应用错误基类。
 *
 * 前后端所有稳定错误都围绕这一个对象流转，
 * 避免再维护前端/后端两套平行基类。
 */
export class AppError extends Error {
  readonly code?: string;

  readonly statusCode?: number;

  readonly originError?: IOriginErrorInfo;

  readonly cause?: unknown;

  constructor(init: IAppErrorInit) {
    super(init.message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = init.name;
    this.code = init.code;
    this.statusCode = init.statusCode;
    this.originError = init.originError;
    this.cause = init.cause;
  }
}

/**
 * 读取普通对象。
 */
const readRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * 读取字符串值。
 */
const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取数字值，同时兼容数字字符串。
 */
const readNumberLike = (value: unknown): number | undefined => {
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
 * 收集错误对象上可能承载响应头的容器。
 */
const readErrorHeaderCandidates = (error: unknown): unknown[] => {
  const record = readRecord(error);
  const responseRecord = readRecord(record.response);
  const bodyRecord = readRecord(record.body);

  return [
    record.headers,
    responseRecord.headers,
    record.responseHeaders,
    bodyRecord.headers,
  ].filter((candidate): candidate is unknown => candidate !== undefined);
};

/**
 * 按优先级从错误对象承载的 headers 候选里读取指定响应头。
 */
const readHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  for (const headersCandidate of readErrorHeaderCandidates(error)) {
    const headersRecord = readRecord(headersCandidate);
    const directValue = headersRecord[headerName];

    if (typeof directValue === "string" && directValue) {
      return directValue;
    }

    const getCandidate = headersRecord.get;
    if (typeof getCandidate === "function") {
      const value = getCandidate.call(headersCandidate, headerName);
      if (typeof value === "string" && value) {
        return value;
      }
    }
  }

  return undefined;
};

/**
 * 尽量收窄出 Graph 风格的错误对象。
 */
const readGraphErrorRecord = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const body = readRecord(record.body);
  const bodyError = readRecord(body.error);
  const directError = readRecord(record.error);

  if (Object.keys(bodyError).length > 0) {
    return bodyError;
  }

  if (Object.keys(directError).length > 0) {
    return directError;
  }

  return {};
};

/**
 * 提取 Graph 错误对象里的 `innerError / innererror`。
 */
const readErrorInnerError = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);
  const body = readRecord(record.body);
  const bodyError = readRecord(body.error);
  const directError = readRecord(record.error);
  const candidates = [
    readRecord(bodyError.innerError),
    readRecord(bodyError.innererror),
    readRecord(body.innerError),
    readRecord(body.innererror),
    readRecord(directError.innerError),
    readRecord(directError.innererror),
  ];

  return (
    candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
  );
};

/**
 * 读取错误对象上的 HTTP 状态码。
 */
export const readErrorStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const innerError = readErrorInnerError(error);

  return (
    readNumberLike(record.statusCode) ??
    readNumberLike(record.status) ??
    readNumberLike(readRecord(record.response).status) ??
    readNumberLike(innerError.status)
  );
};

/**
 * 读取错误对象上的请求 ID。
 */
export const readErrorRequestId = (error: unknown): string | undefined => {
  const headerRequestId =
    readHeaderValue(error, "request-id") ??
    readHeaderValue(error, "Request-Id") ??
    readHeaderValue(error, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const record = readRecord(error);
  const innerError = readErrorInnerError(error);
  return (
    readString(record.requestId) ??
    readString(innerError["request-id"]) ??
    readString(innerError.requestId) ??
    readString(innerError["client-request-id"])
  );
};

/**
 * 读取错误对象上的 `Retry-After` 秒数。
 *
 * 统一只从响应头读取，不再从 body 或 innerError 兜底。
 */
export const readErrorRetryAfter = (error: unknown): number | undefined => {
  const headerValue =
    readHeaderValue(error, "Retry-After") ??
    readHeaderValue(error, "retry-after");

  return readNumberLike(headerValue);
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

  const graphError = readGraphErrorRecord(error);
  const graphMessage = readString(graphError.message);
  if (graphMessage) {
    return graphMessage;
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
 * 将原始错误码链按“外层 -> 内层”顺序收集出来。
 */
const readGraphCodePath = (error: unknown): string[] | undefined => {
  const codePath: string[] = [];
  let cursor: Record<string, unknown> | undefined = readGraphErrorRecord(error);

  while (cursor && Object.keys(cursor).length > 0) {
    const code = readString(cursor.code);
    if (code) {
      codePath.push(code);
    }

    const nextCursor: Record<string, unknown> =
      readRecord(cursor.innerError).code !== undefined ||
      Object.keys(readRecord(cursor.innerError)).length > 0
        ? readRecord(cursor.innerError)
        : readRecord(cursor.innererror);

    cursor = Object.keys(nextCursor).length > 0 ? nextCursor : undefined;
  }

  return codePath.length > 0 ? codePath : undefined;
};

/**
 * 将 headers 候选尽量转换为可序列化对象。
 */
const serializeHeadersCandidate = (
  headersCandidate: unknown,
): Record<string, string> | undefined => {
  if (typeof Headers !== "undefined" && headersCandidate instanceof Headers) {
    const nextHeaders: Record<string, string> = {};
    headersCandidate.forEach((value, key) => {
      nextHeaders[key] = value;
    });
    return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
  }

  const headersRecord = readRecord(headersCandidate);
  const keys = Object.keys(headersRecord).filter(
    (key) => typeof headersRecord[key] === "string",
  );

  if (keys.length > 0) {
    const nextHeaders: Record<string, string> = {};
    for (const key of keys) {
      nextHeaders[key] = headersRecord[key] as string;
    }
    return nextHeaders;
  }

  const knownHeaders = [
    "Retry-After",
    "retry-after",
    "request-id",
    "Request-Id",
    "client-request-id",
  ];
  const getCandidate = headersRecord.get;

  if (typeof getCandidate === "function") {
    const nextHeaders: Record<string, string> = {};
    for (const headerName of knownHeaders) {
      const value = getCandidate.call(headersCandidate, headerName);
      if (typeof value === "string" && value) {
        nextHeaders[headerName] = value;
      }
    }
    return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
  }

  return undefined;
};

/**
 * 以最佳努力方式序列化任意 `cause`。
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
 * 构造 Graph 原始错误快照。
 */
const buildGraphRawSnapshot = (error: unknown): Record<string, unknown> => {
  const serializedError = serializeUnknownCause(error);
  const errorRecord =
    typeof serializedError === "object" && serializedError !== null
      ? (serializedError as Record<string, unknown>)
      : {};

  const record = readRecord(error);
  const headers =
    readErrorHeaderCandidates(error)
      .map((candidate) => serializeHeadersCandidate(candidate))
      .find((candidate) => candidate !== undefined) ?? undefined;

  const rawSnapshot: Record<string, unknown> = {
    ...errorRecord,
  };

  const name =
    readString(record.name) ??
    (error instanceof Error && error.name ? error.name : undefined);
  if (name) {
    rawSnapshot.name = name;
  }

  const message = readErrorMessage(error, "Unknown Microsoft Graph error.");
  if (message) {
    rawSnapshot.message = message;
  }

  const statusCode = readErrorStatusCode(error);
  if (statusCode !== undefined) {
    rawSnapshot.statusCode = statusCode;
  }

  const graphCode = readGraphCodePath(error)?.[0];
  if (graphCode) {
    rawSnapshot.code = graphCode;
  }

  const requestId = readErrorRequestId(error);
  if (requestId) {
    rawSnapshot.requestId = requestId;
  }

  const date =
    readRecord(error).date ?? readErrorInnerError(error).date ?? undefined;
  if (date !== undefined) {
    rawSnapshot.date = serializeUnknownCause(date);
  }

  if (record.body !== undefined) {
    rawSnapshot.body = serializeUnknownCause(record.body);
  }

  if (headers) {
    rawSnapshot.headers = headers;
  }

  return rawSnapshot;
};

/**
 * 从未知错误中提取 Graph 调试信息。
 */
export const extractGraphOriginError = (
  error: unknown,
): IOriginErrorInfo | undefined => {
  const codePath = readGraphCodePath(error);
  const requestId = readErrorRequestId(error);
  const retryAfter = readErrorRetryAfter(error);
  const graphRecord = readGraphErrorRecord(error);
  const innerError = readErrorInnerError(error);
  const name =
    error instanceof Error ? error.name : readString(readRecord(error).name);

  const looksLikeGraphError =
    (codePath && codePath.length > 0) ||
    requestId !== undefined ||
    Object.keys(graphRecord).length > 0 ||
    Object.keys(innerError).length > 0 ||
    name === "GraphError" ||
    readRecord(error).body !== undefined;

  if (!looksLikeGraphError) {
    return undefined;
  }

  return {
    source: "microsoft-graph",
    raw: buildGraphRawSnapshot(error),
    codePath,
    requestId,
    retryAfter,
  };
};

/**
 * 将未知错误收口为统一 `AppError`。
 */
export const toAppError = (
  error: unknown,
  options: {
    defaultName: string;
    defaultMessage: string;
    defaultCode?: string;
    defaultStatusCode?: number;
    originError?: IOriginErrorInfo;
    cause?: unknown;
  },
): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  const statusCode = readErrorStatusCode(error) ?? options.defaultStatusCode;
  const originError = options.originError ?? extractGraphOriginError(error);

  return new AppError({
    name: options.defaultName,
    code: options.defaultCode ?? readString(readRecord(error).code),
    message: readErrorMessage(error, options.defaultMessage),
    statusCode,
    originError,
    cause: options.cause ?? error,
  });
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
          raw: serializeUnknownCause(error.originError.raw),
        },
  cause: serializeUnknownCause(error.cause),
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
    cause: error.cause,
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
