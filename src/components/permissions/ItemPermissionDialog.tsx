import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Text } from "@fluentui/react-components";
import { AppError, formatAppErrorMessageForUI } from "../../../common/appError";
import { isSupportedItemLinkPermissionTarget } from "../../../common/itemLinkPermissionTargets";
import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemUserPermissionChangeSetFromUI,
} from "../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemUserPermissionEntry,
  ItemUserPermissionRole,
} from "./models/itemUserPermissionModels";
import type { IPermissionPrincipalCandidate } from "./models/permissionSharedModels";
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
  applyItemPermissionChanges,
  listItemPermissions,
} from "../../services/itemPermissionApi";
import { computeItemPermissionChanges } from "./services/itemUserPermissionDiff";
import {
  buildPermissionErrorMessages,
  createEmptyPermissionEntriesByTab,
  type PermissionApplyFeedbackStatus,
} from "./utils/permissionDialogSharedUtils";
import { createBaseUserPermissionEntryFromCandidate } from "./utils/userPermissionEntryUtils";

const ITEM_PERMISSION_ROLES: ItemUserPermissionRole[] = ["Reader", "Writer"];
const ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT =
  "Inherited from the parent folder";
const ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions";
const ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting";

/**
 * 把目录搜索候选项转换成一条新的 Item  User 权限草稿记录。
 *
 * 这里先复用共享的基础字段映射，再补上 Item 场景默认的 `Reader` 角色，
 * 这样 people/groups 两个 tab 新增记录时都能直接复用同一套入口。
 *
 * @param candidate 目录搜索返回的 user/group 候选项。
 * @returns 一条可直接加入草稿列表的 Item 权限记录。
 */
const createItemPermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IItemUserPermissionEntry => ({
  ...createBaseUserPermissionEntryFromCandidate(candidate),
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

  return `${itemName.slice(0, Math.max(0, maxLength - 3))}...`;
};

/**
 * Item 权限管理对话框。
 *
 * 这个组件负责把两套能力编排到同一个弹窗里：
 * - people/groups：沿用 User 权限列表和 diff 提交模型
 * - links：使用单独的加载、草稿与提交状态
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
  const styles = usePermissionsStyles();
  // people/groups  tab 始终基于同一份空结构起步，避免后续逻辑频繁判空。
  const initialEntriesByTab =
    createEmptyPermissionEntriesByTab<IItemUserPermissionEntry>();
  // 资源切换时同时驱动 User 权限和 link 权限相关 Hook 重置本地会话状态。
  const targetResetKey = `${driveId ?? "__no-drive__"}:${itemId ?? "__no-item__"}`;
  const [selectedDialogTab, setSelectedDialogTab] =
    useState<ItemPermissionDialogTabValue>("people");
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [permissionRequestErrorMessage, setPermissionRequestErrorMessage] =
    useState<string | null>(null);
  const [applyFeedbackStatus, setApplyFeedbackStatus] =
    useState<PermissionApplyFeedbackStatus>(null);
  const isSupportedLinkTarget = isSupportedItemLinkPermissionTarget({
    name: fileName ?? itemName,
    mimeType,
    isFolder: Boolean(isFolder),
  });

  // people/groups 共享这一层本地 UI 状态：tab、草稿、过滤词和 User 权限基线。
  const {
    selectedTab: selectedUserPermissionTab,
    setSelectedTab: setSelectedUserPermissionTab,
    filterByTab,
    setFilter,
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges: hasUnsavedUserPermissionChanges,
    addCandidate,
    updateEntryRole,
    removeEntry,
    discardDraftAndClose,
    replaceEntries,
    getVisibleEntries,
    isCandidateAdded,
  } = useUserPermissionDialogUIState(
    initialEntriesByTab,
    targetResetKey,
    createItemPermissionEntryFromCandidate,
  );

  // 主体搜索只服务于 people/groups，因此直接跟随 User 权限 tab 状态。
  const {
    query,
    results,
    status,
    searchError,
    isDropdownOpen,
    handleQueryChange,
    handleCandidateSelect,
  } = usePermissionPrincipalSearch({
    selectedTab: selectedUserPermissionTab,
    queryByTab: filterByTab,
    setQuery: setFilter,
    addCandidate,
    isCandidateAdded,
  });

  // links tab的请求生命周期单独管理，避免和 people/groups 的加载状态互相污染。
  const {
    originalEntries: itemLinkOriginalEntries,
    isLoadingPermissions: isLoadingLinkPermissions,
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

  // links  tab 的本地草稿、校验和面板事件也保持独立，便于单独演进。
  const {
    entries: itemLinkEntries,
    createLinkScope,
    createLinkType,
    setCreateLinkScope,
    setCreateLinkType,
    draft: itemLinkDraft,
    hasUnsavedChanges: hasUnsavedItemLinkPermissionChanges,
    hasBlockingValidationError: hasBlockingLinkValidationError,
    resetDraftState: resetItemLinkDraftState,
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

  const hasUnsavedChanges =
    hasUnsavedUserPermissionChanges || hasUnsavedItemLinkPermissionChanges;

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
  const combinedRequestErrorMessage =
    itemLinkLoadErrorMessage ?? permissionRequestErrorMessage;

  // links  tab 下不展示 people/groups 的目录搜索错误，避免顶部消息和当前面板不匹配。
  const permissionErrorMessages = useMemo(
    () =>
      buildPermissionErrorMessages(
        combinedRequestErrorMessage,
        selectedDialogTab === "links" ? null : searchError,
      ),
    [combinedRequestErrorMessage, searchError, selectedDialogTab],
  );

  useEffect(() => {
    // 当前资源不支持 link 权限时，强制把选中的弹窗 tab 切回 User 权限 tab 。
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
      replaceEntries(
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
    // 设置loading状态，清除旧错误和状态
    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    // people/groups 的 User 权限在弹窗打开时立即加载，成功后同时刷新基线和草稿。
    void listItemPermissions(driveId, itemId)
      .then(({ entriesByTab }) => {
        if (!cancelled) {
          replaceEntries(entriesByTab);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 读取失败时清空旧数据，避免用户继续看到上一个资源留下的列表。
          replaceEntries(
            createEmptyPermissionEntriesByTab<IItemUserPermissionEntry>(),
          );
          setPermissionRequestErrorMessage(
            formatAppErrorMessageForUI(
              error,
              "Unable to load current item permissions.",
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
    replaceEntries,
    resetItemLinkSectionState,
  ]);

  /**
   * 重置当前对话框会话级状态。
   *
   * 这里不会重新请求数据，只负责把当前本地 tab 、错误提示和 link 面板草稿
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
    discardDraftAndClose(() => {
      resetDialogState();
      onClose();
    });
  }, [discardDraftAndClose, onClose, resetDialogState]);

  /**
   * 跳去管理容器权限前，先处理当前弹窗里的未保存改动。
   *
   * 由于 item 权限与 container 权限是两个不同场景，这里必须先确认是否丢弃当前草稿，
   * 再关闭当前弹窗并切换到容器权限弹窗。
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
      resetDialogState();
      onClose();
      onManageContainerPermission();
    });
  };

  // access list 只渲染当前 people/groups tab 对应的那组 User 权限草稿。
  const userPermissionVisibleEntries = getVisibleEntries(
    selectedUserPermissionTab,
  );
  const totalVisibleEntriesCount =
    draftEntriesByTab.people.length + draftEntriesByTab.groups.length;
  // 当列表为空且没有请求错误时，提示“只读权限下 Graph 可能不返回 item 级权限”。
  const shouldShowEmptyVisibilityDisclaimer =
    !isLoadingPermissions &&
    !combinedRequestErrorMessage &&
    totalVisibleEntriesCount === 0;
  const truncatedItemName = itemName ? truncateItemName(itemName) : undefined;
  // people/groups 的交互禁用条件以“ User 权限请求状态”为准。
  const userPermissionInteractionDisabled =
    isLoadingPermissions || isApplyingPermissions || !driveId || !itemId;
  // Apply 按钮需要同时考虑两套面板的状态，以及 links 面板的阻塞性校验错误。
  const isApplyDisabled =
    userPermissionInteractionDisabled ||
    (selectedDialogTab === "links" && isLoadingLinkPermissions) ||
    !hasUnsavedChanges ||
    hasBlockingLinkValidationError;

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

  // people/groups 的主体区域由“搜索框 + 可选说明 + 权限表格”三段组成。
  const userPermissionPanel = (
    <UserPermissionPanel
      selectedTab={selectedUserPermissionTab}
      interactionDisabled={userPermissionInteractionDisabled}
      searchInputId="item-permission-principal-input"
      query={query}
      searchResults={results}
      searchStatus={status}
      isDropdownOpen={isDropdownOpen}
      onSearchQueryChange={handleQueryChange}
      onSearchCandidateSelect={handleCandidateSelect}
      isCandidateAdded={isCandidateAdded}
      beforeAccessListContent={beforeAccessListContent}
      accessListProps={{
        entries: userPermissionVisibleEntries,
        isLoading: isLoadingPermissions,
        roleOptions: ITEM_PERMISSION_ROLES,
        isInteractionDisabled: userPermissionInteractionDisabled,
        inheritedTooltipText: ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT,
        onRoleChange: (entry, role) => {
          updateEntryRole(selectedUserPermissionTab, entry.id, role);
        },
        onRemove: (entry) => {
          removeEntry(selectedUserPermissionTab, entry.id);
        },
        isRoleDisabled: (entry) => !entry.isEditable,
        isRemoveDisabled: (entry) => !entry.isRemovable,
      }}
    />
  );

  // links  tab 交给独立面板渲染，当前组件只负责把状态和事件接起来。
  const itemLinkPermissionPanel = (
    <ItemLinkPermissionPanel
      entries={itemLinkEntries}
      isLoading={isLoadingLinkPermissions}
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

  /**
   * 统一提交 Item 权限变更。
   *
   * 提交顺序固定为：
   * 1. 先准备 people/groups 与 links 两边的变更集
   * 2. 若存在 links 变更，优先提交 links
   * 3. 再提交 people/groups 的 User 权限变更
   * 4. 如果 links 已成功而 people/groups 失败，保留“部分成功”的错误反馈
   */
  const handleApply = async () => {
    let userPermissionChanges: IItemUserPermissionChangeSetFromUI | null = null;
    let linkPermissionChanges: IApplyItemLinkPermissionChangesRequest | null =
      null;

    try {
      //  User 权限只有在草稿真的有变化时才计算 diff，避免无意义提交。
      if (hasUnsavedUserPermissionChanges) {
        userPermissionChanges = computeItemPermissionChanges(
          originalEntriesByTab,
          draftEntriesByTab,
        );
      }

      // links 变更集内部还会做自己的空变更判断和校验。
      linkPermissionChanges = prepareItemLinkChangeSet(
        itemLinkDraft,
        hasUnsavedItemLinkPermissionChanges,
      );
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          error,
          "Unable to prepare item permission changes.",
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
    const shouldApplyLinkChanges = linkPermissionChanges !== null;

    if (!shouldApplyUserPermissionChanges && !shouldApplyLinkChanges) {
      return;
    }

    setIsApplyingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    let refreshedLinkEntries = null;

    if (shouldApplyLinkChanges && linkPermissionChanges) {
      try {
        // 先提交 links，确保后续 people/groups 失败时仍能回写 links 的最新基线。
        refreshedLinkEntries = await applyItemLinkPreparedChanges(
          linkPermissionChanges,
        );
      } catch (error: unknown) {
        setPermissionRequestErrorMessage(
          formatAppErrorMessageForUI(
            error,
            "Unable to apply item link permission changes.",
          ),
        );
        setApplyFeedbackStatus("error");
        setIsApplyingPermissions(false);
        return;
      }
    }

    if (shouldApplyUserPermissionChanges && userPermissionChanges) {
      try {
        const { entriesByTab } = await applyItemPermissionChanges(
          driveId!,
          itemId!,
          userPermissionChanges,
        );
        // people/groups 成功后直接用服务端结果刷新本地基线与草稿。
        replaceEntries(entriesByTab);
      } catch (error: unknown) {
        if (refreshedLinkEntries) {
          // 如果 links 已成功，people/groups 再失败时仍要保住 links 的最新状态。
          reconcileAppliedItemLinkEntries(
            refreshedLinkEntries,
            resetItemLinkDraftState,
          );
          setPermissionRequestErrorMessage(
            `Links were saved, but people/groups changes failed: ${formatAppErrorMessageForUI(
              error,
              "Unable to apply item permission changes.",
            )}`,
          );
        } else {
          setPermissionRequestErrorMessage(
            formatAppErrorMessageForUI(
              error,
              "Unable to apply item permission changes.",
            ),
          );
        }

        setApplyFeedbackStatus("error");
        setIsApplyingPermissions(false);
        return;
      }
    }

    if (refreshedLinkEntries) {
      // 两边都成功后，再统一把 links 的最新结果回写进本地基线。
      reconcileAppliedItemLinkEntries(
        refreshedLinkEntries,
        resetItemLinkDraftState,
      );
    }

    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus("success");
    setIsApplyingPermissions(false);
  };

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
      selectedTab={selectedDialogTab}
      tabs={[
        { value: "people", label: "People" },
        { value: "groups", label: "Groups" },
        // 只有当前资源支持 link 权限时，才暴露 links  tab 。
        ...(isSupportedLinkTarget
          ? ([{ value: "links", label: "Links" }] as const)
          : []),
      ]}
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

        // links 以外的 tab 需要同步回 people/groups 自己的选中状态。
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
