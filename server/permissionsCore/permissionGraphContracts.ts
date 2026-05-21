/**
 * 这个文件存放权限模块共享的 Graph 最小契约。
 *
 * 它们不是前后端通过 HTTP 共享的公共协议，而是为了让权限后端在读取 / 写入 Graph 时
 * 只依赖一小组稳定能力，避免业务代码直接绑定整个 SDK 表面。
 */
export interface IPermissionGraphRequest {
  version: (value: string) => IPermissionGraphRequest;
  header: (name: string, value: string) => IPermissionGraphRequest;
  get: () => Promise<unknown>;
  post: (body: unknown) => Promise<unknown>;
  patch: (body: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

/**
 * 当前权限模块真正依赖的 Graph client 最小能力。
 */
export interface IPermissionGraphClient {
  api: (path: string) => IPermissionGraphRequest;
}

/**
 * 从不同 Graph identity 形状里提炼出的最小公共字段。
 *
 * item / container 未来都可以在各自 adapter 里复用它。
 */
export interface IGraphPermissionIdentity {
  // Graph 原始对象上的稳定 id；people 分支可能缺失。
  graphId?: string;
  // 前端主标题展示文本。
  displayName: string;
  // 前端副标题展示文本，通常取 email / UPN 之类更适合辅助说明的字段。
  description: string;
  // 用户或组的 mail 信息。
  mail?: string;
  // people 创建权限时后续还要写回 Graph，因此这里显式保留 UPN。
  userPrincipalName?: string;
}
