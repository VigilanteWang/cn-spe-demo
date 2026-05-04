import { useEffect, useState } from "react";
import {
  ContainerPermissionRole,
  IContainerPermissionEntry,
  PermissionEntriesByTab,
  PermissionTabValue,
} from "../models/permissionModels";

/**
 * 复制权限列表，避免草稿编辑时直接修改原始状态。
 */
const cloneEntriesByTab = (
  entriesByTab: PermissionEntriesByTab,
): PermissionEntriesByTab => ({
  people: entriesByTab.people.map((entry) => ({ ...entry })),
  groups: entriesByTab.groups.map((entry) => ({ ...entry })),
});

/**
 * 比较两份权限列表是否完全一致。
 */
const areEntriesByTabEqual = (
  left: PermissionEntriesByTab,
  right: PermissionEntriesByTab,
) => JSON.stringify(left) === JSON.stringify(right);

/**
 * 管理草稿权限列表与“编辑前原始状态”。
 *
 * 说明：
 * - originalEntriesByTab 表示上一次确认后的状态。
 * - draftEntriesByTab 表示当前正在 Dialog 中编辑的草稿。
 * - Close 会丢弃 draft，回到 original。
 * - Apply 先只做本地确认，不调用任何后端接口。
 */
export const usePermissionDraft = (
  initialEntriesByTab: PermissionEntriesByTab,
  resetKey: string,
) => {
  const [originalEntriesByTab, setOriginalEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );
  const [draftEntriesByTab, setDraftEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );

  useEffect(() => {
    const nextEntriesByTab = cloneEntriesByTab(initialEntriesByTab);
    setOriginalEntriesByTab(nextEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextEntriesByTab));
  }, [resetKey]);

  const addEntry = (tab: PermissionTabValue, entry: IContainerPermissionEntry) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: [...currentEntriesByTab[tab], entry],
    }));
  };

  const updateEntryRole = (
    tab: PermissionTabValue,
    entryId: string,
    role: ContainerPermissionRole,
  ) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: currentEntriesByTab[tab].map((entry) =>
        entry.id === entryId ? { ...entry, role } : entry,
      ),
    }));
  };

  const removeEntry = (tab: PermissionTabValue, entryId: string) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: currentEntriesByTab[tab].filter((entry) => entry.id !== entryId),
    }));
  };

  const resetDraft = () => {
    setDraftEntriesByTab(cloneEntriesByTab(originalEntriesByTab));
  };

  const applyDraft = () => {
    const nextOriginalEntriesByTab = cloneEntriesByTab(draftEntriesByTab);
    setOriginalEntriesByTab(nextOriginalEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextOriginalEntriesByTab));
  };

  return {
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges: !areEntriesByTabEqual(
      originalEntriesByTab,
      draftEntriesByTab,
    ),
    addEntry,
    updateEntryRole,
    removeEntry,
    resetDraft,
    applyDraft,
  };
};
