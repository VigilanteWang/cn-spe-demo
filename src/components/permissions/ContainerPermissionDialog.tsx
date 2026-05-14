/**
 * 容器权限管理对话框模块。
 *
 * 本模块负责：
 * 1. 提供“容器级权限管理”弹窗外壳
 * 2. 展示当前容器名称
 * 3. 展示权限页签、搜索输入区和 access list
 * 4. 接入真实容器权限加载、差异计算与 Apply 写回
 *
 * 说明：
 * - 现有 `Combobox` 搜索交互、debounce、loading 和结果直加 access list 的行为保持不变
 * - 搜索 Hook 仍然只负责目录查找；真实权限加载/写回单独接入，避免把两条链路重新耦合
 * - Close 继续放弃未提交草稿；Apply 则提交差异并用服务端最新结果刷新本地基线
 */

import { useEffect, useState } from "react";
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
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  DeleteRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import { readErrorMessage } from "../../common/errors.ts";
import {
  ContainerPermissionRole,
  PermissionTabValue,
} from "./models/permissionModels";
import { useContainerPermissionDialogState } from "./hooks/useContainerPermissionDialogState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { IContainerPermissionDialogProps } from "./permissionsTypes";
import { usePermissionsStyles } from "./permissionsStyles";
import {
  ContainerPermissionApiError,
  applyContainerPermissionChanges,
  listContainerPermissions,
} from "../../services/containerPermissionApi";
import { computeContainerPermissionChanges } from "./services/containerPermissionDiff";
import { PermissionEntriesByTab } from "./models/permissionModels";

const CONTAINER_PERMISSION_ROLES: ContainerPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

type ApplyFeedbackStatus = "success" | "error" | null;

/**
 * 根据页签值返回当前界面要显示的标题文案。
 *
 * 这里集中维护 people / groups 的显示映射，
 * 避免组件内部重复散落条件判断。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 把权限请求错误转成适合 UI 直接展示的文案。
 */
const getPermissionRequestErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof ContainerPermissionApiError) {
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
 * 创建一份空的权限分组结果。
 *
 * Dialog 打开前先以空列表初始化本地草稿，
 * 等后端返回真实容器权限后再整体替换进去。
 */
const createEmptyPermissionEntries = (): PermissionEntriesByTab => ({
  people: [],
  groups: [],
});
/**
 * 容器权限管理弹窗。
 *
 * 当前步骤实现：
 * - 打开弹窗时读取真实容器权限
 * - 保持现有目录搜索 + 本地草稿交互
 * - Apply 时计算新增/更新/删除差异并写回后端
 * - 成功后用服务端最新权限刷新列表并清空脏状态
 */
export const ContainerPermissionDialog = ({
  open,
  containerId,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  const styles = usePermissionsStyles();
  const initialEntriesByTab = createEmptyPermissionEntries();
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [permissionRequestErrorMessage, setPermissionRequestErrorMessage] =
    useState<string | null>(null);
  const [applyFeedbackStatus, setApplyFeedbackStatus] =
    useState<ApplyFeedbackStatus>(null);

  // 这里统一拿到弹窗所需的页签、草稿列表和关闭动作，
  // 让组件层主要负责渲染、真实加载和真实写回。
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

  // 搜索相关状态单独交给独立 Hook：
  // - 继续保留最小输入长度、debounce、loading 和结果直接加入列表的行为
  // - 不把真实权限加载/写回重新耦合进搜索链路
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

  // 当前页签下真正要显示在 access list 表格里的权限项。
  const visibleEntries = getVisibleEntries(selectedTab);
  const interactionDisabled =
    isLoadingPermissions || isApplyingPermissions || !containerId;

  // 统一把权限读写错误和搜索错误合并到同一错误区，避免在多个位置重复展示。
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

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!containerId) {
      replaceEntries(createEmptyPermissionEntries());
      setPermissionRequestErrorMessage("No container selected.");
      setApplyFeedbackStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    void listContainerPermissions(containerId)
      .then((entriesByTab) => {
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
            "Unable to load current container permissions.",
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
  }, [open, containerId]);

  /**
   * 处理 Combobox 输入变化。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event,
  ) => {
    handleQueryChange(event.target.value);
  };

  /**
   * 处理用户从下拉结果里选中某个候选对象。
   *
   * 选中后会直接尝试加入 access list。
   */
  const handleOptionSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    handleCandidateSelect(data.optionValue);
  };

  /**
   * 把当前草稿差异提交到后端，并用服务端最新权限刷新本地基线。
   */
  const handleApply = async () => {
    if (!containerId) {
      return;
    }

    let changes;

    try {
      changes = computeContainerPermissionChanges(
        originalEntriesByTab,
        draftEntriesByTab,
      );
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        getPermissionRequestErrorMessage(
          error,
          "Unable to prepare container permission changes.",
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
      const refreshedEntries = await applyContainerPermissionChanges(
        containerId,
        changes,
      );

      replaceEntries(refreshedEntries);
      setApplyFeedbackStatus("success");
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        getPermissionRequestErrorMessage(
          error,
          "Unable to apply container permission changes.",
        ),
      );
      setApplyFeedbackStatus("error");
    } finally {
      setIsApplyingPermissions(false);
    }
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
          <DialogTitle>Manage Container Permission</DialogTitle>

          <DialogContent className={styles.content}>
            {/* 当前容器说明区：
                先说明当前选中的容器，以及本步实现范围，帮助后续维护者快速定位边界。 */}
            <div className={styles.section}>
              <Text weight="semibold">
                Container: {containerName ?? "<No container selected>"}
              </Text>
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

            {/* 权限页签：
                把 People 和 Groups 分开编辑，避免不同 principal 类型混在同一视图里。 */}
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

            {/* 搜索输入区：
                Combobox 继续负责“输入关键字 + 展示目录搜索结果 + 直接选择加入列表”整条链路。 */}
            <div className={styles.section}>
              <div className={styles.principalInputWrapper}>
                <Combobox
                  id="permission-principal-input"
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
                        // 已存在于当前 access list 的对象仍然保留在结果里，
                        // 这样用户能看见“命中了谁”，同时获得明确的重复反馈。
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
                              {/* 这里只显示 initials，不在结果列表里额外请求头像，
                                  这样既满足设计要求，也避免引入额外网络依赖。 */}
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
                Select someone from the results to add them. Duplicates won't be
                added twice.
              </Text>
            </div>

            {/* access list：
                这里展示的是本地草稿视图，但它的初始基线和 Apply 结果都来自真实后端权限。 */}
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
                            <Spinner size="tiny" />
                            <Text>
                              Loading current container permissions...
                            </Text>
                          </TableCellLayout>
                        </TableCell>
                      </TableRow>
                    ) : visibleEntries.length > 0 ? (
                      visibleEntries.map((entry) => (
                        <TableRow
                          key={entry.id}
                          data-testid={`permission-row-${entry.id}`}
                        >
                          <TableCell className={styles.principalColumn}>
                            <TableCellLayout>
                              {entry.principalName}
                            </TableCellLayout>
                          </TableCell>
                          <TableCell className={styles.roleColumn}>
                            <Select
                              className={styles.roleSelect}
                              aria-label={`${entry.principalName} role`}
                              disabled={interactionDisabled}
                              value={entry.role}
                              onChange={(event) =>
                                updateEntryRole(
                                  selectedTab,
                                  entry.id,
                                  event.currentTarget
                                    .value as ContainerPermissionRole,
                                )
                              }
                            >
                              {CONTAINER_PERMISSION_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </Select>
                          </TableCell>
                          <TableCell className={styles.actionColumn}>
                            <Button
                              appearance="subtle"
                              disabled={interactionDisabled}
                              icon={<DeleteRegular />}
                              aria-label={`Remove ${entry.principalName}`}
                              onClick={() => removeEntry(selectedTab, entry.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <TableCellLayout>
                            No entries yet. Search above and pick someone to add
                            them.
                          </TableCellLayout>
                        </TableCell>
                      </TableRow>
                    )}
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
              {/* Close 会放弃当前未保存草稿，恢复到最近一次加载或成功写回后的状态。 */}
              <Button
                appearance="secondary"
                onClick={() => discardDraftAndClose(onClose)}
              >
                Close
              </Button>
              {/* Apply 负责真实写回，并在成功后刷新当前列表与清空脏状态。 */}
              <Button
                appearance="primary"
                disabled={!hasUnsavedChanges || interactionDisabled}
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
