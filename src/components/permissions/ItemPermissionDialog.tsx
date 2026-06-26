import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Text } from "@fluentui/react-components";
import { AppError, formatAppErrorMessageForUI } from "../../../common/appError";
import { isSupportedItemLinkPermissionTarget } from "../../../common/helper/itemLinkPermissionCommonHelper";
import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemUserPermissionChangeSetFromUI,
} from "../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemUserPermissionEntry,
  ItemUserPermissionRole,
} from "./models/itemUserPermissionModels";
import type { IPermissionPrincipalSearchCandidate } from "./models/permissionSharedModels";
import type { ItemPermissionDialogTabValue } from "./models/itemLinkPermissionModels";
import { useUserPermissionDialogUIState } from "./hooks/useUserPermissionDialogUIState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { useItemLinkPermissionUIState } from "./hooks/useItemLinkPermissionUIState";
import { useItemLinkPermissionApiRequestState } from "./hooks/useItemLinkPermissionApiRequestState";
import { UserPermissionPanel } from "./components/UserPermissionPanel";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import { ItemLinkPermissionPanel } from "./components/ItemLinkPermissionPanel";
import { usePermissionsStyles } from "./components/permissionsStyles";
import type { IItemPermissionDialogProps } from "./components/permissionsTypes";
import {
  applyItemUserPermissionChanges,
  listItemUserPermissions,
} from "../../services/itemPermissionApi";
import { computeItemPermissionChanges } from "./services/itemUserPermissionDiff";
import {
  buildPermissionErrorMessages,
  createEmptyPermissionEntriesByTab,
  type PermissionApplyFeedbackStatus,
} from "./utils/permissionDialogSharedUtils";
import { buildItemPermissionDialogHeaderState } from "./utils/itemPermissionDialogUtils";
import { createBaseUserPermissionEntryFromCandidate } from "./utils/userPermissionEntryUtils";

// ===== 文件级常量与纯 helper =====

const ITEM_PERMISSION_ROLES: ItemUserPermissionRole[] = ["Reader", "Writer"];
const ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT =
  "Inherited from the parent folder";
const ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions";
const ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting";

/**
 * 把目录搜索候选项转换成一条新的 Item User 权限草稿记录。
 *
 * 这里先复用共享的基础字段映射，再补上 Item 场景默认的 `Reader` 角色，
 * 这样 people/groups 两个 tab 新增记录时都能直接复用同一套入口。
 *
 * @param candidate 目录搜索返回的 user/group 候选项。
 * @returns 一条可直接加入草稿列表的 Item 权限记录。
 */
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalSearchCandidate,
): IItemUserPermissionEntry => ({
  ...createBaseUserPermissionEntryFromCandidate(candidate),
  role: "Reader",
});

/**
 * Item 权限管理对话框。
 *
 * 这个组件负责把两套能力编排到同一个弹窗里：
 * - people/groups：沿用 User 权限列表和 diff 提交模型
 * - links：使用单独的加载、差异与提交状态
 * - Apply：在这里统一协调两边的提交顺序和错误反馈
 *
 * @param props Item 权限弹窗所需的资源标识、展示信息和关闭回调。
 * @returns Item 权限管理对话框。
 */
