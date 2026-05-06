import {
  EMPTY_RESULT_TTL_MS,
  EXACT_RESULT_TTL_MS,
  MAX_CACHE_ENTRIES_PER_KIND,
  SEARCH_RESULT_TTL_MS,
} from "./directoryPrincipalSearchConstants";
import {
  DirectoryPrincipalKind,
  DirectorySearchStrategy,
  IDirectoryPrincipalSearchResult,
  IDirectorySearchCacheKeyParts,
} from "./directoryPrincipalSearchTypes";

interface ICacheEntry {
  expiresAt: number;
  results: IDirectoryPrincipalSearchResult[];
}

/**
 * 目录搜索的内存 LRU + TTL 缓存。
 *
 * 这里不使用 localStorage / sessionStorage：这些同步 API 会阻塞主线程，
 * 且目录身份信息不应该在浏览器里长期保留。
 */
export class DirectoryPrincipalSearchCache {
  private readonly entriesByKind = new Map<
    DirectoryPrincipalKind,
    Map<string, ICacheEntry>
  >();

  /**
   * 读取缓存。
   *
   * 命中后会删除再插入同一项，让 Map 的插入顺序代表最近使用顺序。
   */
  get(
    keyParts: IDirectorySearchCacheKeyParts,
  ): IDirectoryPrincipalSearchResult[] | undefined {
    const entries = this.entriesByKind.get(keyParts.principalKind);
    const cacheKey = createCacheKey(keyParts);

    if (!entries) {
      return undefined;
    }

    const entry = entries.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      entries.delete(cacheKey);
      return undefined;
    }

    entries.delete(cacheKey);
    entries.set(cacheKey, entry);
    return entry.results;
  }

  /**
   * 写入缓存并执行 LRU 淘汰。
   */
  set(
    keyParts: IDirectorySearchCacheKeyParts,
    results: IDirectoryPrincipalSearchResult[],
    ttlMs: number,
  ): void {
    const entries = this.getEntries(keyParts.principalKind);
    const cacheKey = createCacheKey(keyParts);

    entries.delete(cacheKey);
    entries.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      results,
    });

    while (entries.size > MAX_CACHE_ENTRIES_PER_KIND) {
      const oldestKey = entries.keys().next().value;
      if (!oldestKey) {
        break;
      }

      entries.delete(oldestKey);
    }
  }

  /**
   * 清空全部缓存，通常用于登出。
   */
  clearAll(): void {
    this.entriesByKind.clear();
  }

  /**
   * 清空某个租户或某个账号相关缓存。
   *
   * 401/403、切换账号、切换 tenant 时都应该调用，避免旧身份的数据被复用。
   */
  clearForAuthContext(tenantId: string, accountId?: string): void {
    this.entriesByKind.forEach((entries) => {
      Array.from(entries.keys()).forEach((cacheKey) => {
        const [entryTenantId, entryAccountId] = cacheKey.split("|", 2);
        if (
          entryTenantId === tenantId &&
          (accountId === undefined || entryAccountId === accountId)
        ) {
          entries.delete(cacheKey);
        }
      });
    });
  }

  private getEntries(
    principalKind: DirectoryPrincipalKind,
  ): Map<string, ICacheEntry> {
    const currentEntries = this.entriesByKind.get(principalKind);
    if (currentEntries) {
      return currentEntries;
    }

    const nextEntries = new Map<string, ICacheEntry>();
    this.entriesByKind.set(principalKind, nextEntries);
    return nextEntries;
  }
}

/**
 * 根据搜索策略和结果数量决定 TTL。
 */
export const getDirectorySearchResultTtlMs = (
  strategy: DirectorySearchStrategy,
  results: IDirectoryPrincipalSearchResult[],
): number => {
  if (results.length === 0) {
    return EMPTY_RESULT_TTL_MS;
  }

  if (
    strategy === "direct-id" ||
    strategy === "exact-upn" ||
    strategy === "exact-mail"
  ) {
    return EXACT_RESULT_TTL_MS;
  }

  return SEARCH_RESULT_TTL_MS;
};

/**
 * cache key 必须包含身份上下文、principal 类型、策略和规范化 query。
 */
const createCacheKey = ({
  tenantId,
  accountId,
  principalKind,
  searchStrategy,
  normalizedQuery,
}: IDirectorySearchCacheKeyParts): string =>
  [tenantId, accountId, principalKind, searchStrategy, normalizedQuery].join(
    "|",
  );
