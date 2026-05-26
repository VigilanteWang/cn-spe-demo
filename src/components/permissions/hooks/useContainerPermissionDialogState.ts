import type {
  IContainerPermissionEntry,
  IContainerPermissionEntriesByTab,
} from "../models/containerPermissionModels";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import { usePermissionDialogState } from "./usePermissionDialogState";

/**
 * 组合权限弹窗所需的核心状态和操作。
 *
 * 当前文件现在只保留 container 适配职责：
 * - 把共享 `usePermissionDialogState` 接到 container entry 类型
 * - 维护 candidate -> container entry 的转换规则
 *
 * 使用示例：
 * `const state = useContainerPermissionDialogState(initialEntriesByTab, containerId);`
 * `state.setFilter("people", "ade");`
 * `state.addCandidate("people", candidate);`
 * `state.replaceEntries(entriesFromServer);`
 *
 * @param initialEntriesByTab 弹窗初始化时的权限数据，按 people / groups 分类。
 * @param resetKey 当弹窗切换到新的容器或需要整体重置时使用的键。
 * @returns 提供给权限弹窗 UI 使用的状态、派生数据和操作函数。
 */
export const useContainerPermissionDialogState = (
  initialEntriesByTab: IContainerPermissionEntriesByTab,
  resetKey: string,
) =>
  usePermissionDialogState(
    initialEntriesByTab,
    resetKey,
    createPermissionEntryFromCandidate,
  );

/**
 * 把目录搜索候选项转换成一条新的本地权限草稿记录。
 *
 */
const createPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IContainerPermissionEntry => ({
  // 使用“principal 类型 + principal ID”生成前端唯一键，方便表格渲染和本地更新定位。
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
