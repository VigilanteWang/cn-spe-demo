import type { IContainerPermissionEntryForUI } from "../../../../common/contracts/containerPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";

export type {
  ContainerPermissionRoleForUI as ContainerUserPermissionRole,
  IContainerPermissionEntryForUI as IContainerUserPermissionEntry,
} from "../../../../common/contracts/containerPermissionCommonContracts";

/**
 * 容器权限在前端按 tab 分组后的列表形状。
 */
export type IContainerUserPermissionEntriesByTab =
  PermissionEntriesByTab<IContainerPermissionEntryForUI>;
