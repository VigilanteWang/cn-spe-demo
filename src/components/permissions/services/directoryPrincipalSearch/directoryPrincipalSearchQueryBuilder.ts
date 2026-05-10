import {
  DIRECTORY_SEARCH_TOP,
  EVENTUAL_CONSISTENCY_HEADER,
  EVENTUAL_CONSISTENCY_VALUE,
  GROUP_SELECT,
  USER_SELECT,
} from "./directoryPrincipalSearchConstants";
import {
  escapeODataStringLiteral,
  escapeSearchQueryText,
} from "./directoryPrincipalSearchInput";
import { mapGraphGroup, mapGraphUser } from "./directoryPrincipalSearchMapper";
import { readRecord } from "./directoryPrincipalSearchObjectUtils";
import {
  IDirectoryPrincipalSearchResult,
  IDirectorySearchGraphClient,
  IGraphDirectoryRequest,
} from "./directoryPrincipalSearchTypes";

// Query builder这里才是真正使用client 执行 graph 请求的地方
/**
 * 根据 user id 精确读取用户。
 */
export const getUserById = async (
  graphClient: IDirectorySearchGraphClient,
  userId: string,
): Promise<IDirectoryPrincipalSearchResult[]> => {
  const user = await graphClient
    .api(`/users/${encodeURIComponent(userId)}`)
    .select(USER_SELECT)
    .get();

  return [mapGraphUser(user)];
};

/**
 * 根据 UPN 精确读取用户。
 *
 * UPN 位于 URL path segment 中，必须使用 encodeURIComponent，
 * 不能只依赖 Graph SDK 自动处理。
 */
export const getUserByUserPrincipalName = async (
  graphClient: IDirectorySearchGraphClient,
  userPrincipalName: string,
): Promise<IDirectoryPrincipalSearchResult[]> => {
  const user = await graphClient
    .api(`/users/${encodeURIComponent(userPrincipalName)}`)
    .select(USER_SELECT)
    .get();

  return [mapGraphUser(user)];
};

/**
 * 根据 group id 精确读取组。
 */
export const getGroupById = async (
  graphClient: IDirectorySearchGraphClient,
  groupId: string,
): Promise<IDirectoryPrincipalSearchResult[]> => {
  const group = await graphClient
    .api(`/groups/${encodeURIComponent(groupId)}`)
    .select(GROUP_SELECT)
    .get();

  return [mapGraphGroup(group)];
};

/**
 * People 精确 mail 查询。
 *
 * mail eq 是简单等值过滤，不需要 advanced query header 或 $count=true。
 */
export const listUsersByExactMail = (
  graphClient: IDirectorySearchGraphClient,
  mail: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    graphClient
      .api("/users")
      .select(USER_SELECT)
      .top(DIRECTORY_SEARCH_TOP)
      .filter(`mail eq '${escapeODataStringLiteral(mail)}'`),
    mapGraphUser,
  );

/**
 * Groups 精确 mail 查询。
 */
export const listGroupsByExactMail = (
  graphClient: IDirectorySearchGraphClient,
  mail: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    graphClient
      .api("/groups")
      .select(GROUP_SELECT)
      .top(DIRECTORY_SEARCH_TOP)
      .filter(`mail eq '${escapeODataStringLiteral(mail)}'`),
    mapGraphGroup,
  );

/**
 * People identifier prefix 查询。
 *
 * startswith 组合查询属于 advanced query，需要 ConsistencyLevel 和 $count=true。
 */
export const listUsersByIdentifierPrefix = (
  graphClient: IDirectorySearchGraphClient,
  prefix: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    withAdvancedQuery(
      graphClient
        .api("/users")
        .select(USER_SELECT)
        .top(DIRECTORY_SEARCH_TOP)
        .filter(
          `startswith(userPrincipalName,'${escapeODataStringLiteral(
            prefix,
          )}') or startswith(mail,'${escapeODataStringLiteral(prefix)}')`,
        ),
    ),
    mapGraphUser,
  );

/**
 * Groups identifier prefix 查询。
 */
export const listGroupsByIdentifierPrefix = (
  graphClient: IDirectorySearchGraphClient,
  prefix: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    withAdvancedQuery(
      graphClient
        .api("/groups")
        .select(GROUP_SELECT)
        .top(DIRECTORY_SEARCH_TOP)
        .filter(
          `startswith(mail,'${escapeODataStringLiteral(
            prefix,
          )}') or startswith(mailNickname,'${escapeODataStringLiteral(prefix)}')`,
        ),
    ),
    mapGraphGroup,
  );

/**
 * People displayName 搜索。
 */
export const searchUsersByDisplayName = (
  graphClient: IDirectorySearchGraphClient,
  query: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    withAdvancedQuery(
      graphClient
        .api("/users")
        .select(USER_SELECT)
        .top(DIRECTORY_SEARCH_TOP)
        .search(`"displayName:${escapeSearchQueryText(query)}"`),
    ),
    mapGraphUser,
  );

/**
 * Groups displayName 或 description 搜索。
 */
export const searchGroupsByDisplayNameOrDescription = (
  graphClient: IDirectorySearchGraphClient,
  query: string,
): Promise<IDirectoryPrincipalSearchResult[]> =>
  getCollectionResults(
    withAdvancedQuery(
      graphClient
        .api("/groups")
        .select(GROUP_SELECT)
        .top(DIRECTORY_SEARCH_TOP)
        .search(
          `"displayName:${escapeSearchQueryText(
            query,
          )}" OR "description:${escapeSearchQueryText(query)}"`,
        ),
    ),
    mapGraphGroup,
  );

/**
 * 给 advanced query 补齐 Microsoft Graph 要求的 header 和 $count=true。
 */
const withAdvancedQuery = (
  request: IGraphDirectoryRequest,
): IGraphDirectoryRequest =>
  request
    .header(EVENTUAL_CONSISTENCY_HEADER, EVENTUAL_CONSISTENCY_VALUE)
    .query({ $count: "true" });

/**
 * 读取 collection 响应，并把 value 数组映射成统一视图模型。
 */
const getCollectionResults = async (
  request: IGraphDirectoryRequest,
  mapper: (item: unknown) => IDirectoryPrincipalSearchResult,
): Promise<IDirectoryPrincipalSearchResult[]> => {
  const response = await request.get();
  const value = readRecord(response).value;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(mapper);
};
