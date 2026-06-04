import {
  buildDirectoryPrincipalSearchError,
  mapGraphError,
} from "./directoryPrincipalSearchError";
import {
  isCompleteUpnOrEmailQuery,
  isGuidQuery,
  isIdentifierPrefixQuery,
  normalizeDirectorySearchQuery,
} from "./directoryPrincipalSearchInput";
import {
  getGroupById,
  getUserById,
  getUserByUserPrincipalName,
  listGroupsByExactMail,
  listGroupsByIdentifierPrefix,
  listUsersByExactMail,
  listUsersByIdentifierPrefix,
  searchGroupsByDisplayNameOrDescription,
  searchUsersByDisplayName,
} from "./directoryPrincipalSearchQueryBuilder";
import {
  DirectoryPrincipalKind,
  IDirectorySearchGraphClient,
  IDirectorySearchPlan,
} from "./directoryPrincipalSearchTypes";

/**
 * 根据用户输入创建搜索计划。这里不执行，返回给上层按需调用 execute
 *
 * 这个函数是“分级搜索策略”的核心：先判断输入像什么，再决定请求哪个 Graph API。
 */
export const createDirectorySearchPlan = (
  principalKind: DirectoryPrincipalKind,
  query: string,
): IDirectorySearchPlan => {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeDirectorySearchQuery(query);

  // 规范化后仍为空，说明输入只有空白字符，后续任何 Graph 请求都没有意义。
  if (!normalizedQuery) {
    throw buildDirectoryPrincipalSearchError(
      "emptyQuery",
      "Please enter a user or group search term.",
    );
  }

  // GUID 命中率最高且最明确，优先走按 id 直查，避免退化成模糊搜索。
  if (isGuidQuery(normalizedQuery)) {
    return {
      principalKind,
      strategy: "direct-id",
      normalizedQuery,
      execute: (graphClient) =>
        principalKind === "people"
          ? getUserById(graphClient, trimmedQuery)
          : getGroupById(graphClient, trimmedQuery),
    };
  }

  // 完整 UPN/email 属于“精确身份标识”，优先走精确查询，减少同名结果干扰。
  if (isCompleteUpnOrEmailQuery(trimmedQuery)) {
    return principalKind === "people"
      ? createPeopleExactUpnPlan(trimmedQuery, normalizedQuery)
      : createGroupsExactMailPlan(trimmedQuery, normalizedQuery);
  }

  // 像 abc、sales-team 这类前缀输入更适合 startsWith/identifier 类查询。
  if (isIdentifierPrefixQuery(trimmedQuery)) {
    return {
      principalKind,
      strategy: "identifier-prefix",
      normalizedQuery,
      execute: (graphClient) =>
        principalKind === "people"
          ? listUsersByIdentifierPrefix(graphClient, trimmedQuery)
          : listGroupsByIdentifierPrefix(graphClient, trimmedQuery),
    };
  }

  // 前面都不命中时，再回退到名称/描述搜索，作为兜底的模糊匹配策略。
  return {
    principalKind,
    strategy: "display-name-search",
    normalizedQuery,
    execute: (graphClient) =>
      principalKind === "people"
        ? searchUsersByDisplayName(graphClient, trimmedQuery)
        : searchGroupsByDisplayNameOrDescription(graphClient, trimmedQuery),
  };
};

/**
 * People 的完整 UPN/email 策略。
 *
 * Graph 支持 /users/{userPrincipalName} 直接读取；如果用户输入其实是 mail，
 * direct get 可能 404，此时再回退到 mail eq 精确过滤。
 */
const createPeopleExactUpnPlan = (
  rawQuery: string,
  normalizedQuery: string,
): IDirectorySearchPlan => ({
  principalKind: "people",
  strategy: "exact-upn",
  normalizedQuery,
  execute: async (graphClient: IDirectorySearchGraphClient) => {
    try {
      // 先按 UPN 直查，成功时比 filter 更快也更精确。
      return await getUserByUserPrincipalName(graphClient, rawQuery);
    } catch (error: unknown) {
      const mappedError = mapGraphError(error);
      if (mappedError.code !== "notFound") {
        throw mappedError;
      }

      // 用户输入可能长得像 email，但并不是 userPrincipalName，这时退回 mail 精确匹配。
      return listUsersByExactMail(graphClient, rawQuery);
    }
  },
});

/**
 * Groups 没有 UPN 概念，因此完整 email 直接按 mail 精确查询。
 */
const createGroupsExactMailPlan = (
  rawQuery: string,
  normalizedQuery: string,
): IDirectorySearchPlan => ({
  principalKind: "groups",
  strategy: "exact-mail",
  normalizedQuery,
  execute: (graphClient) => listGroupsByExactMail(graphClient, rawQuery),
});
