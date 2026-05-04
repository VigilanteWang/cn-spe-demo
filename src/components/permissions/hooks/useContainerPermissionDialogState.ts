import { useState } from "react";
import {
  IContainerPermissionEntry,
  IPermissionPrincipalCandidate,
  PermissionEntriesByTab,
  PermissionTabValue,
} from "../models/permissionModels";
import { createPermissionEntryFromCandidate } from "../services/localPermissionData";
import { usePermissionDraft } from "./usePermissionDraft";
import { usePermissionTabs } from "./usePermissionTabs";

/**
 * 权限 Dialog 的组合状态。
 *
 * 这里把 UI 交互最核心的三类状态集中到 Hook：
 * - selectedTab：当前页签
 * - filterByTab：当前页签的筛选关键字
 * - draft/original：草稿与原始状态
 */
export const useContainerPermissionDialogState = (
  initialEntriesByTab: PermissionEntriesByTab,
  resetKey: string,
) => {
  // 当前选中的页签决定了输入框、候选列表和表格正在操作 people 还是 groups。
  const { selectedTab, setSelectedTab } = usePermissionTabs("people");
  const {
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges,
    addEntry,
    updateEntryRole,
    removeEntry,
    resetDraft,
    applyDraft,
  } = usePermissionDraft(initialEntriesByTab, resetKey);
  // 这里给两个页签共用同一个输入框，但分别保存 people/groups 自己的筛选词。
  // 切换页签时，界面显示的是当前页签对应的 filter，避免两个页签互相覆盖搜索内容。
  const [filterByTab, setFilterByTab] = useState<Record<PermissionTabValue, string>>(
    {
      people: "",
      groups: "",
    },
  );

  /**
   * 更新某个页签自己的筛选关键字。
   *
   * 这里通过计算属性名只改当前页签对应的字段，避免覆盖另一个页签的输入内容。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  /**
   * 把候选项转换成权限记录后追加到当前草稿。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createPermissionEntryFromCandidate(candidate));
  };

  /**
   * 放弃草稿并关闭弹窗。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 确认草稿并关闭弹窗。
   */
  const applyDraftAndClose = (onClose: () => void) => {
    applyDraft();
    onClose();
  };

  /**
   * 返回当前页签下应展示在表格中的权限项。
   *
   * 如果没有筛选词，就返回整份草稿；
   * 如果有筛选词，就按姓名和描述做本地包含匹配。
   */
  const getVisibleEntries = (tab: PermissionTabValue): IContainerPermissionEntry[] => {
    const normalizedFilter = filterByTab[tab].trim().toLowerCase();

    if (!normalizedFilter) {
      return draftEntriesByTab[tab];
    }

    return draftEntriesByTab[tab].filter((entry) => {
      const searchableText = `${entry.principalName} ${entry.description}`.toLowerCase();
      return searchableText.includes(normalizedFilter);
    });
  };

  /**
   * 判断某个候选项是否已经存在于当前页签草稿中，用于禁用重复添加。
   */
  const isCandidateAdded = (
    tab: PermissionTabValue,
    candidateId: string,
  ): boolean =>
    draftEntriesByTab[tab].some((entry) => entry.principalId === candidateId);

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
    applyDraftAndClose,
    getVisibleEntries,
    isCandidateAdded,
  };
};
