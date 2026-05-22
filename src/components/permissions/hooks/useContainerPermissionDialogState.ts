/**
 * 这个文件负责封装“容器权限弹窗”的状态。
 *
 * 主要职责：
 * - 维护当前选中的 tab（people / groups）
 * - 维护每个 tab 各自的搜索词，避免切页后互相覆盖
 * - 基于草稿机制管理新增、删除、改角色和放弃修改
 * - 提供适合 UI 直接消费的辅助方法，例如获取可见项、判断是否已添加
 *
 * 适用场景示例：
 * - 用户在 people tab 输入搜索词，不会影响 groups tab 已输入的关键字
 * - 用户先新增一个成员、再修改角色，最后由组件层触发真实 Apply
 * - 用户点击 Close 时，放弃当前改动并恢复到弹窗打开时或最近一次写回成功后的原始状态
 */

import { useState } from "react";
import {
  IContainerPermissionEntry,
  IContainerPermissionEntriesByTab,
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionModels";
import { usePermissionDraft } from "./usePermissionDraft";
import { usePermissionTabs } from "./usePermissionTabs";

/**
 * 组合权限弹窗所需的核心状态和操作。
 *
 * 这个 Hook 负责把“页签切换 + 草稿编辑 + 每页签独立输入值”收敛到一个入口，
 * 让组件层只关心渲染和事件绑定，不需要分别协调多个状态来源。
 *
 * 使用示例：
 * `const state = useContainerPermissionDialogState(initialEntriesByTab, containerId);`
 * `state.setFilter("people", "ade");`
 * `state.addCandidate("people", candidate);`
 * `state.replaceEntries(entriesFromServer);`
 *
 * @param initialEntriesByTab 弹窗初始化时的权限数据，按 people / groups 分类。
 * @param resetKey 当弹窗切换到新的容器或需要整体重置时使用的键。
 * @returns 提供给权限弹窗 UI 使用的状态、派生数据和操作函数。
 */
export const useContainerPermissionDialogState = (
  initialEntriesByTab: IContainerPermissionEntriesByTab,
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
    replaceEntries,
  } = usePermissionDraft(initialEntriesByTab, resetKey);

  // 分别保存 people / groups 自己的输入的搜索词。
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
   */
  const addCandidate = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => {
    addEntry(tab, createPermissionEntryFromCandidate(candidate));
  };

  /**
   * 放弃当前草稿修改，并在完成后关闭弹窗。
   */
  const discardDraftAndClose = (onClose: () => void) => {
    resetDraft();
    onClose();
  };

  /**
   * 返回当前 tab 下要显示在 access list 表格中的权限项。
   *
   * 当前顶部输入框只负责目录搜索，
   * 不再兼任 access list 的本地过滤，所以这里直接返回当前草稿列表。
   */
  const getVisibleEntries = (
    tab: PermissionTabValue,
  ): IContainerPermissionEntry[] => draftEntriesByTab[tab];

  /**
   * 判断候选 principal 是否已经存在于指定 tab 的 access list 中。
   *
   * 优先使用稳定的 Graph object id 去重；
   * 如果后端列出现有权限时没有返回 object id，则退回到规范化后的 email / UPN 辅助键。
   *
   * 这样可以兼容两类真实数据来源：
   * 1. 搜索结果：通常带稳定对象 id；
   * 2. 现有权限列表：某些 Graph 响应里只有 displayName + email / UPN，没有 user.id / group.id。
   */
  const isCandidateAdded = (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ): boolean => {
    return draftEntriesByTab[tab].some((entry) => {
      // groups tab：双方都有稳定的 AAD group object id，直接比较。
      if (tab === "groups") {
        return entry.principalId === candidate.id;
      }

      // people tab：用规范化后的 UPN 比较，兼容大小写差异。
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
 * 把目录搜索候选项转换成一条新的本地权限草稿记录。
 *
 */
const createPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IContainerPermissionEntry => ({
  // 使用“principal 类型 + principal ID”生成前端唯一键，方便表格渲染和本地更新定位。
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
