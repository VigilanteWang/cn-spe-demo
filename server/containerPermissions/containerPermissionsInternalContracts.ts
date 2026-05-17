/**
 * 这个文件存放容器权限后端模块内部使用的小型契约。
 *
 * 它们不是前后端通过 HTTP 共享的公共协议，而是为了让当前模块内部代码更清晰、
 * 更容易替换底层实现而定义的最小能力接口和中间结构。
 *
 * 可以把这里的类型理解成：
 * 1. 对 Graph SDK 的“最小可用抽象”
 * 2. 对 Graph identity 的“统一中间表示”
 */
export interface IGraphRequest {
  version: (value: string) => IGraphRequest;
  header: (name: string, value: string) => IGraphRequest;
  get: () => Promise<unknown>;
  post: (body: unknown) => Promise<unknown>;
  patch: (body: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

/**
 * 当前模块真正依赖的 Graph client 最小能力。
 *
 * 这里只声明 `api(path)`，是因为容器权限模块只需要这一小段能力，
 * 没必要把整个 Graph SDK 表面都耦合进来。
 */
export interface IGraphClient {
  api: (path: string) => IGraphRequest;
}

/**
 * 从不同 Graph identity 形状里提炼出的最小公共字段。
 *
 * 这样后续的 `Graph -> common contract` 映射层只需要面对统一结构，
 * 不必在主流程里反复分支处理 `user`、`siteUser`、`group`、`siteGroup`。
 */
export interface IGraphPermissionIdentity {
  // Graph 原始对象上的稳定 id；people 分支可能缺失。
  graphId?: string;
  // 前端主标题展示文本。
  displayName: string;
  // 前端副标题展示文本，通常取 email / UPN 之类更适合辅助说明的字段。
  description: string;
  // people 创建权限时后续还要写回 Graph，因此这里显式保留 UPN。
  userPrincipalName?: string;
}
