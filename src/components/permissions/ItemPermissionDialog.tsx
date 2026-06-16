import { useCallback } from "react";
import { Link, Text } from "@fluentui/react-components";
import type {
  IItemPermissionEntriesByTab,
  IItemPermissionEntry,
  ItemPermissionRole,
} from "./models/itemPermissionModels";
import type { IPermissionPrincipalCandidate } from "./models/permissionSharedModels";
import { usePermissionDialogApiRequestState } from "./hooks/usePermissionDialogApiRequestState";
import { usePermissionDialogUIState } from "./hooks/usePermissionDialogUIState";
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
  createBasePermissionEntryFromCandidate,
  createEmptyPermissionEntriesByTab,
} from "./utils/permissionDialogSharedUtils";

const ITEM_PERMISSION_ROLES: ItemPermissionRole[] = ["Reader", "Writer"];
const ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT =
  "Inherited from the parent folder";
const ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions";
const ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting";

/**
 * 把目录搜索候选项转换成一条新的 Item 权限草稿记录。
 *
 * 这里先复用共享的基础字段映射，再补上 Item 场景默认的 Reader 角色。
 *
 * @param candidate 目录搜索返回的 user/group 候选项。
 * @returns 一条可直接加入 Item 权限草稿列表的新记录。
 */
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IItemPermissionEntry => ({
  ...createBasePermissionEntryFromCandidate(candidate),
  role: "Reader",
});

/**
 * 把过长的 item 名称截断到指定长度，避免标题区被撑破。
 *
 * @param itemName 当前 item 名称。
 * @param maxLength 允许展示的最大字符数。
 * @returns 适合放进弹窗标题区的短名称。
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
 *
 * 组件层自己负责把共享的 `usePermissionDialogUIState` 具体化成
 * Item 权限条目，再与目录搜索和请求状态拼成完整交互。
 *
 * @returns 渲染后的 Item 权限管理对话框。
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
  // 先准备一份空的按 tab 分组结构，供首次渲染和重置时复用。
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
  } = usePermissionDialogUIState(
    initialEntriesByTab,
    `${driveId ?? "__no-drive__"}:${itemId ?? "__no-item__"}`,
    createItemPermissionEntryFromCandidate,
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
   *
   * @returns 空的 people/groups 权限分组结构。
   */
  const createEmptyEntries = useCallback(() => {
    return createEmptyPermissionEntriesByTab<IItemPermissionEntry>();
  }, []);

  /**
   * 加载当前 item 的真实权限列表。
   *
   * @returns 后端返回的最新 item 权限分组。
   */
  const loadPermissions = useCallback(async () => {
    const { entriesByTab } = await listItemPermissions(driveId!, itemId!);
    return entriesByTab;
  }, [driveId, itemId]);

  /**
   * 把草稿差异写回后端，并返回服务端最新权限快照。
   *
   * @param changes 当前草稿相对原始数据的增删改集合。
   * @returns 应用变更后的最新 item 权限分组。
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
    permissionErrorMessages,
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

  // access list 只渲染当前 tab 对应的那一组草稿权限。
  const visibleEntries = getVisibleEntries(selectedTab);
  // 缺少目标 item、正在加载或正在保存时，都要统一禁用交互控件。
  const interactionDisabled =
    isLoadingPermissions || isApplyingPermissions || !driveId || !itemId;
  // 用全部草稿条目数量判断是否要显示“权限可能不可见”的免责声明。
  const totalVisibleEntriesCount =
    draftEntriesByTab.people.length + draftEntriesByTab.groups.length;
  // 只有加载完成、没有请求错误且列表确实为空时，才提示“Graph 可能没有返回权限”。
  const shouldShowEmptyVisibilityDisclaimer =
    !isLoadingPermissions &&
    !permissionRequestErrorMessage &&
    totalVisibleEntriesCount === 0;
  // 标题里优先展示截断后的名称，避免长文件名把布局撑乱。
  const truncatedItemName = itemName ? truncateItemName(itemName) : undefined;

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

    // 先丢弃本地草稿并关闭当前弹窗，再切到容器权限弹窗。
    discardDraftAndClose(() => {
      onClose();
      onManageContainerPermission();
    });
  };

  // 只有“列表为空且当前没有请求错误”时，才展示 item 权限可见性免责声明。
  const beforeAccessListContent = shouldShowEmptyVisibilityDisclaimer ? (
    <div
      className={styles.disclaimerBox}
      data-testid="item-permission-visibility-disclaimer"
    >
      <Text size={200}>
        This list may be empty even when item-level permissions exist. With only{" "}
        <strong>read access</strong> to this file, Microsoft Graph{" "}
        <strong>may not</strong> return them. Learn more at{" "}
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
      permissionErrorMessages={permissionErrorMessages}
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
        roleOptions: ITEM_PERMISSION_ROLES,
        isInteractionDisabled: interactionDisabled,
        inheritedTooltipText: ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT,
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
