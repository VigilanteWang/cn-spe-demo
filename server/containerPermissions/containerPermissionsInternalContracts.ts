export interface IGraphRequest {
  version: (value: string) => IGraphRequest;
  header: (name: string, value: string) => IGraphRequest;
  get: () => Promise<unknown>;
  post: (body: unknown) => Promise<unknown>;
  patch: (body: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

export interface IGraphClient {
  api: (path: string) => IGraphRequest;
}

/**
 * 从不同 Graph identity 形状里提炼出的最小公共字段。
 *
 * 这样后续的 Graph -> common contract 映射层只需要面对统一结构，
 * 不必在主流程里反复分支处理 user、siteUser、group、siteGroup。
 */
export interface IGraphPermissionIdentity {
  graphId?: string;
  displayName: string;
  description: string;
  userPrincipalName?: string;
}
