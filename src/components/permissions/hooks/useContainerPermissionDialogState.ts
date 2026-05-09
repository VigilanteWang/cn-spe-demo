/**
 * 这个文件负责封装“容器权限编辑弹窗”的本地交互状态。
 *
 * 主要职责：
 * - 维护当前选中的 tab（people / groups）
 * - 维护每个 tab 各自的输入值，避免切页后互相覆盖
 * - 基于草稿机制管理新增、删除、改角色、应用和放弃修改
 * - 提供适合 UI 直接消费的辅助方法，例如获取可见项、判断是否已添加
 *
 * 适用场景示例：
 * - 用户在 people tab 输入搜索词，不会影响 groups tab 已输入的关键字
 * - 用户先新增一个成员、再修改角色，最后点击 Apply 时统一确认草稿
 * - 用户点击 Close 时，放弃当前改动并恢复到弹窗打开时的原始状态
 */

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
 * 组合权限弹窗所需的核心状态和操作。
 *
 * 这个 Hook 负责把“页签切换 + 草稿编辑 + 每页签独立输入值”收敛到一个入口，
 * 让组件层只关心渲染和事件绑定，不需要分别协调多个状态来源。
 *
 * 使用示例：
 * const state = useContainerPermissionDialogState(initialEntriesByTab, containerId);
 * state.setFilter("people", "ade");
 * state.addCandidate("people", candidate);
 * state.applyDraftAndClose(onClose);
 *
 * @param initialEntriesByTab 弹窗初始化时的权限数据，按 people / groups 分类。
 * @param resetKey 当弹窗切换到新的容器或需要整体重置时使用的键。
 * @returns 提供给权限弹窗 UI 使用的状态、派生数据和操作函数。
 */
export const useContainerPermissionDialogState = (
  initialEntriesByTab: PermissionEntriesByTab,
  resetKey: string,
) => {
  // 当前选中的 tab 决定了搜索框、候选列表和表格正在操作 people 还是 groups。
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

  // 两个 tab 共用一个输入框外壳，但分别保存 people / groups 自己的输入值。
  const [filterByTab, setFilterByTab] = useState<
    Record<PermissionTabValue, string>
  >({
    people: "",
    groups: "",
  });

  /**
   * 更新指定 tab 的输入值。
   *
   * 这里不会清空另一个 tab 的内容，因此用户切换页签后还能保留刚才的输入上下文。
   *
   * @param tab 要更新的 tab。
   * @param value 当前 tab 输入框的新值。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      [tab]: value,
    }));
  };

  /**
   * 把候选对象转换成权限记录，并追加到指定 tab 的草稿列表。
   *
   * 这样组件层不需要关心候选数据和权限行数据之间的结构差异。
   *
   * @param tab 要新增到哪个 tab。
   * @param candidate 待添加的候选 principal。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createPermissionEntryFromCandidate(candidate));
  };

  /**
   * 放弃当前草稿修改，并在完成后关闭弹窗。
   *
   * @param onClose 用于关闭弹窗的回调。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 应用当前草稿修改，并在完成后关闭弹窗。
   *
   * 当前阶段这里只是把本地草稿提升为“已确认状态”，
   * 真实写回 Graph 会在后续步骤接入。
   *
   * @param onClose 用于关闭弹窗的回调。
   */
  const applyDraftAndClose = (onClose: () => void) => {
    applyDraft();
    onClose();
  };

  /**
   * 返回当前 tab 下要显示在 access list 表格中的权限项。
   *
   * 这一阶段顶部输入框已经专门用于目录搜索，
   * 不再兼任 access list 的本地过滤，所以这里直接返回当前草稿列表。
   *
   * @param tab 目标 tab。
   * @returns 当前 tab 的可见权限项列表。
   */
  const getVisibleEntries = (
    tab: PermissionTabValue,
  ): IContainerPermissionEntry[] => draftEntriesByTab[tab];

  /**
   * 判断候选 principal 是否已经存在于指定 tab 的 access list 中。
   *
   * 这个方法用于防止重复添加，并给搜索结果区提供“已存在”标记。
   *
   * @param tab 要检查的 tab。
   * @param candidateId 候选 principal 的唯一标识。
   * @returns 如果 access list 已存在该 principal，返回 true。
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
