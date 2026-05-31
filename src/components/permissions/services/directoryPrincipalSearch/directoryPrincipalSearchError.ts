import { FrontendErrorBase } from "../../../../common/errors.ts";
import { readRecord } from "./directoryPrincipalSearchObjectUtils";

/**
 * Graph 搜索失败时抛出的业务化错误。
 *
 * message 统一使用英文，便于和 Microsoft Graph / SDK 原始错误放在一起排查；
 * code 保持稳定，方便 UI 做本地化或分支处理。
 */
export class DirectoryPrincipalSearchError extends FrontendErrorBase {
  constructor(code: string, message: string, statusCode?: number) {
    super({
      name: "DirectoryPrincipalSearchError",
      category: getDirectorySearchErrorCategory(code),
      source: getDirectorySearchErrorSource(code),
      code,
      message,
      statusCode,
    });
  }
}

/**
 * 目录搜索错误同时覆盖输入校验和 Graph 请求失败，
 * 因此这里按 code 映射成更稳定的错误类别。
 */
const getDirectorySearchErrorCategory = (code: string) => {
  if (code === "emptyQuery" || code === "invalidSearchSyntax") {
    return "validation" as const;
  }

  return "graph" as const;
};

/**
 * 为目录搜索错误推导稳定来源。
 */
const getDirectorySearchErrorSource = (code: string) => {
  if (code === "emptyQuery" || code === "invalidSearchSyntax") {
    return "frontend" as const;
  }

  return "graph" as const;
};

/**
 * 把 Graph SDK 抛出的 unknown 错误映射为本模块的稳定错误类型。
 *
 * 本模块不手写 429 retry loop，因为 Graph SDK/MGT client 已经有 RetryHandler；
 * 这里处理的是 SDK 重试之后仍然失败的最终错误。
 */
export const mapGraphError = (
  error: unknown,
): DirectoryPrincipalSearchError => {
  if (error instanceof DirectoryPrincipalSearchError) {
    return error;
  }

  const statusCode = readGraphStatusCode(error);

  if (statusCode === 401) {
    return new DirectoryPrincipalSearchError(
      "unauthorized",
      "Directory search authentication expired. Please sign in again.",
      statusCode,
    );
  }

  if (statusCode === 403) {
    return new DirectoryPrincipalSearchError(
      "forbidden",
      "The current account does not have permission to read directory objects.",
      statusCode,
    );
  }

  if (statusCode === 404) {
    return new DirectoryPrincipalSearchError(
      "notFound",
      "No matching directory principal was found.",
      statusCode,
    );
  }

  return new DirectoryPrincipalSearchError(
    "graphFailure",
    `Microsoft Graph directory search failed: ${readGraphErrorMessage(error)}`,
    statusCode,
  );
};

/**
 * 从不同形状的 Graph/SDK 错误对象中读取 HTTP 状态码。
 */
const readGraphStatusCode = (error: unknown): number | undefined => {
  const record = readRecord(error);
  const statusCode = record.statusCode ?? record.status;

  return typeof statusCode === "number" ? statusCode : undefined;
};

/**
 * 读取原始错误信息，保留 SDK 重试耗尽后的英文细节。
 */
const readGraphErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const record = readRecord(error);
  const message = record.message;

  return typeof message === "string" && message
    ? message
    : "The request still failed after the SDK retry policy completed.";
};
