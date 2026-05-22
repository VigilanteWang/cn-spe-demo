import type {
  IItemPermissionEntryForUI,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { PermissionEntriesByTab } from "./permissionSharedModels";

export type {
  IItemPermissionEntryForUI as IItemPermissionEntry,
  ItemPermissionRoleForUI as ItemPermissionRole,
} from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * item 权限列表按页签分组后的前端形状。
 */
export type IItemPermissionEntriesByTab =
  PermissionEntriesByTab<IItemPermissionEntryForUI>;

/**
 * item 权限 API 在前端的加载结果。
 */
export interface IItemPermissionEntriesLoadResult {
  entriesByTab: IItemPermissionEntriesByTab;
}
