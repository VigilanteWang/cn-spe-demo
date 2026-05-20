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

/** LRU 是 Least Recently Used，意思是“最近最少使用”。
 * 当缓存容量满了，要淘汰数据时，不是随机删，也不是删最早写入但刚刚还在用的数据，
 * 而是优先删除“最长时间没被访问”的那一项。
 *
 */
/**
 * 这个类负责缓存目录搜索出来的 Principal 结果，减少重复 Graph 请求。
 *
 * 它只做内存缓存，不使用 localStorage / sessionStorage：这些同步 API 会阻塞主线程，
 * 且目录身份信息不应该在浏览器里长期保留。
 *
 * 这个缓存采用 LRU + TTL，并且没有后台定时器；过期清理是懒执行的：
 * 1. 读取时如果发现已过期，就直接删除并返回空；
 * 2. 写入时如果超出容量，就按最近最少使用顺序淘汰旧项。
 */
export class DirectoryPrincipalSearchCache {
  // People 和 Groups 分开存，就像建了两个桶，避免两类查询互相挤占容量，也便于分别清理。
  private readonly entriesByKind = new Map<
    DirectoryPrincipalKind,
    Map<string, ICacheEntry>
  >();

  /**
   * 读取缓存。
   *
   * 命中后会删除再插入同一项，让 Map 的插入顺序代表最近使用顺序。
   * 过期项不会靠定时器提前清理，而是在真正读取到它时顺手删除。
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
      // 过期项在读取时顺手删除，避免无效结果长期留在内存里。
      entries.delete(cacheKey);
      return undefined;
    }

    // Map 会保持插入顺序；命中后“删再插”即可把当前项移动到最近使用的位置。
    entries.delete(cacheKey);
    entries.set(cacheKey, entry);
    return entry.results;
  }

  /**
   * 写入缓存并执行 LRU 淘汰。
   *
   * 这里同样不做定时刷新；TTL 只记录失效时间，是否清理要等下一次读或写触发。
   */
  set(
    keyParts: IDirectorySearchCacheKeyParts,
    results: IDirectoryPrincipalSearchResult[],
    ttlMs: number,
  ): void {
    const entries = this.getOrCreateKindBucket(keyParts.principalKind);
    const cacheKey = createCacheKey(keyParts);

    // 同 key 重写时也刷新最近使用顺序和过期时间。
    entries.delete(cacheKey);
    entries.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      results,
    });

    while (entries.size > MAX_CACHE_ENTRIES_PER_KIND) {
      // Map 的第一个 key 就是最久未使用项，超容量时从最旧的开始淘汰。
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
        // accountId 为空时表示清掉该 tenant 下所有账号；否则只清指定账号。
        if (
          entryTenantId === tenantId &&
          (accountId === undefined || entryAccountId === accountId)
        ) {
          entries.delete(cacheKey);
        }
      });
    });
  }

  /**
   * 获取某个 principalKind 对应的缓存桶；如果还没有，就先创建一个空桶。
   *
   * 这里不在构造函数里预先初始化所有桶，是为了让缓存结构保持按需创建：
   * 只有真的写入某个 kind 时，才为它分配内部 Map。
   */
  private getOrCreateKindBucket(
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
  // 空结果通常最不稳定，给更短 TTL，避免刚创建出来的对象长时间搜不到。
  if (results.length === 0) {
    return EMPTY_RESULT_TTL_MS;
  }

  if (
    strategy === "direct-id" ||
    strategy === "exact-upn" ||
    strategy === "exact-mail"
  ) {
    // 精确命中通常比模糊搜索更稳定，因此可以缓存更久。
    return EXACT_RESULT_TTL_MS;
  }

  // 名称搜索结果更容易因目录变动而变化，使用中等 TTL。
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
  // key 包含身份上下文和查询语义，避免不同账号、不同策略之间串缓存。
  [tenantId, accountId, principalKind, searchStrategy, normalizedQuery].join(
    "|",
  );
