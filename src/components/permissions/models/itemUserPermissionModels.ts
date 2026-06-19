import type { IItemPermissionEntryForUI } from "../../../../common/contracts/itemPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";

export type {
  IItemPermissionEntryForUI as IItemUserPermissionEntry,
  ItemPermissionRoleForUI as ItemUserPermissionRole,
} from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * Item 权限在前端按 tab 分组后的列表形状。
 */
export type IItemUserPermissionEntriesByTab =
  PermissionEntriesByTab<IItemPermissionEntryForUI>;

/**
 * Item 权限列表接口在前端消费时的加载结果。
 */
export interface IItemUserPermissionEntriesLoadResult {
  entriesByTab: IItemUserPermissionEntriesByTab;
}
