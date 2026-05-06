/**
 * 每次 collection 搜索最多返回 10 条。
 *
 * 目录搜索通常跟随输入框触发，小分页可以减少 Graph 压力，也避免 UI 一次渲染太多候选项。
 */
export const DIRECTORY_SEARCH_TOP = 10;

/** 普通搜索结果缓存 5 分钟，平衡响应速度和目录数据新鲜度。 */
export const SEARCH_RESULT_TTL_MS = 5 * 60 * 1000;

/** 精确命中更稳定，因此 exact id / UPN / mail 结果缓存 10 分钟。 */
export const EXACT_RESULT_TTL_MS = 10 * 60 * 1000;

/** 404 或空结果只短暂缓存，避免刚创建的用户或组长期不可见。 */
export const EMPTY_RESULT_TTL_MS = 30 * 1000;

/** 每类主体最多保留 50 个 query entry，防止长时间输入产生无限内存增长。 */
export const MAX_CACHE_ENTRIES_PER_KIND = 50;

/** Microsoft Graph advanced query 所需 header。 */
export const EVENTUAL_CONSISTENCY_HEADER = "ConsistencyLevel";

/** Microsoft Graph advanced query 所需 header 值。 */
export const EVENTUAL_CONSISTENCY_VALUE = "eventual";

/**
 * People 搜索最小字段集合。
 *
 * 不要为了“以后可能用到”提前扩大 $select，目录 API 可能包含敏感或无用字段。
 */
export const USER_SELECT = "id,displayName,mail,userPrincipalName";

/**
 * Groups 搜索最小字段集合。
 *
 * groupTypes/mailEnabled/securityEnabled 是判断 group 类型所必需的字段。
 */
export const GROUP_SELECT =
  "id,displayName,description,mail,mailNickname,groupTypes,mailEnabled,securityEnabled";
