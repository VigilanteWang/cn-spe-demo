import {
  AppError,
  ensureErrorCause,
  readErrorMessage,
  readNumberLike,
  readRecord,
  readString,
  serializeUnknownCause,
} from "./appError";
import type { IOriginError } from "./contracts/errorContracts";

/**
 * 按优先级从 Graph 错误承载的响应头中读取指定字段。
 */
const readGraphHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  const headersCandidate = readRecord(error).headers;
  if (typeof Headers !== "undefined" && headersCandidate instanceof Headers) {
    const value = headersCandidate.get(headerName);
    return typeof value === "string" && value ? value : undefined;
  }

  const directValue = readRecord(headersCandidate)[headerName];

  if (typeof directValue === "string" && directValue) {
    return directValue;
  }

  return undefined;
};

/**
 * 读取 GraphError 的原始 body。
 *
 * 当前仓库运行时里，`error.body` 可能已经是
 * `{ code, message, innerError }` 结构本身，
 * 也可能是同结构的 JSON 字符串。
 */
const readGraphBodyRecord = (error: unknown): Record<string, unknown> => {
  const record = readRecord(error);

  if (typeof record.body === "string" && record.body) {
    try {
      return readRecord(JSON.parse(record.body) as unknown);
    } catch {
      return {};
    }
  }

  return readRecord(record.body);
};

/**
 * 读取 Graph 错误对象中的 `innerError`。
 *
 * 这里仅沿用官方结构里的 `innerError`，
 * 不再为 `innererror` 等大小写变体增加额外分支。
 */
const readGraphInnerError = (error: unknown): Record<string, unknown> =>
  readRecord(readGraphBodyRecord(error).innerError);

/**
 * 读取 Graph 错误对应的 HTTP 状态码。
 */
export const readGraphStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const innerError = readGraphInnerError(error);

  return readNumberLike(record.statusCode) ?? readNumberLike(innerError.status);
};

/**
 * 读取 Graph 错误里的请求 ID。
 *
 * SDK 会把 `request-id` 处理成 `requestId`，
 * 这里优先读取头部，再读取实例字段，最后回退到原始 `innerError`。
 */
export const readGraphRequestId = (error: unknown): string | undefined => {
  const headerRequestId =
    readGraphHeaderValue(error, "request-id") ??
    readGraphHeaderValue(error, "client-request-id");

  if (headerRequestId) {
    return headerRequestId;
  }

  const record = readRecord(error);
  return (
    readString(record.requestId) ??
    readString(readGraphInnerError(error)["request-id"])
  );
};

/**
 * 读取 Graph 错误里的 `Retry-After` 秒数。
 */
export const readGraphRetryAfter = (error: unknown): number | undefined => {
  const headerValue =
    readGraphHeaderValue(error, "Retry-After") ??
    readGraphHeaderValue(error, "retry-after");

  return readNumberLike(headerValue);
};

/**
 * 读取 Graph 错误的可展示 message。
 */
export const readGraphErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const graphError = readGraphBodyRecord(error);
  const graphMessage = readString(graphError.message);
  if (graphMessage) {
    return graphMessage;
  }

  return readErrorMessage(error, fallbackMessage);
};

/**
 * 将 Graph 原始错误码链按“外层 -> 内层”顺序收集出来。
 *
 * 这里只沿着 `innerError` 一条规范链路继续向下读取。
 */
export const readGraphCodePath = (error: unknown): string[] | undefined => {
  const codePath: string[] = [];
  let cursor: Record<string, unknown> | undefined = readGraphBodyRecord(error);

  while (cursor && Object.keys(cursor).length > 0) {
    const code = readString(cursor.code);
    if (code) {
      codePath.push(code);
    }

    const nextCursor = readRecord(cursor.innerError);
    cursor = Object.keys(nextCursor).length > 0 ? nextCursor : undefined;
  }

  return codePath.length > 0 ? codePath : undefined;
};

/**
 * 将 headers 候选尽量转换为可序列化对象。
 */
const serializeGraphHeadersCandidate = (
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
    return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
  }

  return undefined;
};

/**
 * 构造可序列化的 Graph 原始异常快照。
 */
const buildGraphCauseSnapshot = (error: unknown): Record<string, unknown> => {
  const serializedError = serializeUnknownCause(error);
  const errorRecord =
    typeof serializedError === "object" && serializedError !== null
      ? (serializedError as Record<string, unknown>)
      : {};

  const record = readRecord(error);
  const headers = serializeGraphHeadersCandidate(record.headers);

  const causeSnapshot: Record<string, unknown> = {
    ...errorRecord,
  };

  const name =
    readString(record.name) ??
    (error instanceof Error && error.name ? error.name : undefined);
  if (name) {
    causeSnapshot.name = name;
  }

  const message = readGraphErrorMessage(
    error,
    "Unknown Microsoft Graph error.",
  );
  if (message) {
    causeSnapshot.message = message;
  }

  const statusCode = readGraphStatusCode(error);
  if (statusCode !== undefined) {
    causeSnapshot.statusCode = statusCode;
  }

  const graphCode = readGraphCodePath(error)?.[0];
  if (graphCode) {
    causeSnapshot.code = graphCode;
  }

  const requestId = readGraphRequestId(error);
  if (requestId) {
    causeSnapshot.requestId = requestId;
  }

  const date =
    readRecord(error).date ?? readGraphInnerError(error).date ?? undefined;
  if (date !== undefined) {
    causeSnapshot.date = serializeUnknownCause(date);
  }

  if (record.body !== undefined) {
    causeSnapshot.body = serializeUnknownCause(record.body);
  }

  if (headers) {
    causeSnapshot.headers = headers;
  }

  return causeSnapshot;
};

/**
 * 从未知错误中提取 Graph 调试信息。
 */
export const extractGraphOriginError = (
  error: unknown,
  fallbackMessage = "Unknown Microsoft Graph error.",
): IOriginError | undefined => {
  const codePath = readGraphCodePath(error);
  const requestId = readGraphRequestId(error);
  const retryAfter = readGraphRetryAfter(error);
  const graphRecord = readGraphBodyRecord(error);
  const innerError = readGraphInnerError(error);
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
    cause: ensureErrorCause(
      error instanceof Error ? error : buildGraphCauseSnapshot(error),
      readGraphErrorMessage(error, fallbackMessage),
      "GraphError",
    ),
    codePath,
    requestId,
    retryAfter,
  };
};

/**
 * 将未知 Graph 错误收口为统一 `AppError`。
 */
export const toGraphAppError = (
  error: unknown,
  failureMessage: string,
  defaultStatusCode = 502,
  options?: {
    details?: unknown[];
  },
): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  const originError = extractGraphOriginError(error, failureMessage) ?? {
    source: "microsoft-graph" as const,
    cause: ensureErrorCause(error, failureMessage, "GraphError"),
  };

  return new AppError({
    name: "GraphError",
    code: readString(readRecord(error).code) ?? originError.codePath?.[0],
    message: readGraphErrorMessage(error, failureMessage),
    statusCode: readGraphStatusCode(error) ?? defaultStatusCode,
    originError,
    details: options?.details,
  });
};

/**
 * 执行一次真正的 Graph / SDK 调用，并在失败时统一收口成 `GraphError`。
 */
export const sendGraphRequest = async <T>(
  operation: () => Promise<T>,
  failureMessage: string,
  defaultStatusCode = 502,
): Promise<T> => {
  try {
    return await operation();
  } catch (error: unknown) {
    throw toGraphAppError(error, failureMessage, defaultStatusCode);
  }
};
