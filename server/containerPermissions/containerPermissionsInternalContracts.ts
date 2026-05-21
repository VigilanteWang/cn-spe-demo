/**
 * 这里保留容器模块原有导出名，避免现有测试和调用方一次性改太多；
 * 真实共享定义已经上提到 `server/permissionsCore/permissionGraphContracts.ts`。
 */
export type {
  IGraphPermissionIdentity as IGraphIdentityInPermission,
  IPermissionGraphClient as IGraphClient,
  IPermissionGraphRequest as IGraphRequest,
} from "../permissionsCore/permissionGraphContracts";
