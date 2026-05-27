import type { IContainerPermissionEntryForUI } from "../../../../common/contracts/containerPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";

export type {
  ContainerPermissionRoleForUI as ContainerPermissionRole,
  IContainerPermissionEntryForUI as IContainerPermissionEntry,
} from "../../../../common/contracts/containerPermissionCommonContracts";

/**
 * 容器权限在前端按页签分组后的列表形状。
 */
export type IContainerPermissionEntriesByTab =
  PermissionEntriesByTab<IContainerPermissionEntryForUI>;
