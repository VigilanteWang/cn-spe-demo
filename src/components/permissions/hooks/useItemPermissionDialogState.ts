import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import type {
  IItemPermissionEntriesByTab,
  IItemPermissionEntry,
} from "../models/itemPermissionModels";
import { createBasePermissionEntryFromCandidate } from "../utils/permissionDialogSharedUtils";
import { usePermissionDialogUIState } from "./usePermissionDialogUIState";

/**
 * 组合 Item 权限弹窗所需的本地 UI 编辑状态。
 *
 * 这个 Hook 只保留 Item 场景自己的适配责任：
 * 1. 把通用 UI 状态 Hook 套到 Item 权限条目类型上
 * 2. 把目录搜索候选项转换成 Item 权限草稿行
 */
export const useItemPermissionDialogState = (
  initialEntriesByTab: IItemPermissionEntriesByTab,
  resetKey: string,
) =>
  usePermissionDialogUIState(
    initialEntriesByTab,
    resetKey,
    createItemPermissionEntryFromCandidate,
  );

/**
 * 把目录搜索候选项转换成一条新的 Item 权限草稿记录。
 */
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IItemPermissionEntry => ({
  ...createBasePermissionEntryFromCandidate(candidate),
  role: "Reader",
});
