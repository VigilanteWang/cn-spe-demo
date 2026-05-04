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
  const [filterByTab, setFilterByTab] = useState<Record<PermissionTabValue, string>>(
    {
      people: "",
      groups: "",
    },
  );

  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createPermissionEntryFromCandidate(candidate));
  };

  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  const applyDraftAndClose = (onClose: () => void) => {
    applyDraft();
    onClose();
  };

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