export const ItemPermissionDialog = ({
  open,
  driveId,
  itemId,
  itemName,
  isFolder,
  mimeType,
  fileName,
  onClose,
  onManageContainerPermission,
}: IItemPermissionDialogProps) => {
  // ===== 样式与基础上下文 =====

  const styles = usePermissionsStyles();
  // people/groups tab 始终基于同一份空结构起步，避免后续逻辑频繁判空。
  const initialUserPermissionEntriesByTab =
    createEmptyPermissionEntriesByTab<IItemUserPermissionEntry>();
  // 资源切换时同时驱动 User 权限和 link 权限相关 Hook 重置本地会话状态。
  const targetResetKey = `${driveId ?? "__no-drive__"}:${itemId ?? "__no-item__"}`;
  const isSupportedLinkTarget = isSupportedItemLinkPermissionTarget({
    name: fileName ?? itemName,
    mimeType,
    isFolder: Boolean(isFolder),
  });

  // ===== 弹窗级状态 =====

  const [selectedDialogTab, setSelectedDialogTab] =
    useState<ItemPermissionDialogTabValue>("people");
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [permissionRequestErrorMessage, setPermissionRequestErrorMessage] =
    useState<string | null>(null);
  const [applyFeedbackStatus, setApplyFeedbackStatus] =
    useState<PermissionApplyFeedbackStatus>(null);

  // ===== people/groups 状态层 =====

  const {
    selectedTab: selectedUserPermissionTab,
    setSelectedTab: setSelectedUserPermissionTab,
    filterByTab: userPermissionFilterByTab,
    setFilter: setUserPermissionFilter,
    originalEntriesByTab: userPermissionOriginalEntriesByTab,
    draftEntriesByTab: userPermissionDraftEntriesByTab,
    hasUnsavedChanges: hasUnsavedUserPermissionChanges,
    addCandidate: addUserPermissionCandidate,
    updateEntryRole: updateUserPermissionEntryRole,
    removeEntry: removeUserPermissionEntry,
    discardDraftAndClose: discardUserPermissionDraftAndClose,
    replaceEntries: replaceUserPermissionEntries,
    getVisibleEntries: getVisibleUserPermissionEntries,
    isCandidateAdded: isUserPermissionCandidateAdded,
  } = useUserPermissionDialogUIState(
    initialUserPermissionEntriesByTab,
    targetResetKey,
    createItemPermissionEntryFromCandidate,
  );

  // 主体搜索只服务于 people/groups，因此直接跟随 User 权限 tab 状态。
  const {
    query: userPermissionQuery,
    results: userPermissionSearchResults,
    status: userPermissionSearchStatus,
    searchError: userPermissionSearchError,
    isDropdownOpen: isUserPermissionDropdownOpen,
    handleQueryChange: handleUserPermissionQueryChange,
    handleCandidateSelect: handleUserPermissionCandidateSelect,
  } = usePermissionPrincipalSearch({
    selectedTab: selectedUserPermissionTab,
    queryByTab: userPermissionFilterByTab,
    setQuery: setUserPermissionFilter,
    addCandidate: addUserPermissionCandidate,
    isCandidateAdded: isUserPermissionCandidateAdded,
  });

  // ===== links 状态层 =====

  // links tab 的请求生命周期单独管理，避免和 people/groups 的加载状态互相污染。
  const {
    originalEntries: itemLinkOriginalEntries,
    isLoadingPermissions: isLoadingItemLinkPermissions,
    loadErrorMessage: itemLinkLoadErrorMessage,
    resetLoadState: resetItemLinkLoadState,
    prepareChangeSet: prepareItemLinkChangeSet,
    applyPreparedChanges: applyItemLinkPreparedChanges,
    reconcileAppliedEntries: reconcileAppliedItemLinkEntries,
  } = useItemLinkPermissionApiRequestState({
    open,
    driveId,
    itemId,
    resetKey: targetResetKey,
    isSupportedLinkTarget,
    selectedDialogTab,
  });

  // links tab 的本地差异、校验和面板事件也保持独立，便于单独演进。
  const {
    entries: itemLinkEntries,
    createLinkScope,
    createLinkType,
    setCreateLinkScope,
    setCreateLinkType,
    diff: itemLinkDiff,
    hasUnsavedChanges: hasUnsavedItemLinkPermissionChanges,
    hasBlockingValidationError: hasBlockingItemLinkValidationError,
    resetDiffState: resetItemLinkDiffState,
    resetSectionState: resetItemLinkSectionState,
    onAddLink,
    onDeleteLink,
    onCopyLink,
    onAddRecipient,
    onRemoveRecipient,
  } = useItemLinkPermissionUIState({
    resetKey: targetResetKey,
    originalEntries: itemLinkOriginalEntries,
    onResetLoadState: resetItemLinkLoadState,
  });

  // ===== 请求兜底文案与派生状态 =====

  // 缺少目标资源时统一构造稳定的前端校验错误，避免分散提示文案。
  const missingTargetError = useMemo(
    () =>
      new AppError({
        name: "PermissionValidationError",
        code: "missingTarget",
        message: "No item selected.",
        originError: {
          source: "validation",
        },
      }),
    [],
  );

  const requestFallbackMessages = useMemo(
    () => ({
      loadUserPermissions: "Unable to load current item permissions.",
      preparePermissions: "Unable to prepare item permission changes.",
      applyUserPermissions: "Unable to apply item permission changes.",
      applyItemLinkPermissions: "Unable to apply item link permission changes.",
    }),
    [],
  );

  const hasUnsavedChanges =
    hasUnsavedUserPermissionChanges || hasUnsavedItemLinkPermissionChanges;
  const combinedRequestErrorMessage =
    itemLinkLoadErrorMessage ?? permissionRequestErrorMessage;
  // links tab 下不展示 people/groups 的目录搜索错误，避免顶部消息和当前面板不匹配。
  const permissionErrorMessages = useMemo(
    () =>
      buildPermissionErrorMessages(
        combinedRequestErrorMessage,
        selectedDialogTab === "links" ? null : userPermissionSearchError,
      ),
    [combinedRequestErrorMessage, selectedDialogTab, userPermissionSearchError],
  );
  // access list 只渲染当前 people/groups tab 对应的那组 User 权限草稿。
  const visibleUserPermissionEntries = getVisibleUserPermissionEntries(
    selectedUserPermissionTab,
  );
  const totalVisibleUserPermissionEntriesCount =
    userPermissionDraftEntriesByTab.people.length +
    userPermissionDraftEntriesByTab.groups.length;
  // 当列表为空且没有请求错误时，提示“只读权限下 Graph 可能不返回 item 级权限”。
  const shouldShowUserPermissionVisibilityDisclaimer =
    !isLoadingPermissions &&
    !combinedRequestErrorMessage &&
    totalVisibleUserPermissionEntriesCount === 0;
  const userPermissionInteractionDisabled =
    isLoadingPermissions || isApplyingPermissions || !driveId || !itemId;
  // Apply 按钮需要同时考虑两套面板的状态，以及 links 面板的阻塞性校验错误。
  const isApplyDisabled =
    userPermissionInteractionDisabled ||
    (selectedDialogTab === "links" && isLoadingItemLinkPermissions) ||
    !hasUnsavedChanges ||
    hasBlockingItemLinkValidationError;
  const itemPermissionDialogHeaderState = buildItemPermissionDialogHeaderState(
    itemName,
    isApplyingPermissions,
  );
  const dialogTabs: { value: ItemPermissionDialogTabValue; label: string }[] = [
    { value: "people", label: "People" },
    { value: "groups", label: "Groups" },
    // 只有当前资源支持 link 权限时，才显示 links tab。
    ...(isSupportedLinkTarget
      ? [{ value: "links" as const, label: "Links" }]
      : []),
  ];
  const userPermissionDisclaimerContent =
    shouldShowUserPermissionVisibilityDisclaimer ? (
      <div
        className={styles.disclaimerBox}
        data-testid="item-permission-visibility-disclaimer"
      >
        <Text size={200}>
          This list may be empty even when item-level permissions exist. With
          only <strong>read access</strong> to this file, Microsoft Graph{" "}
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

  // ===== effects =====

  useEffect(() => {
    // 当前资源不支持 link 权限时，强制把选中的弹窗 tab 切回 User 权限 tab。
    if (selectedDialogTab === "links" && !isSupportedLinkTarget) {
      setSelectedDialogTab(selectedUserPermissionTab);
    }
  }, [isSupportedLinkTarget, selectedDialogTab, selectedUserPermissionTab]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!driveId || !itemId) {
      // 没有选中 item 时，把 User 权限和 links 两边都重置回空状态并给出明确提示。
      setIsLoadingPermissions(false);
      replaceUserPermissionEntries(
        createEmptyPermissionEntriesByTab<IItemUserPermissionEntry>(),
      );
      resetItemLinkSectionState();
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          missingTargetError,
          missingTargetError.message,
        ),
      );
      setApplyFeedbackStatus(null);
      return;
    }

    // 设置 loading 状态并清除旧错误和反馈状态。
    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    // people/groups 的 User 权限在弹窗打开时立即加载，成功后同时刷新基线和草稿。
    void listItemUserPermissions(driveId, itemId)
      .then(({ entriesByTab }) => {
        if (!cancelled) {
          replaceUserPermissionEntries(entriesByTab);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 读取失败时清空旧数据，避免用户继续看到上一个资源留下的列表。
          replaceUserPermissionEntries(
            createEmptyPermissionEntriesByTab<IItemUserPermissionEntry>(),
          );
          setPermissionRequestErrorMessage(
            formatAppErrorMessageForUI(
              error,
              requestFallbackMessages.loadUserPermissions,
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      });

    return () => {
      // 请求返回晚于弹窗关闭或目标切换时，阻止过期结果回写状态。
      cancelled = true;
    };
  }, [
    driveId,
    itemId,
    missingTargetError,
    open,
    replaceUserPermissionEntries,
    requestFallbackMessages,
    resetItemLinkSectionState,
  ]);

  // ===== 事件方法 =====

  /**
   * 重置当前对话框会话级状态。
   *
   * 这里不会重新请求数据，只负责把当前本地 tab、错误提示和 link 面板差异
   * 恢复到“下次打开弹窗时应有的初始样子”。
   */
  const resetDialogState = useCallback(() => {
    resetItemLinkSectionState();
    setSelectedDialogTab("people");
    setSelectedUserPermissionTab("people");
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);
  }, [resetItemLinkSectionState, setSelectedUserPermissionTab]);

  /**
   * 关闭弹窗前先丢弃未保存的本地草稿，再统一重置会话状态。
   */
  const handleDialogClose = useCallback(() => {
    discardUserPermissionDraftAndClose(() => {
      resetDialogState();
      onClose();
    });
  }, [discardUserPermissionDraftAndClose, onClose, resetDialogState]);

  /**
   * 跳去管理容器权限前，先处理当前弹窗里的未保存改动。
   *
   * 由于 item 权限与 container 权限是两个不同场景，这里必须先确认是否丢弃当前草稿，
   * 再关闭当前弹窗并切换到容器权限弹窗。
   */
  const handleManageContainerPermissionClick = useCallback(() => {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "You have unsaved changes. Discard them and manage container permissions instead?",
      )
    ) {
      return;
    }

    discardUserPermissionDraftAndClose(() => {
      resetDialogState();
      onClose();
      onManageContainerPermission();
    });
  }, [
    discardUserPermissionDraftAndClose,
    hasUnsavedChanges,
    onClose,
    onManageContainerPermission,
    resetDialogState,
  ]);

  /**
   * 统一提交 Item 权限变更。
   *
   * 提交顺序固定为：
   * 1. 先准备 people/groups 与 links 两边的变更集
   * 2. 若存在 links 变更，优先提交 links
   * 3. 再提交 people/groups 的 User 权限变更
   * 4. 如果 links 已成功而 people/groups 失败，保留“部分成功”的错误反馈
   */
  const handleApply = useCallback(async () => {
    let userPermissionChanges: IItemUserPermissionChangeSetFromUI | null = null;
    let itemLinkPermissionChanges: IApplyItemLinkPermissionChangesRequest | null =
      null;

    try {
      // User 权限只有在草稿真的有变化时才计算 diff，避免无意义提交。
      if (hasUnsavedUserPermissionChanges) {
        userPermissionChanges = computeItemPermissionChanges(
          userPermissionOriginalEntriesByTab,
          userPermissionDraftEntriesByTab,
        );
      }

      // links 变更集内部还会做自己的空变更判断和校验。
      itemLinkPermissionChanges = prepareItemLinkChangeSet(
        itemLinkDiff,
        hasUnsavedItemLinkPermissionChanges,
      );
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          error,
          requestFallbackMessages.preparePermissions,
        ),
      );
      setApplyFeedbackStatus("error");
      return;
    }

    const shouldApplyUserPermissionChanges =
      userPermissionChanges !== null &&
      (userPermissionChanges.create.length > 0 ||
        userPermissionChanges.update.length > 0 ||
        userPermissionChanges.remove.length > 0);
    const shouldApplyItemLinkChanges = itemLinkPermissionChanges !== null;

    if (!shouldApplyUserPermissionChanges && !shouldApplyItemLinkChanges) {
      return;
    }

    setIsApplyingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    let refreshedItemLinkEntries = null;

    if (shouldApplyItemLinkChanges && itemLinkPermissionChanges) {
      try {
        // 先提交 links，确保后续 people/groups 失败时仍能回写 links 的最新基线。
        refreshedItemLinkEntries = await applyItemLinkPreparedChanges(
          itemLinkPermissionChanges,
        );
      } catch (error: unknown) {
        setPermissionRequestErrorMessage(
          formatAppErrorMessageForUI(
            error,
            requestFallbackMessages.applyItemLinkPermissions,
          ),
        );
        setApplyFeedbackStatus("error");
        setIsApplyingPermissions(false);
        return;
      }
    }

    if (shouldApplyUserPermissionChanges && userPermissionChanges) {
      try {
        const { entriesByTab } = await applyItemUserPermissionChanges(
          driveId!,
          itemId!,
          userPermissionChanges,
        );
        // people/groups 成功后直接用服务端结果刷新本地基线与草稿。
        replaceUserPermissionEntries(entriesByTab);
      } catch (error: unknown) {
        if (refreshedItemLinkEntries) {
          // 如果 links 已成功，people/groups 再失败时仍要保住 links 的最新状态。
          reconcileAppliedItemLinkEntries(
            refreshedItemLinkEntries,
            resetItemLinkDiffState,
          );
          setPermissionRequestErrorMessage(
            `Links were saved, but people/groups changes failed: ${formatAppErrorMessageForUI(
              error,
              requestFallbackMessages.applyUserPermissions,
            )}`,
          );
        } else {
          setPermissionRequestErrorMessage(
            formatAppErrorMessageForUI(
              error,
              requestFallbackMessages.applyUserPermissions,
            ),
          );
        }

        setApplyFeedbackStatus("error");
        setIsApplyingPermissions(false);
        return;
      }
    }

    if (refreshedItemLinkEntries) {
      // 两边都成功后，再统一把 links 的最新结果回写进本地基线。
      reconcileAppliedItemLinkEntries(
        refreshedItemLinkEntries,
        resetItemLinkDiffState,
      );
    }

    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus("success");
    setIsApplyingPermissions(false);
  }, [
    applyItemLinkPreparedChanges,
    driveId,
    hasUnsavedItemLinkPermissionChanges,
    hasUnsavedUserPermissionChanges,
    itemId,
    itemLinkDiff,
    prepareItemLinkChangeSet,
    reconcileAppliedItemLinkEntries,
    replaceUserPermissionEntries,
    requestFallbackMessages,
    resetItemLinkDiffState,
    userPermissionDraftEntriesByTab,
    userPermissionOriginalEntriesByTab,
  ]);

  // ===== 渲染片段 =====

  // people/groups 的主体区域由“搜索框 + 可选说明 + 权限表格”三段组成。
  const userPermissionPanel = (
    <UserPermissionPanel
      selectedTab={selectedUserPermissionTab}
      interactionDisabled={userPermissionInteractionDisabled}
      searchInputId="item-permission-principal-input"
      query={userPermissionQuery}
      searchResults={userPermissionSearchResults}
      searchStatus={userPermissionSearchStatus}
      isDropdownOpen={isUserPermissionDropdownOpen}
      onSearchQueryChange={handleUserPermissionQueryChange}
      onSearchCandidateSelect={handleUserPermissionCandidateSelect}
      isCandidateAdded={isUserPermissionCandidateAdded}
      beforeAccessListContent={userPermissionDisclaimerContent}
      accessListProps={{
        entries: visibleUserPermissionEntries,
        isLoading: isLoadingPermissions,
        roleOptions: ITEM_PERMISSION_ROLES,
        isInteractionDisabled: userPermissionInteractionDisabled,
        inheritedTooltipText: ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT,
        onRoleChange: (entry, role) => {
          updateUserPermissionEntryRole(
            selectedUserPermissionTab,
            entry.id,
            role,
          );
        },
        onRemove: (entry) => {
          removeUserPermissionEntry(selectedUserPermissionTab, entry.id);
        },
        isRoleDisabled: (entry) => !entry.isEditable,
        isRemoveDisabled: (entry) => !entry.isRemovable,
      }}
    />
  );

  // links tab 交给独立面板渲染，当前组件只负责把状态和事件接起来。
  const itemLinkPermissionPanel = (
    <ItemLinkPermissionPanel
      entries={itemLinkEntries}
      isLoading={isLoadingItemLinkPermissions}
      interactionDisabled={isApplyingPermissions || !driveId || !itemId}
      createScope={createLinkScope}
      createType={createLinkType}
      onCreateScopeChange={setCreateLinkScope}
      onCreateTypeChange={setCreateLinkType}
      onAddLink={onAddLink}
      onDeleteLink={onDeleteLink}
      onCopyLink={onCopyLink}
      onAddRecipient={onAddRecipient}
      onRemoveRecipient={onRemoveRecipient}
    />
  );

  return (
    <PermissionDialogFrame<ItemPermissionDialogTabValue>
      open={open}
      title="Manage Item Permission"
      headerContent={
        <div className={styles.itemHeaderText}>
          <Text
            weight="semibold"
            title={itemName}
            className={styles.itemSubtitle}
          >
            {itemPermissionDialogHeaderState.truncatedItemName ??
              itemPermissionDialogHeaderState.displayedItemName}
          </Text>
          <div className={styles.itemHeaderMetaRow}>
            <Text size={200} className={styles.searchStatusText}>
              Item-level permissions are additive to container permissions.
              Click to manage
              <Link
                as="button"
                className={styles.inlineLink}
                disabled={
                  itemPermissionDialogHeaderState.isManageContainerPermissionDisabled
                }
                onClick={handleManageContainerPermissionClick}
              >
                Container Permission
              </Link>
            </Text>
          </div>
        </div>
      }
      permissionErrorMessages={permissionErrorMessages}
      selectedTab={selectedDialogTab}
      tabs={dialogTabs}
      interactionDisabled={userPermissionInteractionDisabled}
      isApplyingPermissions={isApplyingPermissions}
      applyFeedbackStatus={applyFeedbackStatus}
      isApplyDisabled={isApplyDisabled}
      isCloseDisabled={isApplyingPermissions}
      bodyContent={
        selectedDialogTab === "links"
          ? itemLinkPermissionPanel
          : userPermissionPanel
      }
      onRequestClose={handleDialogClose}
      onSelectedTabChange={(nextTab) => {
        setSelectedDialogTab(nextTab);

        // 切到 people/groups 时，同时更新 User 权限 tab 状态，供 access list 使用。
        if (nextTab === "people" || nextTab === "groups") {
          setSelectedUserPermissionTab(nextTab);
        }
      }}
      onApply={() => {
        void handleApply();
      }}
    />
  );
};
