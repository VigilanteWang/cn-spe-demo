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
 * 这里会同时用于 original 和 draft：
 * - original 代表“上一次确认后的基线快照”，用于 Close / Reset 回滚。
 * - draft 代表“当前正在编辑的草稿快照”，用于页面内的增删改。
 *
 * 两份列表必须互相独立，也不能直接引用外部传入的 initial 数据，
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
/**
 * 管理草稿权限列表与“编辑前原始状态”。
 *
 * 这里保留两份列表，不是为了重复存储，而是为了把“基线”和“编辑中状态”拆开：
 * - initialEntriesByTab 是外部传进来的初始值，只负责初始化这次弹窗会话。
 * - originalEntriesByTab 保存本地维护的确认基线，Apply 后会前移到最新草稿。
 * - draftEntriesByTab 保存当前编辑过程中的变化，只影响弹窗内的临时编辑体验。
 * ---
 * 需要 original 拷贝的理由:弹窗内部的编辑、确认、撤销逻辑形成自洽的闭环，
 *
 * - 假设没有，只保留draft和initial，如果后台数据更新了，initial也变了，用户点击reset
 * 发现数据变了，可能会困惑，使用 original 进行快照符合 Reset 的预期语义。
 *
 * - 假设 Apply 提交后，网络延迟，虽然成功了，此时别人立刻又改了权限，如果直接对照 initial，就会发现
 * 又变了，又有未保存的更改，用户可能也会疑惑：究竟有没有保存？
 *
 * - initial 依靠父组件的 re-render 来更新，apply 后会没来得及更新至最新值，用户也会看到还有未保存更改
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
    // resetKey 一般对应容器 ID。容器切换时，同时重建基线和草稿，避免不同容器串数据。
    // 这里把 initial 当作“新会话的起点”，而不是自动同步的全局真值。
    const nextEntriesByTab = cloneEntriesByTab(initialEntriesByTab);
    setOriginalEntriesByTab(nextEntriesByTab);
    setDraftEntriesByTab(cloneEntriesByTab(nextEntriesByTab));
  }, [resetKey]);

  /**
   * 向指定页签追加一条新的草稿权限记录。
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
   * 确认当前草稿，并把它提升为新的基线快照。
   *
   * 这样下一轮编辑、回滚和未保存判断，都会以这次 Apply 后的结果为准。
   * 如果未来接入后端写回，这里还会和 ETag / version 校验配合，避免静默覆盖更新。
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
