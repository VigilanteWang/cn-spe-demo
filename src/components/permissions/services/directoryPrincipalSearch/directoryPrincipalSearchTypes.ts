import type { PermissionTabValue } from "../../models/permissionModels";

/**
 * 目录搜索支持的 principal 类型。
 *
 * 这里复用权限弹窗已有的 tab 值，避免 UI 层和服务层维护两套 People / Groups 枚举。
 */
export type DirectoryPrincipalKind = PermissionTabValue;

/**
 * 输入被识别后的搜索策略。
 *
 * 这些值同时进入 cache key，因此命名要稳定，不能随意改成展示文案。
 */
export type DirectorySearchStrategy =
  | "direct-id"
  | "exact-upn"
  | "exact-mail"
  | "identifier-prefix"
  | "display-name-search";

/**
 * 前端 ComboBox 最终关心的 principal 类型。
 *
 * Groups 在 Graph 中都来自 /groups，但 UI 需要区分 Microsoft 365 group、
 * DL、security group 等类型，所以这里提供更细的视图层枚举。
 */
export type DirectoryPrincipalType =
  | "user"
  | "microsoft365Group"
  | "distributionList"
  | "securityGroup"
  | "mailEnabledSecurityGroup"
  | "group";

/**
 * Graph SDK 请求对象的最小能力集合。
 *
 * 只声明搜索服务真正用到的方法，可以让单元测试用 fake client 精准替换，
 * 也避免把完整 Graph SDK 类型扩散到权限模块。
 */
/*
 * 这些方法都返回同一种请求形状，所以调用方可以写成
 * api(...).select(...).top(...).filter(...).get() 这样的链式代码。
 * 这里的“返回自己”并不要求返回同一个对象实例，只要返回值仍然满足
 * IGraphDirectoryRequest 这个结构即可。
 *
 * 如果直接用 Graph SDK 自带类型，通常会有两个代价：一是测试 mock 会更重，
 * 二是业务代码会被 SDK 的具体形状绑得更紧。
 * 这里的写法本质上是在做一个适配层，让权限模块只看到需要的“Graph 请求能力”，
 * 而不是整个 SDK。
 */
export interface IGraphDirectoryRequest {
  /**
   * 给当前请求追加选择字段，然后返回同一个请求形状，方便继续链式拼装。
   *
   * 例如：先选需要的列，再接 top / filter / search，最后调用 get 发起请求。
   */
  select: (properties: string) => IGraphDirectoryRequest;
  top: (count: number) => IGraphDirectoryRequest;
  filter: (filter: string) => IGraphDirectoryRequest;
  search: (search: string) => IGraphDirectoryRequest;
  /**
   * 这里对齐 GraphRequest.query 的常见调用形状：
   * - 传入完整 query string
   * - 传入键值对象（值为 string/number）
   *
   * 这样 MGT 暴露的 graph client 可以直接满足该接口，
   * Hook 不需要再单独做一层参数适配。
   */
  query: (
    parameters: string | Record<string, string | number>,
  ) => IGraphDirectoryRequest;
  header: (name: string, value: string) => IGraphDirectoryRequest;
  /**
   * 结束链式构造并真正发起请求。
   */
  get: () => Promise<unknown>;
}

/**
 * 把 Graph 的资源路径转成一个可继续链式配置的请求对象。
 *
 * 调用方传入 /users、/groups 或更具体的资源 path 后，后面还可以继续追加
 * select、filter、search、header、query 等条件，最后再调用 get 真正发送请求。
 */
export interface IDirectorySearchGraphClient {
  api: (path: string) => IGraphDirectoryRequest;
}

/**
 * 前端 ComboBox 使用的统一结果模型。
 *
 * user 和 group 的 Graph 字段不完全一样，因此公共字段放前面，类型专属字段保持 optional。
 */
export interface IDirectoryPrincipalSearchResult {
  id: string;
  displayName: string;
  secondaryText: string;
  principalType: DirectoryPrincipalType;
  mail?: string;
  userPrincipalName?: string;
  mailNickname?: string;
  groupTypes?: string[];
  mailEnabled?: boolean;
  securityEnabled?: boolean;
}

/**
 * 执行目录搜索所需的认证上下文和查询条件。
 */
export interface ISearchDirectoryPrincipalsOptions {
  graphClient: IDirectorySearchGraphClient;
  tenantId: string;
  accountId: string;
  principalKind: DirectoryPrincipalKind;
  query: string;
}

/**
 * 搜索计划把“怎么判断输入”与“怎么请求 Graph”连接起来。
 *
 * 这样主入口只需要执行 plan，不需要知道每一种 Graph URL 和参数细节。
 */
export interface IDirectorySearchPlan {
  principalKind: DirectoryPrincipalKind;
  strategy: DirectorySearchStrategy;
  normalizedQuery: string;
  execute: (
    graphClient: IDirectorySearchGraphClient,
  ) => Promise<IDirectoryPrincipalSearchResult[]>;
}

/**
 * cache key 的组成字段。
 *
 * 注意 normalizedQuery 只用于判定和缓存，真实请求仍使用经过 URL/OData/$search 规则处理后的原始输入。
 */
export interface IDirectorySearchCacheKeyParts {
  tenantId: string;
  accountId: string;
  principalKind: DirectoryPrincipalKind;
  searchStrategy: DirectorySearchStrategy;
  normalizedQuery: string;
}
