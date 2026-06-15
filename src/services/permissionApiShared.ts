import type { IPermissionEntryBaseForUI } from "../../common/contracts/permissionCommonContracts";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";

/**
 * 把权限数组重新按 `people/groups` 页签结构分组。
 *
 * 这里保持一个共享映射入口，避免 container 和 item 权限接口
 * 分别维护重复的前端分组逻辑。
 *
 * @param entries 后端返回或前端流程中流转的扁平权限数组。
 * @returns 供权限对话框直接消费的按页签分组结果。
 */
export const mapPermissionEntriesToTabs = <
  TEntry extends IPermissionEntryBaseForUI,
>(
  entries: TEntry[],
): PermissionEntriesByTab<TEntry> => {
  const nextEntries: PermissionEntriesByTab<TEntry> = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    // `principalType` 已经在共享合同层收窄为 people/groups，可直接路由到对应页签。
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};
