import { useState } from "react";
import { PermissionTabValue } from "../models/permissionModels";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import type {
  IItemPermissionEntriesByTab,
  IItemPermissionEntry,
} from "../models/itemPermissionModels";
import { usePermissionDraft } from "./usePermissionDraft";
import { usePermissionTabs } from "./usePermissionTabs";

/**
 * 组合 item 权限对话框所需的草稿状态、页签状态和筛选输入。
 *
 * 这里延续 container dialog 的前端编排方式：
 * - 继续复用 `usePermissionTabs`
 * - 继续复用 `usePermissionDraft`
 * - 每个 tab 各自保存输入内容，避免 people/groups 互相覆盖
 */
export const useItemPermissionDialogState = (
  initialEntriesByTab: IItemPermissionEntriesByTab,
  resetKey: string,
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

  const [filterByTab, setFilterByTab] = useState<
    Record<PermissionTabValue, string>
  >({
    people: "",
    groups: "",
  });

  /**
   * 更新指定 tab 的输入值，同时保留另一个 tab 的上下文。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  /**
   * 把目录搜索候选项转换为一条新的 item 权限草稿记录。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createItemPermissionEntryFromCandidate(candidate));
  };

  /**
   * 放弃当前草稿修改，并在完成后关闭弹窗。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 当前 access list 直接显示对应 tab 的草稿列表。
   */
  const getVisibleEntries = (tab: PermissionTabValue): IItemPermissionEntry[] =>
    draftEntriesByTab[tab];

  /**
   * 判断候选对象是否已经在当前 tab 的 access list 中，避免重复添加。
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
