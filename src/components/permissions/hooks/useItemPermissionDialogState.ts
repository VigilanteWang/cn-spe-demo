import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import type {
  IItemPermissionEntriesByTab,
  IItemPermissionEntry,
} from "../models/itemPermissionModels";
import { usePermissionDialogState } from "./usePermissionDialogState";

/**
 * 组合 item 权限对话框所需的草稿状态、页签状态和筛选输入。
 *
 * 当前文件只保留 item 适配职责：
 * - 把共享 `usePermissionDialogState` 接到 item entry 类型
 * - 维护 candidate -> item entry 的转换规则
 */
export const useItemPermissionDialogState = (
  initialEntriesByTab: IItemPermissionEntriesByTab,
  resetKey: string,
) =>
  usePermissionDialogState(
    initialEntriesByTab,
    resetKey,
    createItemPermissionEntryFromCandidate,
  );

/**
 * 把目录搜索候选项转换成一条新的 item 权限草稿记录。
 */
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IItemPermissionEntry => ({
  id: `${candidate.type}:${candidate.id}`,
  principalId: candidate.id,
  principalObjectId: candidate.objectId,
  principalUserPrincipalName: candidate.userPrincipalName,
  principalMail: candidate.mail,
  principalName: candidate.name,
  principalType: candidate.type,
  description: candidate.secondaryText,
  isInherited: false,
  isEditable: true,
  isRemovable: true,
  role: "Reader",
});
