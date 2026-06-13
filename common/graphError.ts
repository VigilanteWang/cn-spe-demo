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
 *
 * @param error 任意待分析的 Graph 异常值。
 * @param headerName 目标响应头名称。
 * @returns 命中时返回非空字符串值，否则返回 undefined。
 */
const readGraphHeaderValue = (
  error: unknown,
  headerName: string,
): string | undefined => {
  const headersCandidate = readRecord(error).headers;

  if (
    typeof headersCandidate === "object" &&
    headersCandidate !== null &&
    "get" in headersCandidate &&
    typeof (headersCandidate as { get: unknown }).get === "function"
  ) {
    const value = (
      headersCandidate as {
        get: (name: string) => string | null | undefined;
      }
    ).get(headerName);
    return typeof value === "string" && value ? value : undefined;
  }

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
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns 解析后的 body 对象；无法解析时返回空对象。
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
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns `innerError` 对应的对象；缺失时返回空对象。
 */
const readGraphInnerError = (error: unknown): Record<string, unknown> =>
  readRecord(readGraphBodyRecord(error).innerError);

/**
 * 读取 Graph 错误对应的 HTTP 状态码。
 *
 * Microsoft Graph SDK 会把 `rawResponse.status`
 * 放到 `GraphError.statusCode`，因此这里只信任外层错误对象，
 * 不从 `body` / `innerError` 里反推 HTTP 状态。
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns 可解析的 HTTP 状态码；缺失时返回 undefined。
 */
export const readGraphStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  return readNumberLike(record.statusCode);
};

/**
 * 读取 Graph 错误里的 `Retry-After` 秒数。
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns 可解析的秒数；缺失时返回 undefined。
 */
export const readGraphRetryAfter = (error: unknown): number | undefined => {
  const headerValue =
    readGraphHeaderValue(error, "Retry-After") ??
    readGraphHeaderValue(error, "retry-after");

  return readNumberLike(headerValue);
};

/**
 * 读取 Graph 错误的可展示 message。
 *
 * @param error 任意待分析的 Graph 异常值。
 * @param fallbackMessage 当无法提取 message 时使用的兜底文案。
 * @returns 最适合展示或记录的错误文案。
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
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns 按外层到内层排列的错误码链；没有可读错误码时返回 undefined。
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
 *
 * `fetch` / Graph SDK 的 `Headers` 运行时值最终暴露的是字符串视图，
 * 这里优先保留这条主路径，再把结果拷贝成稳定的普通对象快照。
 *
 * @param headersCandidate 任意待序列化的 headers 候选值。
 * @returns 仅包含字符串值的普通对象；无法提取有效字段时返回 undefined。
 */
const serializeGraphHeadersCandidate = (
  headersCandidate: unknown,
): Record<string, string> | undefined => {
  // 运行时里的主路径是 fetch `Headers`；如果当前值真的是它，
  // 就按标准 API 逐项读取，而不是猜测内部实现细节。
  if (typeof Headers !== "undefined" && headersCandidate instanceof Headers) {
    const nextHeaders: Record<string, string> = {};
    // `Headers` 自身带有原型方法，直接放进错误快照既不稳定，
    // 也不利于后续 JSON 序列化、日志记录和跨层传输。
    // 这里把它拍平成最朴素的 `{ [headerName]: value }` 对象。
    headersCandidate.forEach((value, key) => {
      nextHeaders[key] = value;
    });
    // 如果一个 header 都没读到，就把“空 headers”当成“没有可记录信息”，
    // 返回 undefined，让上层决定不写入 `causeSnapshot.headers`。
    return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
  }

  // fallback 分支面向测试桩、历史 mock，或其他已经是普通对象的输入。
  // 先用 `readRecord` 把 unknown 安全收口：不是对象就会得到空对象。
  const headersRecord = readRecord(headersCandidate);
  // 这里只保留字符串值，因为这个函数的职责是产出
  // `Record<string, string>` 形式的“header 快照”。
  // 对 fetch / Graph SDK 而言，header 的公开读取视图本来就是字符串；
  // 数组、对象等值通常说明这不是标准 `Headers` 形态，或只是某种自定义 mock。
  const keys = Object.keys(headersRecord).filter(
    (key) => typeof headersRecord[key] === "string",
  );

  if (keys.length > 0) {
    const nextHeaders: Record<string, string> = {};
    // 这里不直接返回 `headersRecord`，而是重新拷贝一份干净对象，
    // 明确保证返回结果只包含经过筛选的字符串字段。
    for (const key of keys) {
      nextHeaders[key] = headersRecord[key] as string;
    }
    // 理论上此时对象一定非空；保留这个返回模式是为了与上面的 `Headers`
    // 分支保持一致：只有真正提取到可记录 header 时才返回对象。
    return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
  }

  // 走到这里说明输入既不是可遍历的 `Headers`，
  // 也不是含有字符串值的普通对象，当前快照里就不记录 headers。
  return undefined;
};

/**
 * 构造可序列化的 Graph 原始异常快照。
 *
 * @param error 任意待分析的 Graph 异常值。
 * @returns 适合挂入 `originError.cause` 的纯数据快照。
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
 *
 * @param error 任意待分析的异常值。
 * @param fallbackMessage 当原始错误缺少 message 时使用的兜底文案。
 * @returns 命中 Graph 错误特征时返回调试信息，否则返回 undefined。
 */
export const extractGraphOriginError = (
  error: unknown,
  fallbackMessage = "Unknown Microsoft Graph error.",
): IOriginError | undefined => {
  const codePath = readGraphCodePath(error);
  const retryAfter = readGraphRetryAfter(error);
  const graphRecord = readGraphBodyRecord(error);
  const innerError = readGraphInnerError(error);
  const name =
    error instanceof Error ? error.name : readString(readRecord(error).name);

  const looksLikeGraphError =
    (codePath && codePath.length > 0) ||
    retryAfter !== undefined ||
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
    retryAfter,
  };
};

/**
 * 将未知 Graph 错误收口为统一 `AppError`。
 *
 * @param error 任意待转换的异常值。
 * @param failureMessage 统一错误文案。
 * @param defaultStatusCode 当原始错误缺少状态码时使用的默认值。
 * @param options 附加错误元信息。
 * @returns 统一后的 `AppError` 实例。
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
 *
 * @param operation 真正发起 Graph 请求的异步操作。
 * @param failureMessage 调用失败时使用的统一错误文案。
 * @param defaultStatusCode 当原始错误缺少状态码时使用的默认值。
 * @returns 成功时返回原操作结果；失败时抛出统一 `AppError`。
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
