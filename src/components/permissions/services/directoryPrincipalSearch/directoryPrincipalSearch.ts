import {
  DirectoryPrincipalSearchCache,
  getDirectorySearchResultTtlMs,
} from "./directoryPrincipalSearchCache";
import { EMPTY_RESULT_TTL_MS } from "./directoryPrincipalSearchConstants";
import {
  DirectoryPrincipalSearchError,
  mapGraphError,
} from "./directoryPrincipalSearchError";
import { createDirectorySearchPlan } from "./directoryPrincipalSearchPlan";
import {
  IDirectoryPrincipalSearchResult,
  IDirectorySearchCacheKeyParts,
  IDirectorySearchGraphClient,
  ISearchDirectoryPrincipalsOptions,
} from "./directoryPrincipalSearchTypes";

export type {
  DirectoryPrincipalKind,
  DirectoryPrincipalType,
  DirectorySearchErrorCode,
  DirectorySearchStrategy,
  IDirectoryPrincipalSearchResult,
  IDirectorySearchGraphClient,
  IGraphDirectoryRequest,
  ISearchDirectoryPrincipalsOptions,
} from "./directoryPrincipalSearchTypes";

export { DirectoryPrincipalSearchError, createDirectorySearchPlan };

const directoryPrincipalSearchCache = new DirectoryPrincipalSearchCache();

/**
 * 清空目录搜索内存缓存。
 *
 * 登出时调用这个函数，确保下一位用户不会复用上一位用户的目录搜索结果。
 */
export const clearDirectoryPrincipalSearchCache = (): void => {
  directoryPrincipalSearchCache.clearAll();
};

/**
 * 清空指定租户或账号下的目录搜索缓存。
 *
 * 切换账号、切换 tenant、401/403 时调用，避免权限上下文已经变化但缓存仍返回旧数据。
 */
export const clearDirectoryPrincipalSearchCacheForAuthContext = (
  tenantId: string,
  accountId?: string,
): void => {
  directoryPrincipalSearchCache.clearForAuthContext(tenantId, accountId);
};

/**
 * 搜索用户或组目录主体。
 *
 * 主入口只负责编排三件事：
 * 1. 创建搜索计划；
 * 2. 读取或写入短周期内存缓存；
 * 3. 把 Graph 错误映射成稳定错误类型。
 *
 * 真正的 URL 构造、OData 转义、$search 语法和结果映射都放在独立模块里，
 * 这样 Dialog 或未来 TagPicker 不会被 Graph 查询细节污染。
 */
export const searchDirectoryPrincipals = async ({
  graphClient,
  tenantId,
  accountId,
  principalKind,
  query,
}: ISearchDirectoryPrincipalsOptions): Promise<
  IDirectoryPrincipalSearchResult[]
> => {
  const plan = createDirectorySearchPlan(principalKind, query);
  const cacheKeyParts = createCacheKeyParts({
    tenantId,
    accountId,
    principalKind,
    searchStrategy: plan.strategy,
    normalizedQuery: plan.normalizedQuery,
  });
  const cachedResults = directoryPrincipalSearchCache.get(cacheKeyParts);

  if (cachedResults) {
    return cachedResults;
  }

  try {
    const results = await plan.execute(graphClient);
    const ttlMs = getDirectorySearchResultTtlMs(plan.strategy, results);
    directoryPrincipalSearchCache.set(cacheKeyParts, results, ttlMs);
    return results;
  } catch (error: unknown) {
    const mappedError = mapGraphError(error);

    if (shouldClearCacheForError(mappedError)) {
      clearDirectoryPrincipalSearchCacheForAuthContext(tenantId, accountId);
    }

    if (mappedError.code === "notFound") {
      directoryPrincipalSearchCache.set(cacheKeyParts, [], EMPTY_RESULT_TTL_MS);
      return [];
    }

    throw mappedError;
  }
};

/**
 * 创建 cache key 参数对象。
 *
 * 单独抽出这个小函数，是为了让主流程读起来像业务步骤，而不是一大段对象拼装。
 */
const createCacheKeyParts = (
  keyParts: IDirectorySearchCacheKeyParts,
): IDirectorySearchCacheKeyParts => keyParts;

/**
 * 401/403 说明身份或权限上下文不再可信，需要清理相关缓存。
 */
const shouldClearCacheForError = (
  error: DirectoryPrincipalSearchError,
): boolean => error.code === "unauthorized" || error.code === "forbidden";
