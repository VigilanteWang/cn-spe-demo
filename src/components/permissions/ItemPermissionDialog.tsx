import { useCallback, useMemo } from "react";
import { Link, Text } from "@fluentui/react-components";
import type {
  IItemPermissionEntriesByTab,
  IItemPermissionEntry,
  ItemPermissionRole,
} from "./models/itemPermissionModels";
import { useItemPermissionDialogState } from "./hooks/useItemPermissionDialogState";
import { usePermissionDialogApiRequestState } from "./hooks/usePermissionDialogApiRequestState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import { usePermissionsStyles } from "./components/permissionsStyles";
import type { IItemPermissionDialogProps } from "./components/permissionsTypes";
import {
  applyItemPermissionChanges,
  listItemPermissions,
} from "../../services/itemPermissionApi";
import { computeItemPermissionChanges } from "./services/itemPermissionDiff";
import {
  createEmptyPermissionEntriesByTab,
  getPermissionTabTitle,
} from "./utils/permissionDialogSharedUtils";

const ITEM_PERMISSION_ROLES: ItemPermissionRole[] = ["Reader", "Writer"];
const ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT =
  "Inherited from the parent folder";
const ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions";
const ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting";

/**
 * 把过长的 item 名称截断到指定长度，避免标题区被撑破。
 */
const truncateItemName = (itemName: string, maxLength = 32) => {
  if (itemName.length <= maxLength) {
    return itemName;
  }

  return `${itemName.slice(0, Math.max(0, maxLength - 1))}…`;
};

/**
 * Item 权限管理对话框。
 *
 * 这个组件沿用容器权限弹窗的交互骨架，但保留了 Item 特有的两部分文案：
 * 1. “权限可见性”免责声明
 * 2. 跳转到容器权限的入口
 */
export const ItemPermissionDialog = ({
  open,
  driveId,
  itemId,
  itemName,
  onClose,
  onManageContainerPermission,
}: IItemPermissionDialogProps) => {
  const styles = usePermissionsStyles();
  const initialEntriesByTab =
    createEmptyPermissionEntriesByTab<IItemPermissionEntry>();

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
  } = useItemPermissionDialogState(
    initialEntriesByTab,
    `${driveId ?? "__no-drive__"}:${itemId ?? "__no-item__"}`,
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
   * 为 API 状态 Hook 提供“空结果工厂”，缺少 item 时用它重置本地列表。
   */
  const createEmptyEntries = useCallback(() => {
    return createEmptyPermissionEntriesByTab<IItemPermissionEntry>();
  }, []);

  /**
   * 加载当前 item 的真实权限列表。
   */
  const loadPermissions = useCallback(async () => {
    const { entriesByTab } = await listItemPermissions(driveId!, itemId!);
    return entriesByTab;
  }, [driveId, itemId]);

  /**
   * 把草稿差异写回后端，并返回服务端最新权限快照。
   */
  const applyChanges = useCallback(
    async (changes: ReturnType<typeof computeItemPermissionChanges>) => {
      const { entriesByTab } = await applyItemPermissionChanges(
        driveId!,
        itemId!,
        changes,
      );
      return entriesByTab;
    },
    [driveId, itemId],
  );

  const {
    isLoadingPermissions,
    isApplyingPermissions,
    permissionRequestErrorMessage,
    applyFeedbackStatus,
    permissionStatusMessages,
    handleApply,
  } = usePermissionDialogApiRequestState<
    IItemPermissionEntriesByTab,
    ReturnType<typeof computeItemPermissionChanges>
  >({
    open,
    isTargetReady: Boolean(driveId && itemId),
    searchError,
    resourceLabel: "item",
    createEmptyEntriesByTab: createEmptyEntries,
    originalEntriesByTab,
    draftEntriesByTab,
    replaceEntries,
    loadPermissions,
    computeChanges: computeItemPermissionChanges,
    applyChanges,
  });

  const visibleEntries = getVisibleEntries(selectedTab);
  const interactionDisabled =
    isLoadingPermissions || isApplyingPermissions || !driveId || !itemId;
  const totalVisibleEntriesCount =
    draftEntriesByTab.people.length + draftEntriesByTab.groups.length;
  const shouldShowEmptyVisibilityDisclaimer =
    !isLoadingPermissions &&
    !permissionRequestErrorMessage &&
    totalVisibleEntriesCount === 0;
  const truncatedItemName = itemName ? truncateItemName(itemName) : undefined;

  const emptyStateText = useMemo(() => {
    if (shouldShowEmptyVisibilityDisclaimer) {
      return "No permissions are currently visible in this dialog.";
    }

    return `No ${getPermissionTabTitle(
      selectedTab,
    ).toLowerCase()} permissions added yet.`;
  }, [selectedTab, shouldShowEmptyVisibilityDisclaimer]);

  /**
   * 从 Item 权限切换到容器权限。
   *
   * 如果当前还有未保存草稿，先确认是否放弃，再执行跳转。
   */
  const handleManageContainerPermissionClick = () => {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "You have unsaved changes. Discard them and manage container permissions instead?",
      )
    ) {
      return;
    }

    discardDraftAndClose(() => {
      onClose();
      onManageContainerPermission();
    });
  };

  const beforeAccessListContent = shouldShowEmptyVisibilityDisclaimer ? (
    <div
      className={styles.disclaimerBox}
      data-testid="item-permission-visibility-disclaimer"
    >
      <Text size={200}>
        This list may be empty even when item-level permissions exist. With only{" "}
        <strong>read access</strong> to this file, Microsoft Graph may not
        return them. Learn more at{" "}
        <Link
          href={ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL}
          target="_blank"
        >
          here
        </Link>{" "}
        and{" "}
        <Link
          href={ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL}
          target="_blank"
        >
          here
        </Link>
        .
      </Text>
    </div>
  ) : null;

  return (
    <PermissionDialogFrame
      open={open}
      title="Manage Item Permission"
      headerContent={
        <div className={styles.itemHeaderText}>
          <Text
            weight="semibold"
            title={itemName}
            className={styles.itemSubtitle}
          >
            {truncatedItemName ?? "<No item selected>"}
          </Text>
          <div className={styles.itemHeaderMetaRow}>
            <Text size={200} className={styles.searchStatusText}>
              Item-level permissions are additive to container permissions.
              Click to manage
              <Link
                as="button"
                className={styles.inlineLink}
                disabled={isApplyingPermissions}
                onClick={handleManageContainerPermissionClick}
              >
                Container Permission
              </Link>
            </Text>
          </div>
        </div>
      }
      permissionStatusMessages={permissionStatusMessages}
      selectedTab={selectedTab}
      interactionDisabled={interactionDisabled}
      searchInputId="item-permission-principal-input"
      query={query}
      searchResults={results}
      searchStatus={status}
      isDropdownOpen={isDropdownOpen}
      isApplyingPermissions={isApplyingPermissions}
      applyFeedbackStatus={applyFeedbackStatus}
      isApplyDisabled={interactionDisabled || !hasUnsavedChanges}
      isCloseDisabled={isApplyingPermissions}
      beforeAccessListContent={beforeAccessListContent}
      accessListProps={{
        entries: visibleEntries,
        isLoading: isLoadingPermissions,
        loadingMessage: "Loading current item permissions...",
        emptyStateText,
        roleOptions: ITEM_PERMISSION_ROLES,
        isInteractionDisabled: interactionDisabled,
        inheritedTooltipText: ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT,
        onRoleChange: (entry, role) => {
          updateEntryRole(selectedTab, entry.id, role);
        },
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
