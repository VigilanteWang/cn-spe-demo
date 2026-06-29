import { useCallback } from "react";
import { Text } from "@fluentui/react-components";
import type {
  ContainerUserPermissionRole,
  IContainerUserPermissionEntriesByTab,
  IContainerUserPermissionEntry,
} from "./models/containerUserPermissionModels";
import type { IPermissionPrincipalSearchCandidate } from "./models/permissionSharedModels";
import { usePermissionDialogApiRequestState } from "./hooks/usePermissionDialogApiRequestState";
import { useUserPermissionDialogUIState } from "./hooks/useUserPermissionDialogUIState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { UserPermissionPanel } from "./components/UserPermissionPanel";
import { IContainerPermissionDialogProps } from "./components/permissionsTypes";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import {
  applyContainerPermissionChanges,
  listContainerPermissions,
} from "../../services/containerPermissionApi";
import { computeContainerPermissionChanges } from "./utils/containerUserPermissionDiff";
import { createEmptyPermissionEntriesByTab } from "./utils/permissionDialogSharedUtils";
import { createBaseUserPermissionEntryFromCandidate } from "./utils/userPermissionEntryUtils";

const CONTAINER_PERMISSION_ROLES: ContainerUserPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

/**
 * 把目录搜索候选项转换成一条新的容器权限草稿记录。
 *
 * 这里先复用共享的基础字段映射，再补上容器场景默认的 Reader 角色。
 *
 * @param candidate 目录搜索返回的 user/group 候选项。
 * @returns 一条可直接加入容器权限草稿列表的新记录。
 */
const createContainerPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalSearchCandidate,
): IContainerUserPermissionEntry => ({
  ...createBaseUserPermissionEntryFromCandidate(candidate),
  role: "Reader",
});

/**
 * 容器权限管理对话框。
 *
 * 当前版本把原来混在组件里的三类逻辑拆开：
 * 1. `useUserPermissionDialogUIState` 管共享的 tab / draft / filter / 去重逻辑
 * 2. `usePermissionPrincipalSearch` 管目录搜索
 * 3. `usePermissionDialogApiRequestState` 管加载、Apply 和反馈状态
 *
 * 组件层自己主要负责把共享状态 Hook 具体化成容器权限场景，
 * 再把这些状态组装成统一的界面。
 */
export const ContainerPermissionDialog = ({
  open,
  containerId,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  const initialEntriesByTab =
    createEmptyPermissionEntriesByTab<IContainerUserPermissionEntry>();

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
  } = useUserPermissionDialogUIState(
    initialEntriesByTab,
    containerId ?? "__no-container__",
    createContainerPermissionEntryFromCandidate,
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
   */
  const createEmptyEntries = useCallback(() => {
    return createEmptyPermissionEntriesByTab<IContainerUserPermissionEntry>();
  }, []);

  /**
   * 加载当前容器的真实权限列表。
   */
  const loadPermissions = useCallback(async () => {
    return listContainerPermissions(containerId!);
  }, [containerId]);

  /**
   * 把草稿差异写回后端，并返回服务端最新权限快照。
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
    permissionErrorMessages,
    handleApply,
  } = usePermissionDialogApiRequestState<
    IContainerUserPermissionEntriesByTab,
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

  // access list 始终展示当前选中 tab 那一组草稿数据。
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
      permissionErrorMessages={permissionErrorMessages}
      selectedTab={selectedTab}
      interactionDisabled={interactionDisabled}
      isApplyingPermissions={isApplyingPermissions}
      applyFeedbackStatus={applyFeedbackStatus}
      isApplyDisabled={!hasUnsavedChanges || interactionDisabled}
      bodyContent={
        <UserPermissionPanel
          selectedTab={selectedTab}
          interactionDisabled={interactionDisabled}
          searchInputId="permission-principal-input"
          query={query}
          searchResults={results}
          searchStatus={status}
          isDropdownOpen={isDropdownOpen}
          onSearchQueryChange={handleQueryChange}
          onSearchCandidateSelect={handleCandidateSelect}
          isCandidateAdded={isCandidateAdded}
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
        />
      }
      onRequestClose={() => discardDraftAndClose(onClose)}
      onSelectedTabChange={setSelectedTab}
      onApply={() => {
        void handleApply();
      }}
    />
  );
};
