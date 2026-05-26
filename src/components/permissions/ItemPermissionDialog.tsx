import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Button,
  Link,
  Select,
  Spinner,
  TableCell,
  TableCellLayout,
  TableRow,
  Text,
  Tooltip,
} from "@fluentui/react-components";
import { ConvertRangeRegular, DeleteRegular } from "@fluentui/react-icons";
import { readErrorMessage } from "../../common/errors.ts";
import type {
  IItemPermissionEntriesByTab,
  ItemPermissionRole,
} from "./models/itemPermissionModels";
import { useItemPermissionDialogState } from "./hooks/useItemPermissionDialogState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import type { PermissionTabValue } from "./models/permissionSharedModels";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import { usePermissionsStyles } from "./components/permissionsStyles";
import type { IItemPermissionDialogProps } from "./components/permissionsTypes";
import {
  applyItemPermissionChanges,
  ItemPermissionApiError,
  listItemPermissions,
} from "../../services/itemPermissionApi";
import { computeItemPermissionChanges } from "./services/itemPermissionDiff";

const ITEM_PERMISSION_ROLES: ItemPermissionRole[] = ["Reader", "Writer"];
const ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT =
  "Inherited from the parent folder";

type ApplyFeedbackStatus = "success" | "error" | null;

const ITEM_PERMISSION_READ_VISIBILITY_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions";
const ITEM_PERMISSION_ROLE_BASED_SHARING_LEARN_MORE_URL =
  "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting";

/**
 * 根据页签值返回当前界面要显示的标题文案。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 统一生成 item 权限对话框的空列表基线。
 */
const createEmptyPermissionEntries = (): IItemPermissionEntriesByTab => ({
  people: [],
  groups: [],
});

/**
 * 把权限请求错误转换成适合 UI 展示的文案。
 */
const getPermissionRequestErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof ItemPermissionApiError) {
    if (error.code === "throttled" && error.retryAfterSeconds) {
      return `${error.message} Retry after ${error.retryAfterSeconds} seconds.`;
    }

    if (error.requestId) {
      return `${error.message} Request ID: ${error.requestId}.`;
    }

    return error.message;
  }

  return readErrorMessage(error, fallbackMessage);
};

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
 * 返回 inherited 图标对应的 Tooltip 文案。
 */

