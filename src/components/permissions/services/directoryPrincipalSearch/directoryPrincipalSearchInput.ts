import { DirectoryPrincipalSearchAppError } from "./directoryPrincipalSearchError";

/**
 * 这是个 目录搜索输入进行规范化与识别 工具模块
 * 它把 GUID、email、前缀和搜索文本分别识别出来，供后续搜索计划选择不同策略。
 */

/**
 * 规范化输入：去掉首尾空白、把连续空白压成一个空格，并统一转成小写。
 * 它只用于 cache key 和策略判定，不直接用于真正的 Graph 请求。
 */
export const normalizeDirectorySearchQuery = (query: string): string =>
  query.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * 判断输入是否是 GUID。
 */
export const isGuidQuery = (query: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    query,
  );

/**
 * 判断输入是否像完整 UPN 或 email。
 *
 * 这里允许 #、单引号等 UPN/email 中可能出现的字符，但不允许空白字符。
 */
export const isCompleteUpnOrEmailQuery = (query: string): boolean =>
  /^[^\s@][^@]*@[^\s@]+$/.test(query);

/**
 * 判断输入是否更像账号前缀，而不是自然语言姓名。
 *
 * 例如 adele.v、team-、user_1 都应该走 startswith，而不是 displayName $search。
 */
export const isIdentifierPrefixQuery = (query: string): boolean => {
  if (/[.@\-_]/.test(query)) {
    return true;
  }

  if (/\d/.test(query)) {
    return true;
  }

  return false;
};

/**
 * OData 字符串 literal 的单引号转义规则。
 *
 * OData 里字符串用单引号包裹，值里的单引号必须写成两个单引号。
 */
export const escapeODataStringLiteral = (value: string): string =>
  value.replace(/'/g, "''");

/**
 * $search 文本的安全处理。
 *
 * Microsoft Graph $search 的语法对双引号和反斜杠很敏感；本步先拒绝这些输入，
 * 避免构造出语法破坏或含义漂移的 search expression。
 */
export const escapeSearchQueryText = (value: string): string => {
  if (/["\\]/.test(value)) {
    throw new DirectoryPrincipalSearchAppError(
      "invalidSearchSyntax",
      "Search text cannot contain double quotes or backslashes.",
    );
  }

  return value;
};
