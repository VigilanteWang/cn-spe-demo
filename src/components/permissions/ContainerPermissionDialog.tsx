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

import { useEffect, useState, type ChangeEvent } from "react";
import {
  Button,
  Select,
  Spinner,
  TableCell,
  TableCellLayout,
  TableRow,
  Text,
} from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import { readErrorMessage } from "../../common/errors.ts";
import {
  ContainerPermissionRole,
  IContainerPermissionEntriesByTab,
} from "./models/containerPermissionModels";
import { useContainerPermissionDialogState } from "./hooks/useContainerPermissionDialogState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { IContainerPermissionDialogProps } from "./components/permissionsTypes";
import { PermissionDialogFrame } from "./components/PermissionDialogFrame";
import { usePermissionsStyles } from "./components/permissionsStyles";
import {
  applyContainerPermissionChanges,
  listContainerPermissions,
  PermissionApiError,
} from "../../services/containerPermissionApi";
import { computeContainerPermissionChanges } from "./services/containerPermissionDiff";

const CONTAINER_PERMISSION_ROLES: ContainerPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

type ApplyFeedbackStatus = "success" | "error" | null;

/**
 * 把权限请求错误转成适合 UI 直接展示的文案。
 */
const getPermissionRequestErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof PermissionApiError) {
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
const createEmptyPermissionEntries = (): IContainerPermissionEntriesByTab => ({
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
  }, [open, containerId, replaceEntries]);

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

  const tableBodyContent = isLoadingPermissions ? (
    <TableRow>
      <TableCell colSpan={3}>
        <TableCellLayout>
          <Spinner size="tiny" />
          <Text>Loading current container permissions...</Text>
        </TableCellLayout>
      </TableCell>
    </TableRow>
  ) : visibleEntries.length > 0 ? (
    visibleEntries.map((entry) => (
      <TableRow key={entry.id} data-testid={`permission-row-${entry.id}`}>
        <TableCell className={styles.principalColumn}>
          <TableCellLayout>{entry.principalName}</TableCellLayout>
        </TableCell>
        <TableCell className={styles.roleColumn}>
          <Select
            className={styles.roleSelect}
            aria-label={`${entry.principalName} role`}
            disabled={interactionDisabled}
            value={entry.role}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateEntryRole(
                selectedTab,
                entry.id,
                event.currentTarget.value as ContainerPermissionRole,
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
          No entries yet. Search above and pick someone to add them.
        </TableCellLayout>
      </TableCell>
    </TableRow>
  );

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