/**
 * item 权限管理对话框。
 *
 * 该组件严格沿用现有 container dialog 的交互骨架：
 * - 继续使用 People / Groups tabs
 * - 继续使用 Combobox 搜索与本地草稿列表
 * - 继续通过现有 `itemPermissionApi` 和 `itemPermissionDiff` 读写
 * - 继续复用统一的加载、错误和 Apply 状态区
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
  const initialEntriesByTab = createEmptyPermissionEntries();
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [permissionRequestErrorMessage, setPermissionRequestErrorMessage] =
    useState<string | null>(null);
  const [applyFeedbackStatus, setApplyFeedbackStatus] =
    useState<ApplyFeedbackStatus>(null);

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

  const permissionStatusMessages = [
    permissionRequestErrorMessage
      ? `Api Error: ${permissionRequestErrorMessage}`
      : null,
    searchError
      ? `Search Error: ${readErrorMessage(
          searchError,
          "Directory search failed. Please try again later.",
        )}`
      : null,
  ].filter((message): message is string => Boolean(message));

  const emptyStateText = useMemo(() => {
    if (shouldShowEmptyVisibilityDisclaimer) {
      return "No permissions are currently visible in this dialog.";
    }

    return `No ${getTabTitle(selectedTab).toLowerCase()} permissions added yet.`;
  }, [selectedTab, shouldShowEmptyVisibilityDisclaimer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!driveId || !itemId) {
      replaceEntries(createEmptyPermissionEntries());
      setPermissionRequestErrorMessage("No item selected.");
      setApplyFeedbackStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    void listItemPermissions(driveId, itemId)
      .then(({ entriesByTab }) => {
        if (cancelled) {
          return;
        }

        replaceEntries(entriesByTab);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        replaceEntries(createEmptyPermissionEntries());
        setPermissionRequestErrorMessage(
          getPermissionRequestErrorMessage(
            error,
            "Unable to load current item permissions.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, driveId, itemId, replaceEntries]);

  /**
   * 提交当前 item 权限草稿差异，并用后端返回结果刷新本地基线。
   */
  const handleApply = async () => {
    if (!driveId || !itemId) {
      return;
    }

    let changes;

    try {
      changes = computeItemPermissionChanges(
        originalEntriesByTab,
        draftEntriesByTab,
      );
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        getPermissionRequestErrorMessage(
          error,
          "Unable to prepare item permission changes.",
        ),
      );
      setApplyFeedbackStatus("error");
      return;
    }

    if (
      changes.create.length === 0 &&
      changes.update.length === 0 &&
      changes.remove.length === 0
    ) {
      return;
    }

    setIsApplyingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    try {
      const { entriesByTab } = await applyItemPermissionChanges(
        driveId,
        itemId,
        changes,
      );

      replaceEntries(entriesByTab);
      setApplyFeedbackStatus("success");
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        getPermissionRequestErrorMessage(
          error,
          "Unable to apply item permission changes.",
        ),
      );
      setApplyFeedbackStatus("error");
    } finally {
      setIsApplyingPermissions(false);
    }
  };

  /**
   * 从 item 权限跳转到容器权限。
   *
   * 如果当前存在未保存改动，先弹出放弃确认，再执行切换。
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

  const beforeTableContent = shouldShowEmptyVisibilityDisclaimer ? (
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

  const tableBodyContent = isLoadingPermissions ? (
    <TableRow>
      <TableCell colSpan={3}>
        <TableCellLayout>
          <Spinner size="small" label="Loading..." />
        </TableCellLayout>
      </TableCell>
    </TableRow>
  ) : visibleEntries.length > 0 ? (
    visibleEntries.map((entry) => {
      return (
        <TableRow key={entry.id} data-testid={`permission-row-${entry.id}`}>
          <TableCell className={styles.principalColumn}>
            <div>
              <div className={styles.principalCellContent}>
                <div className={styles.principalCellText}>
                  <Text weight="semibold">{entry.principalName}</Text>
                  <Text size={200} className={styles.principalSecondaryText}>
                    {entry.description}
                  </Text>
                </div>
                {entry.isInherited ? (
                  <Tooltip
                    relationship="label"
                    positioning="above"
                    withArrow
                    content={{
                      className: styles.tooltipContent,
                      children: (
                        <Text size={100}>
                          {ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT}
                        </Text>
                      ),
                    }}
                  >
                    <span
                      className={styles.inheritedIconWrapper}
                      data-testid={`permission-inherited-icon-${entry.id}`}
                      tabIndex={0}
                    >
                      <ConvertRangeRegular
                        aria-label="Inherited permission"
                        className={styles.inheritedIcon}
                      />
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          </TableCell>
          <TableCell className={styles.roleColumn}>
            <Select
              className={styles.roleSelect}
              aria-label={`${entry.principalName} role`}
              disabled={interactionDisabled || !entry.isEditable}
              value={entry.role}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                updateEntryRole(
                  selectedTab,
                  entry.id,
                  event.target.value as ItemPermissionRole,
                )
              }
            >
              {ITEM_PERMISSION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </TableCell>
          <TableCell className={styles.actionColumn}>
            <Button
              aria-label={`Remove ${entry.principalName}`}
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={interactionDisabled || !entry.isRemovable}
              onClick={() => removeEntry(selectedTab, entry.id)}
            />
          </TableCell>
        </TableRow>
      );
    })
  ) : (
    <TableRow>
      <TableCell colSpan={3}>
        <TableCellLayout>
          <Text size={200}>{emptyStateText}</Text>
        </TableCellLayout>
      </TableCell>
    </TableRow>
  );

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
      beforeTableContent={beforeTableContent}
      tableBodyContent={tableBodyContent}
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
