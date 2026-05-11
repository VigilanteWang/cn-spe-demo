import { useEffect, useState } from "react";
import {
  ContainerPermissionRole,
  IContainerPermissionEntry,
  PermissionEntriesByTab,
  PermissionTabValue,
} from "../models/permissionModels";

/**
 * 复制权限列表，避免不同快照共享同一份引用。
 *
 * 这里会同时用于 `original` 和 `draft`：
 * - `original` 代表“最近一次确认后的基线快照”，用于 Close / Reset 回滚。
 * - `draft` 代表“当前正在编辑的草稿快照”，用于页面内的增删改。
 *
 * 两份列表必须互相独立，也不能直接引用外部传入的 `initial` 数据。
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
 * 这里保留两份列表，不是为了重复存储，而是为了把“基线”和“编辑中状态”拆开：
 * - `initialEntriesByTab` 是外部传进来的初始值，只负责初始化这次弹窗会话。
 * - `originalEntriesByTab` 保存本地维护的确认基线，成功写回后会前移到最新快照。
 * - `draftEntriesByTab` 保存当前编辑过程中的变化，只影响弹窗内的临时编辑体验。
 *
 * 需要 `original` 快照的原因：
 * - Close 要丢弃未提交修改，必须知道“恢复到哪里”。
 * - Apply 成功后要清空脏状态，也必须刷新新的“已确认基线”。
 * - 当容器切换或后端重新加载成功时，也需要把最新服务端结果同步成新的基线。
 */
export const usePermissionDraft = (
  initialEntriesByTab: PermissionEntriesByTab,
  resetKey: string,
) => {
  // 保存“本次编辑会话里最近一次确认后的基线快照”，Close / Reset 时需要回到这份数据。
  const [originalEntriesByTab, setOriginalEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );
  // 保存弹窗内当前正在编辑的草稿；表格里的增删改都只改这份数据。
  const [draftEntriesByTab, setDraftEntriesByTab] = useState(
    cloneEntriesByTab(initialEntriesByTab),
  );

  useEffect(() => {
    // `resetKey` 一般对应容器 ID。容器切换时，同时重建基线和草稿，避免不同容器串数据。
    const nextEntriesByTab = cloneEntriesByTab(initialEntriesByTab);
    setOriginalEntriesByTab(nextEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextEntriesByTab));
  }, [resetKey]);

  /**
   * 向指定页签追加一条新的草稿权限记录。
   * 这里要返回新数组而不是直接修改原数组，这样才能符合 React state 的“不可变”更新要求。
   */
  const addEntry = (
    tab: PermissionTabValue,
    entry: IContainerPermissionEntry,
  ) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: [...currentEntriesByTab[tab], entry],
    }));
  };

  /**
   * 更新指定权限项的角色，用于表格里的行内角色切换。
   * 这里用 map 生成一个新数组，逐项检查后只替换命中的 entry，其余 entry 保持原样。
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
   * 这里用 filter 生成一个新的数组，只需要留下的 entry，而不是直接在原数组上删除。
   */
  const removeEntry = (tab: PermissionTabValue, entryId: string) => {
    setDraftEntriesByTab((currentEntriesByTab) => ({
      ...currentEntriesByTab,
      [tab]: currentEntriesByTab[tab].filter((entry) => entry.id !== entryId),
    }));
  };

  /**
   * 放弃本次编辑，把草稿恢复到最近一次确认后的状态。
   */
  const resetDraft = () => {
    setDraftEntriesByTab(cloneEntriesByTab(originalEntriesByTab));
  };

  /**
   * 仅在本地把当前草稿提升成新的确认快照。
   *
   * 这仍然保留给纯本地场景或单元测试使用；
   * 真正的容器权限写回完成后，会优先使用 `replaceEntries` 把服务端最新结果同步回来。
   */
  const applyDraft = () => {
    const nextOriginalEntriesByTab = cloneEntriesByTab(draftEntriesByTab);
    setOriginalEntriesByTab(nextOriginalEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextOriginalEntriesByTab));
  };

  /**
   * 用服务端最新确认的权限快照同时重置 original 和 draft。
   *
   * 这个方法主要用于两种场景：
   * 1. Dialog 初次打开后，加载回来的真实容器权限；
   * 2. Apply 成功后，用后端最新结果覆盖本地草稿，清空脏状态。
   */
  const replaceEntries = (entriesByTab: PermissionEntriesByTab) => {
    const nextOriginalEntriesByTab = cloneEntriesByTab(entriesByTab);
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
    replaceEntries,
  };
};
