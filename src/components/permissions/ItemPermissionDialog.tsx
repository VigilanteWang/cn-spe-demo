import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Text } from "@fluentui/react-components";
import { AppError, formatAppErrorMessageForUI } from "../../../common/appError";
import { isSupportedItemLinkPermissionTarget } from "../../../common/itemLinkPermissionTargets";
import type {
  IItemLinkPermissionEntryForUI,
  IItemPermissionChangeSetFromUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemPermissionEntry,
  ItemPermissionRole,
} from "./models/itemPermissionModels";
import type { IPermissionPrincipalCandidate } from "./models/permissionSharedModels";
import type { ItemPermissionDialogTabValue } from "./models/itemLinkPermissionModels";
import { usePermissionDialogUIState } from "./hooks/usePermissionDialogUIState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { useItemLinkPermissionDraft } from "./hooks/useItemLinkPermissionDraft";
import { useItemLinkPermissionLoadState } from "./hooks/useItemLinkPermissionLoadState";
import { useItemLinkPermissionDerivedEntries } from "./hooks/useItemLinkPermissionDerivedEntries";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import { PermissionAccessListTable } from "./components/PermissionAccessListTable";
import { PrincipalSearchComboBox } from "./components/PrincipalSearchComboBox";
import { ItemLinkPermissionsPanel } from "./components/ItemLinkPermissionsPanel";
import { usePermissionsStyles } from "./components/permissionsStyles";
import type { IItemPermissionDialogProps } from "./components/permissionsTypes";
import {
  applyItemLinkPermissionChanges,
  applyItemPermissionChanges,
  listItemLinkPermissions,
  listItemPermissions,
} from "../../services/itemPermissionApi";
import { computeItemPermissionChanges } from "./services/itemPermissionDiff";
import { createItemLinkPermissionChangeSet } from "./services/itemLinkPermissionUiUtils";
import {
  buildPermissionErrorMessages,
  createBasePermissionEntryFromCandidate,
  createEmptyPermissionEntriesByTab,
  type PermissionApplyFeedbackStatus,
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
 * 当前版本在原有 people/groups 权限基础上，新增了一个独立的 `Links` 页签：
 * - people/groups 继续沿用旧的 access list 与 diff 模型
 * - links 改成独立的读取、草稿与 apply 编排
 * - 底部 `Apply` 统一提交两边的未保存变更
 *
 * @returns 渲染后的 Item 权限管理对话框。
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
  const initialEntriesByTab =
    createEmptyPermissionEntriesByTab<IItemPermissionEntry>();
  const targetResetKey = `${driveId ?? "__no-drive__"}:${itemId ?? "__no-item__"}`;
  const [selectedDialogTab, setSelectedDialogTab] =
    useState<ItemPermissionDialogTabValue>("people");
  const [createLinkScope, setCreateLinkScope] =
    useState<ItemLinkPermissionScope>("anonymous");
  const [createLinkType, setCreateLinkType] =
    useState<ItemLinkPermissionType>("view");
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isLoadingLinkPermissions, setIsLoadingLinkPermissions] =
    useState(false);
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

  const {
    selectedTab: selectedExplicitTab,
    setSelectedTab: setSelectedExplicitTab,
    filterByTab,
    setFilter,
    originalEntriesByTab,
    draftEntriesByTab,
    hasUnsavedChanges: hasUnsavedExplicitPermissionChanges,
    addCandidate,
    updateEntryRole,
    removeEntry,
    discardDraftAndClose,
    replaceEntries,
    getVisibleEntries,
    isCandidateAdded,
  } = usePermissionDialogUIState(
    initialEntriesByTab,
    targetResetKey,
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
    selectedTab: selectedExplicitTab,
    queryByTab: filterByTab,
    setQuery: setFilter,
    addCandidate,
    isCandidateAdded,
  });

  const {
    originalEntries: originalItemLinkPermissionEntries,
    hasLoadedOnce: hasLoadedItemLinkPermissionsOnce,
    replaceEntries: replaceItemLinkPermissionEntries,
    reset: resetItemLinkPermissionLoadState,
  } = useItemLinkPermissionLoadState(targetResetKey);
  const {
    draft: itemLinkPermissionDraftState,
    hasUnsavedChanges: hasUnsavedItemLinkPermissionChanges,
    addCreatedLink,
    removeCreatedLink,
    deletePersistedLink,
    addRecipientToCreatedLink,
    removeRecipientFromCreatedLink,
    addGrantRecipient,
    addRevokeRecipient,
    resetDraft: resetItemLinkPermissionDraft,
  } = useItemLinkPermissionDraft(targetResetKey);
  const derivedItemLinkPermissions = useItemLinkPermissionDerivedEntries(
    originalItemLinkPermissionEntries,
    itemLinkPermissionDraftState,
  );
  const hasUnsavedChanges =
    hasUnsavedExplicitPermissionChanges || hasUnsavedItemLinkPermissionChanges;
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
  const permissionErrorMessages = useMemo(
    () =>
      buildPermissionErrorMessages(
        permissionRequestErrorMessage,
        selectedDialogTab === "links" ? null : searchError,
      ),
    [permissionRequestErrorMessage, searchError, selectedDialogTab],
  );

  useEffect(() => {
    if (selectedDialogTab === "links" && !isSupportedLinkTarget) {
      setSelectedDialogTab(selectedExplicitTab);
    }
  }, [isSupportedLinkTarget, selectedDialogTab, selectedExplicitTab]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!driveId || !itemId) {
      setIsLoadingPermissions(false);
      replaceEntries(createEmptyPermissionEntriesByTab<IItemPermissionEntry>());
      resetItemLinkPermissionLoadState();
      resetItemLinkPermissionDraft();
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          missingTargetError,
          missingTargetError.message,
        ),
      );
      setApplyFeedbackStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    void listItemPermissions(driveId, itemId)
      .then(({ entriesByTab }) => {
        if (!cancelled) {
          replaceEntries(entriesByTab);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          replaceEntries(
            createEmptyPermissionEntriesByTab<IItemPermissionEntry>(),
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
      cancelled = true;
    };
  }, [
    driveId,
    itemId,
    missingTargetError,
    open,
    replaceEntries,
    resetItemLinkPermissionDraft,
    resetItemLinkPermissionLoadState,
  ]);

  useEffect(() => {
    if (
      !open ||
      !driveId ||
      !itemId ||
      !isSupportedLinkTarget ||
      selectedDialogTab !== "links" ||
      hasLoadedItemLinkPermissionsOnce
    ) {
      return;
    }

    let cancelled = false;
    setIsLoadingLinkPermissions(true);

    void listItemLinkPermissions(driveId, itemId)
      .then((entries) => {
        if (!cancelled) {
          replaceItemLinkPermissionEntries(entries);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPermissionRequestErrorMessage(
            formatAppErrorMessageForUI(
              error,
              "Unable to load current item link permissions.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingLinkPermissions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    driveId,
    hasLoadedItemLinkPermissionsOnce,
    isSupportedLinkTarget,
    itemId,
    open,
    replaceItemLinkPermissionEntries,
    selectedDialogTab,
  ]);

  const resetLinkPanelState = useCallback(() => {
    resetItemLinkPermissionDraft();
    resetItemLinkPermissionLoadState();
    setCreateLinkScope("anonymous");
    setCreateLinkType("view");
  }, [resetItemLinkPermissionDraft, resetItemLinkPermissionLoadState]);

  const handleDialogClose = useCallback(() => {
    discardDraftAndClose(() => {
      resetLinkPanelState();
      setSelectedDialogTab("people");
      setPermissionRequestErrorMessage(null);
      setApplyFeedbackStatus(null);
      onClose();
    });
  }, [discardDraftAndClose, onClose, resetLinkPanelState]);

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
      resetLinkPanelState();
      setSelectedDialogTab("people");
      setPermissionRequestErrorMessage(null);
      setApplyFeedbackStatus(null);
      onClose();
      onManageContainerPermission();
    });
  };

  const explicitVisibleEntries = getVisibleEntries(selectedExplicitTab);
  const totalVisibleEntriesCount =
    draftEntriesByTab.people.length + draftEntriesByTab.groups.length;
  const shouldShowEmptyVisibilityDisclaimer =
    !isLoadingPermissions &&
    !permissionRequestErrorMessage &&
    totalVisibleEntriesCount === 0;
  const truncatedItemName = itemName ? truncateItemName(itemName) : undefined;
  const interactionDisabled =
    isLoadingPermissions || isApplyingPermissions || !driveId || !itemId;
  const isApplyDisabled =
    interactionDisabled ||
    (selectedDialogTab === "links" && isLoadingLinkPermissions) ||
    !hasUnsavedChanges ||
    derivedItemLinkPermissions.hasBlockingValidationError;

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

  const explicitPermissionsBody = (
    <>
      <PrincipalSearchComboBox
        selectedTab={selectedExplicitTab}
        interactionDisabled={interactionDisabled}
        searchInputId="item-permission-principal-input"
        query={query}
        searchResults={results}
        searchStatus={status}
        isDropdownOpen={isDropdownOpen}
        onSearchQueryChange={handleQueryChange}
        onSearchCandidateSelect={handleCandidateSelect}
        isCandidateAdded={isCandidateAdded}
      />

      {beforeAccessListContent}

      <PermissionAccessListTable
        selectedTab={selectedExplicitTab}
        entries={explicitVisibleEntries}
        isLoading={isLoadingPermissions}
        roleOptions={ITEM_PERMISSION_ROLES}
        isInteractionDisabled={interactionDisabled}
        inheritedTooltipText={ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT}
        onRoleChange={(entry, role) => {
          updateEntryRole(selectedExplicitTab, entry.id, role);
        }}
        onRemove={(entry) => {
          removeEntry(selectedExplicitTab, entry.id);
        }}
        isRoleDisabled={(entry) => !entry.isEditable}
        isRemoveDisabled={(entry) => !entry.isRemovable}
      />
    </>
  );

  const linksPermissionsBody = (
    <ItemLinkPermissionsPanel
      entries={derivedItemLinkPermissions.entries}
      isLoading={isLoadingLinkPermissions}
      interactionDisabled={isApplyingPermissions || !driveId || !itemId}
      createScope={createLinkScope}
      createType={createLinkType}
      onCreateScopeChange={setCreateLinkScope}
      onCreateTypeChange={setCreateLinkType}
      onAddLink={() => addCreatedLink(createLinkScope, createLinkType)}
      onDeleteLink={(entry) => {
        if (entry.source === "draft") {
          removeCreatedLink(entry.id);
          return;
        }

        if (entry.permissionId) {
          deletePersistedLink(entry.permissionId);
        }
      }}
      onCopyLink={(webUrl) => {
        void navigator.clipboard?.writeText(webUrl);
      }}
      onAddRecipient={(entry, candidate) => {
        if (entry.source === "draft") {
          addRecipientToCreatedLink(entry.id, candidate);
          return;
        }

        if (entry.permissionId) {
          addGrantRecipient(entry.permissionId, candidate);
        }
      }}
      onRemoveRecipient={(entry, recipientKey) => {
        if (entry.source === "draft") {
          removeRecipientFromCreatedLink(entry.id, recipientKey);
          return;
        }

        if (!entry.permissionId) {
          return;
        }

        const recipient = entry.recipients.find(
          (currentRecipient) => currentRecipient.key === recipientKey,
        );

        if (!recipient) {
          return;
        }

        addRevokeRecipient(entry.permissionId, recipient.candidate);
      }}
    />
  );

  const handleApply = async () => {
    let explicitChanges: IItemPermissionChangeSetFromUI | null = null;
    let linkChanges: ReturnType<
      typeof createItemLinkPermissionChangeSet
    > | null = null;

    try {
      if (hasUnsavedExplicitPermissionChanges) {
        explicitChanges = computeItemPermissionChanges(
          originalEntriesByTab,
          draftEntriesByTab,
        );
      }

      if (hasUnsavedItemLinkPermissionChanges) {
        linkChanges = createItemLinkPermissionChangeSet(
          originalItemLinkPermissionEntries,
          itemLinkPermissionDraftState,
        );
      }
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

    const shouldApplyExplicitChanges =
      explicitChanges !== null &&
      (explicitChanges.create.length > 0 ||
        explicitChanges.update.length > 0 ||
        explicitChanges.remove.length > 0);
    const shouldApplyLinkChanges = linkChanges !== null;

    if (!shouldApplyExplicitChanges && !shouldApplyLinkChanges) {
      return;
    }

    setIsApplyingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    let refreshedLinkEntries: IItemLinkPermissionEntryForUI[] | null = null;

    if (shouldApplyLinkChanges && linkChanges) {
      try {
        refreshedLinkEntries = await applyItemLinkPermissionChanges(
          driveId!,
          itemId!,
          linkChanges,
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

    if (shouldApplyExplicitChanges && explicitChanges) {
      try {
        const { entriesByTab } = await applyItemPermissionChanges(
          driveId!,
          itemId!,
          explicitChanges,
        );
        replaceEntries(entriesByTab);
      } catch (error: unknown) {
        if (refreshedLinkEntries) {
          replaceItemLinkPermissionEntries(refreshedLinkEntries);
          resetItemLinkPermissionDraft();
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
      replaceItemLinkPermissionEntries(refreshedLinkEntries);
      resetItemLinkPermissionDraft();
    }

    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus("success");
    setIsApplyingPermissions(false);
  };

  return (
    <PermissionDialogFrame<IItemPermissionEntry, ItemPermissionDialogTabValue>
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
        ...(isSupportedLinkTarget
          ? ([{ value: "links", label: "Links" }] as const)
          : []),
      ]}
      interactionDisabled={interactionDisabled}
      isApplyingPermissions={isApplyingPermissions}
      applyFeedbackStatus={applyFeedbackStatus}
      isApplyDisabled={isApplyDisabled}
      isCloseDisabled={isApplyingPermissions}
      bodyContent={
        selectedDialogTab === "links"
          ? linksPermissionsBody
          : explicitPermissionsBody
      }
      onRequestClose={handleDialogClose}
      onSelectedTabChange={(nextTab) => {
        setSelectedDialogTab(nextTab);

        if (nextTab === "people" || nextTab === "groups") {
          setSelectedExplicitTab(nextTab);
        }
      }}
      onApply={() => {
        void handleApply();
      }}
    />
  );
};
