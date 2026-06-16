import { useState } from "react";
import type { IPermissionEntryBaseForUI } from "../../../../common/contracts/permissionCommonContracts";
import type {
  IPermissionPrincipalCandidate,
  PermissionEntriesByTab,
  PermissionTabValue,
} from "../models/permissionSharedModels";
import { usePermissionDraft } from "./usePermissionDraft";
import { usePermissionTabs } from "./usePermissionTabs";

/**
 * 把目录搜索候选项转换成权限草稿记录的工厂函数。
 *
 * container / item 都会先把候选项统一成共享 candidate，
 * 再在这里转换成各自的表格行模型。
 */
export type CreatePermissionEntryFromCandidateFn<
  TEntry extends IPermissionEntryBaseForUI & { role: string },
> = (candidate: IPermissionPrincipalCandidate) => TEntry;

/**
 * 组合权限弹窗共用的页签、搜索词和草稿状态。
 *
 * 这个 Hook 不关心当前是容器权限还是 Item 权限，
 * 只关心两类弹窗都需要的“按 tab 编辑权限草稿”能力。
 */
export const usePermissionDialogUIState = <
  TEntry extends IPermissionEntryBaseForUI & { role: string },
>(
  initialEntriesByTab: PermissionEntriesByTab<TEntry>,
  resetKey: string,
  createEntryFromCandidate: CreatePermissionEntryFromCandidateFn<TEntry>,
) => {
  const { selectedTab, setSelectedTab } = usePermissionTabs("people");
  const {
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges,
    addEntry,
    updateEntryRole,
    removeEntry,
    resetDraft,
    replaceEntries,
  } = usePermissionDraft(initialEntriesByTab, resetKey);

  // people / groups 各自保留输入上下文，避免切页签时互相覆盖。
  const [filterByTab, setFilterByTab] = useState<
    Record<PermissionTabValue, string>
  >({
    people: "",
    groups: "",
  });

  /**
   * 更新指定页签的搜索输入值。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  /**
   * 把目录搜索结果加入当前草稿列表。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createEntryFromCandidate(candidate));
  };

  /**
   * 放弃本次编辑并关闭弹窗。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 返回当前 access list 应该展示的页签草稿列表。
   */
  const getVisibleEntries = (tab: PermissionTabValue): TEntry[] =>
    draftEntriesByTab[tab];

  /**
   * 判断候选对象是否已经存在于当前页签列表里，避免重复添加。
   *
   * groups 直接按 `principalId` 去重；
   * people 优先按规范化后的 UPN 去重，以兼容大小写差异。
   */
  const isCandidateAdded = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ): boolean => {
    return draftEntriesByTab[tab].some((entry) => {
      if (tab === "groups") {
        return entry.principalId === candidate.id;
      }

      const candidateUpn = candidate.userPrincipalName?.trim().toLowerCase();
      const entryUpn = entry.principalUserPrincipalName?.trim().toLowerCase();
      return Boolean(candidateUpn && entryUpn && candidateUpn === entryUpn);
    });
  };

  return {
    selectedTab,
    setSelectedTab,
    filterByTab,
    setFilter,
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges,
    addCandidate,
    updateEntryRole,
    removeEntry,
    discardDraftAndClose,
    replaceEntries,
    getVisibleEntries,
    isCandidateAdded,
  };
};
