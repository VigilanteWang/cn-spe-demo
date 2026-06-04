import { AppError } from "../../../../common/errors.ts";
import { readRecord } from "./directoryPrincipalSearchObjectUtils";

export type DirectoryPrincipalSearchErrorCode =
  | "emptyQuery"
  | "invalidSearchSyntax"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "graphFailure";

export type DirectoryPrincipalSearchAppError = AppError & {
  code?: DirectoryPrincipalSearchErrorCode;
};

type DirectorySearchErrorCategory = "validation" | "graph";

const DIRECTORY_SEARCH_ERROR_CATEGORIES: Record<
  DirectoryPrincipalSearchErrorCode,
  DirectorySearchErrorCategory
> = {
  emptyQuery: "validation",
  invalidSearchSyntax: "validation",
  unauthorized: "graph",
  forbidden: "graph",
  notFound: "graph",
  graphFailure: "graph",
};

/**
 * 构造目录主体验证或 Graph 搜索错误。
 *
 * 这个模块统一保留稳定的错误 name、code 和 statusCode，
 * 方便上层按 code 做分支处理，也便于把最原始的 Graph 错误留在 originError 里。
 *
 * @param code 稳定错误码。
 * @param message 面向界面和日志的错误说明。
 * @param statusCode 可选 HTTP 状态码。
 * @returns 统一的前端错误对象。
 */
export const buildDirectoryPrincipalSearchError = (
  code: DirectoryPrincipalSearchErrorCode,
  message: string,
  statusCode?: number,
): DirectoryPrincipalSearchAppError =>
  new AppError({
    name: "DirectoryPrincipalSearchError",
    code,
    message,
    statusCode,
    originError: {
      source:
        getDirectorySearchErrorCategory(code) === "validation"
          ? "validation"
          : "microsoft-graph",
    },
  }) as DirectoryPrincipalSearchAppError;

/**
 * 目录搜索错误同时覆盖输入校验和 Graph 请求失败；
 * 因此这里按 code 映射更稳定的错误类别。
 */
const getDirectorySearchErrorCategory = (
  code: DirectoryPrincipalSearchErrorCode,
): DirectorySearchErrorCategory => DIRECTORY_SEARCH_ERROR_CATEGORIES[code];

/**
 * 将 Graph SDK 抛出的 unknown 错误映射为稳定错误对象。
 *
 * 本模块不处理 429 retry loop，因为 Graph SDK / MGT client 已经内置重试；
 * 这里处理的是重试后仍然失败的最终错误。
 *
 * @param error Graph SDK、HTTP 或其他未知错误对象。
 * @returns 可直接向上抛出的统一错误。
 */
export const mapGraphError = (
  error: unknown,
): DirectoryPrincipalSearchAppError => {
  if (error instanceof AppError) {
    return error as DirectoryPrincipalSearchAppError;
  }

  const statusCode = readGraphStatusCode(error);

  if (statusCode === 401) {
    return buildDirectoryPrincipalSearchError(
      "unauthorized",
      "Directory search authentication expired. Please sign in again.",
      statusCode,
    );
  }

  if (statusCode === 403) {
    return buildDirectoryPrincipalSearchError(
      "forbidden",
      "The current account does not have permission to read directory objects.",
      statusCode,
    );
  }

  if (statusCode === 404) {
    return buildDirectoryPrincipalSearchError(
      "notFound",
      "No matching directory principal was found.",
      statusCode,
    );
  }

  return buildDirectoryPrincipalSearchError(
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
