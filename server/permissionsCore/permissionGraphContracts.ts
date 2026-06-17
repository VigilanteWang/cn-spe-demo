import type { IGraphPermissionIdentity } from "../../common/contracts/permissionCommonContracts";

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

export type { IGraphPermissionIdentity };
