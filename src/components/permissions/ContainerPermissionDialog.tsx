import { useCallback } from "react";
import { Text } from "@fluentui/react-components";
import type {
  ContainerPermissionRole,
  IContainerPermissionEntriesByTab,
  IContainerPermissionEntry,
} from "./models/containerPermissionModels";
import { useContainerPermissionDialogState } from "./hooks/useContainerPermissionDialogState";
import { usePermissionDialogApiRequestState } from "./hooks/usePermissionDialogApiRequestState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { IContainerPermissionDialogProps } from "./components/permissionsTypes";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import {
  applyContainerPermissionChanges,
  listContainerPermissions,
} from "../../services/containerPermissionApi";
import { computeContainerPermissionChanges } from "./services/containerPermissionDiff";
import { createEmptyPermissionEntriesByTab } from "./utils/permissionDialogSharedUtils";

const CONTAINER_PERMISSION_ROLES: ContainerPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

/**
 * 容器权限管理对话框。
 *
 * 当前版本把原来混在组件里的三类逻辑拆开了：
 * 1. `useContainerPermissionDialogState` 管本地草稿和页签
 * 2. `usePermissionPrincipalSearch` 管目录搜索
 * 3. `usePermissionDialogApiRequestState` 管加载、Apply 和反馈状态
 *
 * 组件层自己主要负责把三块状态组装成统一的界面骨架。
 *
 * @returns 渲染后的容器权限管理对话框。
 */
export const ContainerPermissionDialog = ({
  open,
  containerId,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  // 先准备一份空的按 tab 分组结构，供首次渲染和重置时复用。
  const initialEntriesByTab =
    createEmptyPermissionEntriesByTab<IContainerPermissionEntry>();

  const {
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
  } = useContainerPermissionDialogState(
    initialEntriesByTab,
    containerId ?? "__no-container__",
  );

  const {
    query,
    results,
    status,
    searchError,
    isDropdownOpen,
    handleQueryChange,
    handleCandidateSelect,
  } = usePermissionPrincipalSearch({
    selectedTab,
    queryByTab: filterByTab,
    setQuery: setFilter,
    addCandidate,
    isCandidateAdded,
  });

  /**
   * 为 API 状态 Hook 提供“空结果工厂”，缺少容器时用它重置本地列表。
   *
   * @returns 空的 people/groups 权限分组结构。
   */
  const createEmptyEntries = useCallback(() => {
    return createEmptyPermissionEntriesByTab<IContainerPermissionEntry>();
  }, []);

  /**
   * 加载当前容器的真实权限列表。
   *
   * @returns 后端返回的最新容器权限分组。
   */
  const loadPermissions = useCallback(async () => {
    return listContainerPermissions(containerId!);
  }, [containerId]);

  /**
   * 把草稿差异写回后端，并返回服务端最新权限快照。
   *
   * @param changes 当前草稿相对原始数据的增删改集合。
   * @returns 应用变更后的最新容器权限分组。
   */
  const applyChanges = useCallback(
    async (changes: ReturnType<typeof computeContainerPermissionChanges>) => {
      return applyContainerPermissionChanges(containerId!, changes);
    },
    [containerId],
  );

  const {
    isLoadingPermissions,
    isApplyingPermissions,
    applyFeedbackStatus,
    permissionStatusMessages,
    handleApply,
  } = usePermissionDialogApiRequestState<
    IContainerPermissionEntriesByTab,
    ReturnType<typeof computeContainerPermissionChanges>
  >({
    open,
    isTargetReady: Boolean(containerId),
    searchError,
    resourceLabel: "container",
    createEmptyEntriesByTab: createEmptyEntries,
    originalEntriesByTab,
    draftEntriesByTab,
    replaceEntries,
    loadPermissions,
    computeChanges: computeContainerPermissionChanges,
    applyChanges,
  });

  // access list 始终展示当前选中页签那一组草稿数据。
  const visibleEntries = getVisibleEntries(selectedTab);
  // 缺少目标容器、正在加载或正在保存时，都要统一禁用交互控件。
  const interactionDisabled =
    isLoadingPermissions || isApplyingPermissions || !containerId;

  return (
    <PermissionDialogFrame
      open={open}
      title="Manage Container Permission"
      headerContent={
        <Text weight="semibold">
          {containerName ?? "<No container selected>"}
        </Text>
      }
      permissionStatusMessages={permissionStatusMessages}
      selectedTab={selectedTab}
      interactionDisabled={interactionDisabled}
      searchInputId="permission-principal-input"
      query={query}
      searchResults={results}
      searchStatus={status}
      isDropdownOpen={isDropdownOpen}
      isApplyingPermissions={isApplyingPermissions}
      applyFeedbackStatus={applyFeedbackStatus}
      isApplyDisabled={!hasUnsavedChanges || interactionDisabled}
      accessListProps={{
        entries: visibleEntries,
        isLoading: isLoadingPermissions,
        roleOptions: CONTAINER_PERMISSION_ROLES,
        isInteractionDisabled: interactionDisabled,
        // 角色修改要带上当前 tab，才能精确更新对应分组里的那条草稿。
        onRoleChange: (entry, role) => {
          updateEntryRole(selectedTab, entry.id, role);
        },
        // 删除同样基于当前 tab 执行，避免误删另一组草稿数据。
        onRemove: (entry) => {
          removeEntry(selectedTab, entry.id);
        },
        isRoleDisabled: (entry) => !entry.isEditable,
        isRemoveDisabled: (entry) => !entry.isRemovable,
      }}
      onRequestClose={() => discardDraftAndClose(onClose)}
      onSelectedTabChange={setSelectedTab}
      onSearchQueryChange={handleQueryChange}
      onSearchCandidateSelect={handleCandidateSelect}
      isCandidateAdded={isCandidateAdded}
      onApply={() => {
        void handleApply();
      }}
    />
  );
};
