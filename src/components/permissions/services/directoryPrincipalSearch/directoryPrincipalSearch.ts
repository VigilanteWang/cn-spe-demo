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
  ISearchDirectoryPrincipalsOptions,
} from "./directoryPrincipalSearchTypes";

/**
 * 这里集中重导出目录搜索服务对外提供需要的类型和工具，
 * 让调用方只依赖这一个入口文件，而不必分散 import 各个内部实现模块。
 *
 * 这样做的目的不是重复定义 export，而是给这组能力提供稳定的公共 API 边界：
 * 以后内部文件拆分、重命名或重构时，外部调用方的导入路径可以保持不变。
 */
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

// 这个在模块作用域内，首次载入，建立单例
const directoryPrincipalSearchCache = new DirectoryPrincipalSearchCache();

/**
 * 清空目录搜索内存缓存。
 * 登出时调用这个函数，确保下一位用户不会复用上一位用户的目录搜索结果。
 */
export const clearDirectoryPrincipalSearchCache = (): void => {
  directoryPrincipalSearchCache.clearAll();
};

/**
 * 清空指定租户或账号下的目录搜索缓存。
 *
 * 这里不是因为 cache key 会互相冲突，而是做一次主动清理：
 * 1. 账号或 tenant 切换后，旧身份对应的缓存没有继续保留价值；
 * 2. 401/403 往往表示当前身份上下文已经失效，继续保留只会让无效数据多占内存；
 * 3. 如果上层某次没有传入 accountId，这里也能把该 tenant 下的相关条目一起兜底清掉。
 */
export const clearDirectoryPrincipalSearchCacheForAuthContext = (
  tenantId: string,
  accountId?: string,
): void => {
  directoryPrincipalSearchCache.clearForAuthContext(tenantId, accountId);
};

/**
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
  // 先根据输入生成搜索计划，把“该走哪种 Graph 查询策略”收敛到一个对象里。
  const plan = createDirectorySearchPlan(principalKind, query);

  // 组装缓存 key 所需的身份上下文和查询语义，确保不同账号、不同策略不会串缓存。
  const cacheKeyParts = {
    tenantId,
    accountId,
    principalKind,
    searchStrategy: plan.strategy,
    normalizedQuery: plan.normalizedQuery,
  } satisfies IDirectorySearchCacheKeyParts;

  // 先查短周期内存缓存；命中就直接返回，避免重复请求 Graph。
  const cachedResults = directoryPrincipalSearchCache.get(cacheKeyParts);

  if (cachedResults) {
    return cachedResults;
  }

  try {
    // 缓存未命中时，按搜索计划真正执行 Graph 请求。
    const results = await plan.execute(graphClient);
    // 根据查询策略和结果形态选择 TTL，再把结果写回内存缓存。
    const ttlMs = getDirectorySearchResultTtlMs(plan.strategy, results);
    directoryPrincipalSearchCache.set(cacheKeyParts, results, ttlMs);
    return results;
  } catch (error: unknown) {
    // 先把底层 Graph 错误映射成上层稳定可判断的错误类型。
    const mappedError = mapGraphError(error);

    if (shouldClearCacheForError(mappedError)) {
      // cache key 已经区分了 tenant 和 account，这里仍然清理，是为了在身份失效后主动丢弃旧上下文的残留结果。
      clearDirectoryPrincipalSearchCacheForAuthContext(tenantId, accountId);
    }

    if (mappedError.code === "notFound") {
      // notFound 视为稳定空结果，给一个较短 TTL，减少短时间内的重复空查。
      directoryPrincipalSearchCache.set(cacheKeyParts, [], EMPTY_RESULT_TTL_MS);
      return [];
    }

    // 其它错误交给上层处理，让调用方决定如何提示或恢复。
    throw mappedError;
  }
};

/**
 * 401/403 不会造成 cache key 冲突，但通常意味着当前身份上下文已经失效或变化，
 * 这里清理缓存属于主动失效处理，而不是为了阻止 key 重复。
 */
const shouldClearCacheForError = (
  error: DirectoryPrincipalSearchError,
): boolean => error.code === "unauthorized" || error.code === "forbidden";
