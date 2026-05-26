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
 * 把目录搜索候选项转换为权限草稿记录的工厂函数。
 *
 * container / item 都会把候选项先统一成共享 candidate，
 * 再在这里转成各自的表格行模型。
 */
export type CreatePermissionEntryFromCandidateFn<
  TEntry extends IPermissionEntryBaseForUI & { role: string },
> = (candidate: IPermissionPrincipalCandidate) => TEntry;

/**
 * 组合权限对话框共享的页签、搜索词和草稿状态。
 *
 * 这个 Hook 不关心当前是 container 还是 item，
 * 只关心两类对话框都需要的“按 tab 编辑权限草稿”能力。
 */
export const usePermissionDialogState = <
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
   * 更新指定 tab 的搜索输入。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  /**
   * 把目录搜索结果加入本地草稿列表。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createEntryFromCandidate(candidate));
  };

  /**
   * 放弃本次编辑并关闭对话框。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 当前 access list 直接显示对应 tab 的草稿列表。
   */
  const getVisibleEntries = (tab: PermissionTabValue): TEntry[] =>
    draftEntriesByTab[tab];

  /**
   * 判断候选对象是否已经在当前 tab 中，避免重复添加。
   *
   * groups 直接按 principalId 判重；
   * people 优先按规范化后的 UPN 判重，兼容大小写差异。
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
