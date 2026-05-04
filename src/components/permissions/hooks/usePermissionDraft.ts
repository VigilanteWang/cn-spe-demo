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
  // 保存“上一次确认后的权限状态”，Close 时需要回到这份数据。
  const [originalEntriesByTab, setOriginalEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );
  // 保存弹窗内当前正在编辑的草稿；表格里的增删改都只改这份数据。
  const [draftEntriesByTab, setDraftEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );

  useEffect(() => {
    // resetKey 一般对应容器 ID。只要容器上下文变了，就重新加载原始值和草稿值，避免不同容器串数据。
    const nextEntriesByTab = cloneEntriesByTab(initialEntriesByTab);
    setOriginalEntriesByTab(nextEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextEntriesByTab));
  }, [resetKey]);

  /**
   * 向指定页签追加一条新的草稿权限记录。
   */
  const addEntry = (tab: PermissionTabValue, entry: IContainerPermissionEntry) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: [...currentEntriesByTab[tab], entry],
    }));
  };

  /**
   * 更新指定权限项的角色，用于表格里的行内角色切换。
   */
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

  /**
   * 从指定页签的草稿列表中删除一条权限项。
   */
  const removeEntry = (tab: PermissionTabValue, entryId: string) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: currentEntriesByTab[tab].filter((entry) => entry.id !== entryId),
    }));
  };

  /**
   * 放弃本次编辑，把草稿恢复到上一次确认后的状态。
   */
  const resetDraft = () => {
    setDraftEntriesByTab(cloneEntriesByTab(originalEntriesByTab));
  };

  /**
   * 确认当前草稿，并把它提升为新的原始状态。
   */
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
