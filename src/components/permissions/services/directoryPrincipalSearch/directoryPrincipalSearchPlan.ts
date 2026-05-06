import { DirectoryPrincipalSearchError, mapGraphError } from "./directoryPrincipalSearchError";
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
 * 根据用户输入创建搜索计划。
 *
 * 这个函数是“分级搜索策略”的核心：先判断输入像什么，再决定请求哪个 Graph API。
 * 组件层不应该复制这些判断，否则后续维护时很容易出现 People 和 Groups 行为不一致。
 */
export const createDirectorySearchPlan = (
  principalKind: DirectoryPrincipalKind,
  query: string,
): IDirectorySearchPlan => {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeDirectorySearchQuery(query);

  if (!normalizedQuery) {
    throw new DirectoryPrincipalSearchError(
      "emptyQuery",
      "Please enter a user or group search term.",
    );
  }

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

  if (isCompleteUpnOrEmailQuery(trimmedQuery)) {
    return principalKind === "people"
      ? createPeopleExactUpnPlan(trimmedQuery, normalizedQuery)
      : createGroupsExactMailPlan(trimmedQuery, normalizedQuery);
  }

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
      return await getUserByUserPrincipalName(graphClient, rawQuery);
    } catch (error: unknown) {
      const mappedError = mapGraphError(error);
      if (mappedError.code !== "notFound") {
        throw mappedError;
      }

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
