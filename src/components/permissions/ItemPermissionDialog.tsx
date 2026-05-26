import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Avatar,
  Button,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  Option,
  Select,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableRow,
  Text,
  Tooltip,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  ConvertRangeRegular,
  DeleteRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { readErrorMessage } from "../../common/errors.ts";
import type {
  IItemPermissionEntriesByTab,
  ItemPermissionRole,
} from "./models/itemPermissionModels";
import { useItemPermissionDialogState } from "./hooks/useItemPermissionDialogState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import type { PermissionTabValue } from "./models/permissionModels";
import { usePermissionsStyles } from "./permissionsStyles";
import type { IItemPermissionDialogProps } from "./permissionsTypes";
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
   * 处理 Combobox 输入变化。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    handleQueryChange(event.target.value);
  };

  /**
   * 处理从目录搜索结果中选择候选对象。
   */
  const handleOptionSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    handleCandidateSelect(data.optionValue);
  };

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

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        if (!data.open) {
          discardDraftAndClose(onClose);
        }
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <DialogTitle>Manage Item Permission</DialogTitle>

          <DialogContent className={styles.content}>
            <div className={styles.section}>
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
                    Item-level permissions are additive to container
                    permissions. Click to manage
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

              {permissionStatusMessages.length > 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={styles.errorStatusText}
                >
                  {permissionStatusMessages.map((message) => (
                    <Text key={message} size={200}>
                      {message}
                    </Text>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.section}>
              <TabList
                selectedValue={selectedTab}
                onTabSelect={(_event, data) =>
                  setSelectedTab(data.value as PermissionTabValue)
                }
              >
                <Tab disabled={interactionDisabled} value="people">
                  People
                </Tab>
                <Tab disabled={interactionDisabled} value="groups">
                  Groups
                </Tab>
              </TabList>
            </div>

            <div className={styles.section}>
              <div className={styles.principalInputWrapper}>
                <Combobox
                  id="item-permission-principal-input"
                  aria-label={`Add ${getTabTitle(selectedTab)}`}
                  className={styles.principalCombobox}
                  expandIcon={null}
                  placeholder={`Search for ${getTabTitle(selectedTab)} (type at least 3 characters)`}
                  freeform
                  disabled={interactionDisabled}
                  selectedOptions={[]}
                  value={query}
                  open={isDropdownOpen && !interactionDisabled}
                  onChange={handleComboboxChange}
                  onOptionSelect={handleOptionSelect}
                >
                  {status === "waitingForMoreInput" ? (
                    <Option disabled text="Need more input">
                      <Text size={200}>
                        Keep typing at least 3 characters to search.
                      </Text>
                    </Option>
                  ) : null}

                  {status === "debouncing" ? (
                    <Option disabled text="Debouncing">
                      <Text size={200}>Getting ready to search...</Text>
                    </Option>
                  ) : null}

                  {status === "loading" ? (
                    <Option disabled text="Searching">
                      <div
                        className={styles.loadingOption}
                        data-testid="directory-search-loading"
                      >
                        <Spinner size="tiny" />
                        <Text>Searching...</Text>
                      </div>
                    </Option>
                  ) : null}

                  {status === "success"
                    ? results.map((candidate) => {
                        const alreadyAdded = isCandidateAdded(
                          selectedTab,
                          candidate,
                        );

                        return (
                          <Option
                            key={candidate.id}
                            value={candidate.id}
                            text={candidate.name}
                          >
                            <div
                              className={styles.dropdownOption}
                              data-testid={`candidate-option-${candidate.id}`}
                            >
                              <Avatar
                                name={candidate.name}
                                initials={candidate.initials}
                                size={32}
                              />
                              <div className={styles.dropdownOptionText}>
                                <Text weight="semibold">{candidate.name}</Text>
                                <Text
                                  size={200}
                                  className={styles.dropdownOptionSecondary}
                                >
                                  {candidate.secondaryText}
                                </Text>
                              </div>
                              {alreadyAdded ? (
                                <Text
                                  size={200}
                                  className={styles.dropdownOptionMeta}
                                >
                                  Already added
                                </Text>
                              ) : null}
                            </div>
                          </Option>
                        );
                      })
                    : null}

                  {status === "empty" ? (
                    <Option disabled text="No results">
                      <Text
                        size={200}
                        data-testid="directory-search-empty-state"
                      >
                        No results found. Try a more complete name, email, or
                        group name.
                      </Text>
                    </Option>
                  ) : null}

                  {status === "error" ? (
                    <Option disabled text="Search failed">
                      <Text size={200}>
                        Please check the error message above.
                      </Text>
                    </Option>
                  ) : null}
                </Combobox>
              </div>

              <Text size={200} className={styles.searchStatusText}>
                Select someone from the results to add them. Duplicates
                won&apos;t be added twice.
              </Text>
            </div>

            {shouldShowEmptyVisibilityDisclaimer ? (
              <div
                className={styles.disclaimerBox}
                data-testid="item-permission-visibility-disclaimer"
              >
                <Text size={200}>
                  This list may be empty even when item-level permissions exist.
                  With only <strong>read access</strong> to this file, Microsoft
                  Graph may not return them. Learn more at{" "}
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
            ) : null}

            <div className={styles.accessListSection}>
              <div className={styles.tableWrapper}>
                <Table
                  aria-label={`${getTabTitle(selectedTab)} access list`}
                  className={styles.accessTable}
                >
                  <TableBody>
                    {isLoadingPermissions ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <TableCellLayout>
                            <Spinner size="small" label="Loading..." />
                          </TableCellLayout>
                        </TableCell>
                      </TableRow>
                    ) : null}

                    {!isLoadingPermissions && visibleEntries.length > 0
                      ? visibleEntries.map((entry) => {
                          return (
                            <TableRow
                              key={entry.id}
                              data-testid={`permission-row-${entry.id}`}
                            >
                              <TableCell className={styles.principalColumn}>
                                <div>
                                  <div className={styles.principalCellContent}>
                                    <div className={styles.principalCellText}>
                                      <Text weight="semibold">
                                        {entry.principalName}
                                      </Text>
                                      <Text
                                        size={200}
                                        className={
                                          styles.principalSecondaryText
                                        }
                                      >
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
                                              {
                                                ITEM_PERMISSION_INHERITED_TOOLTIP_TEXT
                                              }
                                            </Text>
                                          ),
                                        }}
                                      >
                                        <span
                                          className={
                                            styles.inheritedIconWrapper
                                          }
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
                                  disabled={
                                    interactionDisabled || !entry.isEditable
                                  }
                                  value={entry.role}
                                  onChange={(
                                    event: ChangeEvent<HTMLSelectElement>,
                                  ) =>
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
                                  disabled={
                                    interactionDisabled || !entry.isRemovable
                                  }
                                  onClick={() =>
                                    removeEntry(selectedTab, entry.id)
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : null}

                    {!isLoadingPermissions && visibleEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <TableCellLayout>
                            <Text size={200}>{emptyStateText}</Text>
                          </TableCellLayout>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>

          <DialogActions className={styles.footerActions}>
            <div className={styles.applyFeedbackWrapper}>
              {isApplyingPermissions ? (
                <div
                  className={styles.applySavingFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="tiny" />
                  <Text>Saving...</Text>
                </div>
              ) : null}

              {!isApplyingPermissions && applyFeedbackStatus === "success" ? (
                <div
                  className={styles.applySuccessFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <CheckmarkCircleRegular />
                  <Text>Successful!</Text>
                </div>
              ) : null}

              {!isApplyingPermissions && applyFeedbackStatus === "error" ? (
                <div
                  className={styles.applyErrorFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <DismissCircleRegular />
                  <Text>Failed</Text>
                </div>
              ) : null}
            </div>

            <div className={styles.footerButtons}>
              <Button
                appearance="secondary"
                disabled={isApplyingPermissions}
                onClick={() => discardDraftAndClose(onClose)}
              >
                Close
              </Button>
              <Button
                appearance="primary"
                disabled={interactionDisabled || !hasUnsavedChanges}
                onClick={() => {
                  void handleApply();
                }}
              >
                Apply
              </Button>
            </div>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
