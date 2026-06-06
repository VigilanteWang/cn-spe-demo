import { AppError } from "../../../../../common/appError";
import { readRecord } from "./directoryPrincipalSearchObjectUtils";

export type DirectoryPrincipalSearchErrorCode =
  | "emptyQuery"
  | "invalidSearchSyntax"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "graphFailure";

/**
 * 目录主体搜索专用错误类型。
 *
 * 这里继承统一 `AppError`，把 `code` 收窄为目录搜索可识别的错误码，
 * 方便调用方通过 `instanceof` 和 `code` 双重方式做稳定分支处理。
 */
export class DirectoryPrincipalSearchAppError extends AppError {
  /**
   * 错误码，仅限于本模块定义的 DirectoryPrincipalSearchErrorCode。
   *
   * 使用 `declare`：仅做类型声明以收窄父类 `AppError` 的 `code` 类型，
   * 不在运行时代码中重新声明或初始化该字段，避免在子类构造中覆
   * 盖父类通过 `super(...)` 设置的值（这会导致运行时的意外覆盖）。
   *
   * 使用 `readonly`：在类型层面标记不可变，防止创建后被意外赋值，
   * 保持错误判断分支的稳定性。
   */
  declare readonly code?: DirectoryPrincipalSearchErrorCode;

  constructor(
    code: DirectoryPrincipalSearchErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super({
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
    });
  }
}

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
  if (error instanceof DirectoryPrincipalSearchAppError) {
    return error;
  }

  const statusCode = readGraphStatusCode(error);

  if (statusCode === 401) {
    return new DirectoryPrincipalSearchAppError(
      "unauthorized",
      "Directory search authentication expired. Please sign in again.",
      statusCode,
    );
  }

  if (statusCode === 403) {
    return new DirectoryPrincipalSearchAppError(
      "forbidden",
      "The current account does not have permission to read directory objects.",
      statusCode,
    );
  }

  if (statusCode === 404) {
    return new DirectoryPrincipalSearchAppError(
      "notFound",
      "No matching directory principal was found.",
      statusCode,
    );
  }

  return new DirectoryPrincipalSearchAppError(
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
