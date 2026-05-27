import type { IItemPermissionEntryForUI } from "../../../../common/contracts/itemPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";

export type {
  IItemPermissionEntryForUI as IItemPermissionEntry,
  ItemPermissionRoleForUI as ItemPermissionRole,
} from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * Item 权限在前端按页签分组后的列表形状。
 */
export type IItemPermissionEntriesByTab =
  PermissionEntriesByTab<IItemPermissionEntryForUI>;

/**
 * Item 权限列表接口在前端消费时的加载结果。
 */
export interface IItemPermissionEntriesLoadResult {
  entriesByTab: IItemPermissionEntriesByTab;
}
