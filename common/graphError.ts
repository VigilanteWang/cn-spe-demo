import {
  AppError,
  ensureErrorCause,
  readErrorMessage,
  readNumberLike,
  readRecord,
  readString,
  serializeUnknownValue,
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
  // Graph SDK 抛出的错误通常会把响应头挂在 `error.headers` 上，
  // 所以先从外层错误对象里拿这个候选值，再决定按哪种形态读取。
  const headersCandidate = readRecord(error).headers;

  // 优先兼容“像 Headers 一样带有 get 方法”的对象；
  // 这能覆盖真实 `Headers` 实例，也能覆盖测试里常见的最小 mock。
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

  // 如果运行时里真的拿到标准 `Headers`，就按官方 API 再读一次。
  // 这一层和上面的 duck typing 重叠，但能把“真实类型”路径写得更明确。
  if (typeof Headers !== "undefined" && headersCandidate instanceof Headers) {
    const value = headersCandidate.get(headerName);
    return typeof value === "string" && value ? value : undefined;
  }

  // 最后再兜底普通对象形态，兼容少量直接写成
  // `{ "Retry-After": "12" }` 这种 header mock。
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
  // 先把 unknown 收口成普通对象，后续读取 `body` 时就不用到处判空。
  const record = readRecord(error);

  // 有些运行时/测试会把 body 存成 JSON 字符串；
  // 这里先尝试解析，失败就把它当成“没有可读 body”，避免抛出二次异常。
  if (typeof record.body === "string" && record.body) {
    try {
      return readRecord(JSON.parse(record.body) as unknown);
    } catch {
      return {};
    }
  }

  // 其余情况按“body 已经是对象”处理；不是对象时 `readRecord` 会回空对象。
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
  // `innerError` 是 Graph 规范错误体里继续往下挖诊断信息的标准入口。
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
  // 这里只认外层 `statusCode`，避免把业务错误体里的其他数字误当成 HTTP 状态。
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
  // 先读标准大小写，再兼容小写 header，避免不同环境下的大小写差异导致丢信息。
  const headerValue =
    readGraphHeaderValue(error, "Retry-After") ??
    readGraphHeaderValue(error, "retry-after");

  // 最终统一转成 number，方便上层直接做退避或展示。
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
  // 对真正的 Error 实例，优先相信它已经整理好的 `message`。
  if (error instanceof Error && error.message) {
    return error.message;
  }

  // 非 Error 值再回退到 Graph body 里找服务端 message，
  // 这样像 `{ body: "{...}" }` 这种输入也能读到可展示文案。
  const graphError = readGraphBodyRecord(error);
  const graphMessage = readString(graphError.message);
  if (graphMessage) {
    return graphMessage;
  }

  // 最后回退到通用错误读取逻辑，保证一定有稳定文案返回。
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
  // 从最外层 body 开始，后面沿着 `innerError` 一层层往下走。
  let cursor: Record<string, unknown> | undefined = readGraphBodyRecord(error);

  // 只要当前层还是非空对象，就继续尝试收集 code 并推进到下一层。
  while (cursor && Object.keys(cursor).length > 0) {
    const code = readString(cursor.code);
    if (code) {
      codePath.push(code);
    }

    // Graph 的规范嵌套链路只有 `innerError`，这里不额外猜别的字段名。
    const nextCursor = readRecord(cursor.innerError);
    cursor = Object.keys(nextCursor).length > 0 ? nextCursor : undefined;
  }

  // 没读到任何 code 时返回 undefined，而不是空数组，方便上层用“有无值”判断。
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
export const buildGraphCauseSnapshot = (
  error: unknown,
): Record<string, unknown> => {
  // 先把原始异常尽量序列化成“纯数据”，避免后面把函数、循环引用、
  // 原型方法等不稳定内容直接塞进快照里。
  const serializedError = serializeUnknownValue(error);
  // `serializeUnknownValue` 的返回值可能是原始值、数组或对象；
  // 这里只有对象才能作为快照底稿展开，其它情况统一退回空对象。
  const errorRecord =
    typeof serializedError === "object" && serializedError !== null
      ? (serializedError as Record<string, unknown>)
      : {};

  // 这里重新读取“原始错误对象视图”，是为了继续按字段做结构化提取。
  // `serializedError` 负责“可序列化”，`record` 负责“可按属性安全读取”，
  // 两者职责不同，所以这里保留一份原始对象入口更清晰。
  const record = readRecord(error);
  // headers 需要单独拍平成字符串字典，避免把 `Headers` 实例或 mock 原样带出去。
  const headers = serializeGraphHeadersCandidate(record.headers);

  // 先以序列化后的原始错误为底稿，尽量保留已有上下文。
  const causeSnapshot: Record<string, unknown> = {
    ...errorRecord,
  };

  // name 优先读原始字段；如果输入本身就是 Error，再回退到 Error.name。
  const name =
    readString(record.name) ??
    (error instanceof Error && error.name ? error.name : undefined);
  if (name) {
    causeSnapshot.name = name;
  }

  // message 统一走 Graph 专用读取逻辑，优先拿到对业务更有意义的文案。
  const message = readGraphErrorMessage(
    error,
    "Unknown Microsoft Graph error.",
  );
  if (message) {
    causeSnapshot.message = message;
  }

  // statusCode 只保留可解析的 HTTP 状态码，方便后续排查 Graph 响应失败原因。
  const statusCode = readGraphStatusCode(error);
  if (statusCode !== undefined) {
    causeSnapshot.statusCode = statusCode;
  }

  // Graph 错误码链里最外层的 code 通常最适合作为本次错误的主 code。
  const graphCode = readGraphCodePath(error)?.[0];
  if (graphCode) {
    causeSnapshot.code = graphCode;
  }

  // date 优先取外层错误对象，其次回退到 Graph `innerError.date`，
  // 再序列化后写入快照，保证值可以稳定跨层传输。
  const outerDate = record.date;
  const innerDate = readGraphInnerError(error).date;
  const dateCandidate =
    outerDate instanceof Date
      ? outerDate
      : typeof outerDate === "string" && outerDate
        ? outerDate
        : innerDate instanceof Date
          ? innerDate
          : typeof innerDate === "string" && innerDate
            ? innerDate
            : undefined;
  if (dateCandidate !== undefined) {
    causeSnapshot.date = serializeUnknownValue(dateCandidate);
  }

  // body 是 Graph 返回的原始负载，单独保留有助于还原服务端真实响应。
  if (record.body !== undefined) {
    causeSnapshot.body = serializeUnknownValue(record.body);
  }

  // 只有成功提取到稳定 headers 时才写入，避免制造空壳字段。
  if (headers) {
    causeSnapshot.headers = headers;
  }

  // 最终返回的是一个纯数据快照，专门给 `originError.cause` 挂载使用。
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
  // 先把后面要复用的 Graph 诊断片段统一读出来，避免分支里重复解析 body / headers。
  const codePath = readGraphCodePath(error);
  const retryAfter = readGraphRetryAfter(error);
  const graphRecord = readGraphBodyRecord(error);
  const innerError = readGraphInnerError(error);
  const name =
    error instanceof Error ? error.name : readString(readRecord(error).name);

  // 这里做的是“像不像 Graph 错误”的启发式判断，而不是严格类型校验。
  // 只要命中任一 Graph 特征，就值得把它标记成 microsoft-graph 来源并保留诊断信息。
  const looksLikeGraphError =
    (codePath && codePath.length > 0) ||
    retryAfter !== undefined ||
    Object.keys(graphRecord).length > 0 ||
    Object.keys(innerError).length > 0 ||
    name === "GraphError" ||
    readRecord(error).body !== undefined;

  // 如果完全看不出 Graph 痕迹，就交给上层走普通错误路径，避免误标来源。
  if (!looksLikeGraphError) {
    return undefined;
  }

  // 一旦确认像 Graph 错误，就把原始异常包装成稳定 `cause`，
  // 同时把 Graph 专属诊断字段单独挂出来，方便后续 HTTP 序列化和日志消费。
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
  // 已经是统一 AppError 时直接复用，避免重复包裹导致信息被覆盖。
  if (error instanceof AppError) {
    return error;
  }

  // 优先尝试抽出 Graph 专属诊断；如果抽不出来，也至少保留一个稳定的 `cause`。
  const originError = extractGraphOriginError(error, failureMessage) ?? {
    source: "microsoft-graph" as const,
    cause: ensureErrorCause(error, failureMessage, "GraphError"),
  };

  // 这里把未知 Graph 失败统一收口成仓库里的 `AppError` 契约，
  // 让后端响应、前端消费和测试断言都围绕同一种错误模型工作。
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
    // 成功路径完全透传原始结果，不在这里引入额外包装。
    return await operation();
  } catch (error: unknown) {
    // 只有失败路径才统一映射成 `GraphError` 风格的 `AppError`。
    throw toGraphAppError(error, failureMessage, defaultStatusCode);
  }
};
