/**
 * 这个文件负责封装“容器权限编辑弹窗”的本地交互状态。
 *
 * 主要职责：
 * - 维护当前选中的 tab （people / groups）
 * - 维护每个 tab 各自的筛选词，避免切页后互相覆盖
 * - 基于草稿机制管理新增、删除、改角色、应用和放弃修改
 * - 提供适合 UI 直接消费的辅助方法，例如获取可见项、判断是否已添加
 *
 * 适用场景示例：
 * - 用户在 people  tab 搜索 “alice”，只过滤人员，不影响 groups  tab 的搜索词
 * - 用户先新增一个成员、再修改角色，最后点击保存时统一应用草稿
 * - 用户点击取消时，放弃当前改动并恢复到弹窗打开时的原始状态
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
 * 这个 Hook 把“ tab 切换 + 草稿编辑 + 本地筛选”收敛到一个入口，
 * 让组件层只关心渲染和事件绑定，不需要分别协调多个状态来源。
 *
 * 使用示例：
 * const state = useContainerPermissionDialogState(initialEntriesByTab, containerId);
 * state.setFilter("people", "alice");
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
  // 当前选中的 tab 决定了输入框、候选列表和表格正在操作 people 还是 groups。
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
  // 这里给两个 tab 共用同一个输入框，但分别保存 people/groups 自己的筛选词。
  // 切换 tab 时，界面显示的是当前 tab 对应的 filter，避免两个 tab 互相覆盖搜索内容。
  const [filterByTab, setFilterByTab] = useState<
    Record<PermissionTabValue, string>
  >({
    people: "",
    groups: "",
  });

  /**
   * 更新指定 tab 的筛选关键字。
   *
   * 这里不会清空另一个 tab 的值，因此用户在 people 中输入的搜索词，
   * 不会因为切到 groups 再输入内容而丢失。
   *
   * 使用示例：
   * setFilter("people", "alice");
   * setFilter("groups", "finance");
   *
   * @param tab 要更新的 tab 。
   * @param value 当前 tab 输入框的新值。
   */
  const setFilter = (tab: PermissionTabValue, value: string) => {
    setFilterByTab((currentFilters) => ({
      ...currentFilters,
      // 这里[]取 tab 的值作为键，动态更新对应的 filter
      [tab]: value,
    }));
  };

  /**
   * 把候选对象转换成权限记录，并追加到指定 tab 的草稿列表。
   *
   * 这样组件层不需要关心候选数据和权限行数据之间的结构差异。
   *
   * 使用示例：
   * addCandidate("people", {
   *   id: "user-1",
   *   displayName: "Alice Zhang",
   *   principalType: "user",
   * });
   *
   * @param tab 要新增到哪个 tab 。
   * @param candidate 待添加的候选 principal 。
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createPermissionEntryFromCandidate(candidate));
  };

  /**
   * 放弃当前草稿修改，并在完成后关闭弹窗。
   * @param onClose 用于关闭弹窗的回调。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 应用当前草稿修改，并在完成后关闭弹窗。
   * @param onClose 用于关闭弹窗的回调。
   */
  const applyDraftAndClose = (onClose: () => void) => {
    applyDraft();
    onClose();
  };

  /**
   * 返回当前 tab 下应展示在表格中的权限项。
   *
   * 如果没有筛选词，就返回整份草稿；
   * 如果有筛选词，就按姓名和描述做本地包含匹配。
   *
   * 使用示例：
   * const visiblePeople = getVisibleEntries("people");
   *
   * @param tab 目标 tab 。
   * @returns 当前 tab 过滤后的可见权限项列表。
   */
  const getVisibleEntries = (
    tab: PermissionTabValue,
  ): IContainerPermissionEntry[] => {
    const normalizedFilter = filterByTab[tab].trim().toLowerCase();

    if (!normalizedFilter) {
      return draftEntriesByTab[tab];
    }

    return draftEntriesByTab[tab].filter((entry) => {
      const searchableText =
        `${entry.principalName} ${entry.description}`.toLowerCase();
      return searchableText.includes(normalizedFilter);
    });
  };

  /**
   * 判断候选 principal 是否已经存在于指定 tab 的草稿中。
   *
   * 这个方法通常用于禁用“重复添加”的按钮或候选项。
   *
   * 使用示例：
   * const alreadyAdded = isCandidateAdded("groups", "group-123");
   *
   * @param tab 要检查的 tab 。
   * @param candidateId 候选 principal 的唯一标识。
   * @returns 如果草稿里已存在该 principal ，返回 true。
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
