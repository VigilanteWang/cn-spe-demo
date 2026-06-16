import { AppError } from "../../../../../common/appError";
import { toGraphAppError } from "../../../../../common/graphError";

export type DirectoryPrincipalSearchErrorCode =
  | "emptyQuery"
  | "invalidSearchSyntax"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "graphFailure";

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
 * 目录搜索错误同时覆盖输入校验和 Graph 请求失败，
 * 因此这里按 code 映射更稳定的错误类别。
 */
const getDirectorySearchErrorCategory = (
  code: DirectoryPrincipalSearchErrorCode,
): DirectorySearchErrorCategory => DIRECTORY_SEARCH_ERROR_CATEGORIES[code];

/**
 * 创建目录主体搜索稳定错误对象。
 *
 * issue #15 要求目录搜索调用方直接依赖 plain `AppError`，
 * 不再额外包一层仅改名的错误子类。
 */
export const createDirectoryPrincipalSearchError = (
  code: DirectoryPrincipalSearchErrorCode,
  message: string,
  statusCode?: number,
  originError?: AppError["originError"],
): AppError =>
  new AppError({
    name: "DirectoryPrincipalSearchError",
    code,
    message,
    statusCode,
    originError: originError ?? {
      source:
        getDirectorySearchErrorCategory(code) === "validation"
          ? "validation"
          : "microsoft-graph",
    },
  });

/**
 * 将 Graph SDK 抛出的 unknown 错误映射为稳定错误对象。
 *
 * 本模块不处理 429 retry loop，因为 Graph SDK / MGT client 已经内置重试；
 * 这里处理的是重试后仍然失败的最终错误。
 */
export const mapGraphError = (error: unknown): AppError => {
  if (
    error instanceof AppError &&
    error.name === "DirectoryPrincipalSearchError"
  ) {
    return error;
  }

  const graphError = toGraphAppError(
    error,
    "The request still failed after the SDK retry policy completed.",
  );
  const statusCode = graphError.statusCode;

  if (statusCode === 401) {
    return createDirectoryPrincipalSearchError(
      "unauthorized",
      "Directory search authentication expired. Please sign in again.",
      statusCode,
      graphError.originError,
    );
  }

  if (statusCode === 403) {
    return createDirectoryPrincipalSearchError(
      "forbidden",
      "The current account does not have permission to read directory objects.",
      statusCode,
      graphError.originError,
    );
  }

  if (statusCode === 404) {
    return createDirectoryPrincipalSearchError(
      "notFound",
      "No matching directory principal was found.",
      statusCode,
      graphError.originError,
    );
  }

  return createDirectoryPrincipalSearchError(
    "graphFailure",
    `Microsoft Graph directory search failed: ${graphError.message}`,
    statusCode,
    graphError.originError,
  );
};
