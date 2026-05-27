import type {
  IContainerPermissionEntry,
  IContainerPermissionEntriesByTab,
} from "../models/containerPermissionModels";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import { createBasePermissionEntryFromCandidate } from "../utils/permissionDialogSharedUtils";
import { usePermissionDialogUIState } from "./usePermissionDialogUIState";

/**
 * 组合容器权限弹窗所需的本地 UI 编辑状态。
 *
 * 这个 Hook 只保留容器场景自己的适配责任：
 * 1. 把通用 UI 状态 Hook 套到容器权限条目类型上
 * 2. 把目录搜索候选项转换成容器权限草稿行
 */
export const useContainerPermissionDialogState = (
  initialEntriesByTab: IContainerPermissionEntriesByTab,
  resetKey: string,
) =>
  usePermissionDialogUIState(
    initialEntriesByTab,
    resetKey,
    createPermissionEntryFromCandidate,
  );

/**
 * 把目录搜索候选项转换成一条新的容器权限草稿记录。
 */
const createPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IContainerPermissionEntry => ({
  ...createBasePermissionEntryFromCandidate(candidate),
  role: "Reader",
});
