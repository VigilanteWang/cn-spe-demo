/**
 * 容器权限管理对话框模块
 *
 * 本模块负责：
 * 1. 提供“容器级权限管理”弹窗外壳
 * 2. 展示当前容器名称
 * 3. 展示权限页签、搜索输入区和 access list
 * 4. 接入真实 Graph 搜索交互，但暂不做真实权限初始加载和 Apply 写回
 *
 * 说明：
 * - 本步骤已经不再使用本地候选列表做最终搜索来源
 * - 真实目录搜索、debounce、搜索状态和结果映射都拆到了独立 Hook / 服务中
 * - Apply 仍然只确认本地草稿，不调用真实写回
 */

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
  Label,
  Option,
  Select,
  Spinner,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  mergeClasses,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import {
  ContainerPermissionRole,
  PermissionTabValue,
} from "./models/permissionModels";
import { createInitialPermissionEntries } from "./services/localPermissionData";
import { useContainerPermissionDialogState } from "./hooks/useContainerPermissionDialogState";
import { usePermissionPrincipalSearch } from "./hooks/usePermissionPrincipalSearch";
import { IContainerPermissionDialogProps } from "./permissionsTypes";
import { usePermissionsStyles } from "./permissionsStyles";

const CONTAINER_PERMISSION_ROLES: ContainerPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

/**
 * 根据页签值返回当前界面要显示的标题文案。
 *
 * 这里集中维护 people / groups 的显示映射，
 * 避免组件内部重复散落条件判断。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 容器权限管理弹窗。
 *
 * 当前步骤只实现：
 * - 人员与组的真实 Graph 搜索交互
 * - 选择结果后直接加入本地 access list 草稿
 *
 * 当前步骤仍不实现：
 * - 打开弹窗时真实读取容器权限
 * - Apply 时写回 Graph
 */
export const ContainerPermissionDialog = ({
  open,
  containerId,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  const styles = usePermissionsStyles();

  // 当前步骤还没有真实容器权限初始加载，这里先构造弹窗打开时的本地初始状态。
  const initialEntriesByTab = createInitialPermissionEntries();

  // 这里统一拿到弹窗所需的页签、草稿列表和关闭 / 应用动作，
  // 让组件层主要负责渲染和事件绑定。
  const {
    selectedTab,
    setSelectedTab,
    filterByTab,
    setFilter,
    hasUnsavedChanges,
    addCandidate,
    updateEntryRole,
    removeEntry,
    discardDraftAndClose,
    applyDraftAndClose,
    getVisibleEntries,
    isCandidateAdded,
  } = useContainerPermissionDialogState(
    initialEntriesByTab,
    containerId ?? "__no-container__",
  );

  // 搜索相关状态单独交给独立 Hook：
  // - 负责最小字符数判断
  // - 负责 debounce
  // - 负责真实 Graph 搜索
  // - 负责把候选项加入 access list
  const {
    query,
    results,
    status,
    feedbackMessage,
    errorMessage,
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

  /**
   * 处理 Combobox 输入变化。
   *
   * 当前输入值不会再用于过滤 access list，
   * 而是专门驱动目录搜索流程。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event,
  ) => {
    handleQueryChange(event.target.value);
  };

  /**
   * 处理用户从下拉结果里选中某个候选对象。
   *
   * 选中后会直接尝试加入 access list，
   * 不再保留额外的 Add 按钮。
   */
  const handleOptionSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    handleCandidateSelect(data.optionValue);
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
        <DialogBody>
          <DialogTitle>Manage Container Permission</DialogTitle>

          <DialogContent className={styles.content}>
            {/* 当前容器说明区：
                先说明当前选中的容器，以及本步骤实现范围，帮助后续维护者快速定位边界。 */}
            <div className={styles.section}>
              <Text weight="semibold">
                Container: {containerName ?? "<No container selected>"}
              </Text>
              <Text>
                当前先完成最终的目录搜索交互与本地 access list 草稿编辑。真实权限初始加载和
                Apply 写回会在后续步骤接入。
              </Text>
            </div>

            {/* 权限页签：
                把 People 和 Groups 分开编辑，避免不同 principal 类型混在同一视图里。 */}
            <div className={styles.section}>
              <Label>Permission Tabs</Label>
              <TabList
                selectedValue={selectedTab}
                onTabSelect={(_event, data) =>
                  setSelectedTab(data.value as PermissionTabValue)
                }
              >
                <Tab value="people">People</Tab>
                <Tab value="groups">Groups</Tab>
              </TabList>
            </div>

            {/* 搜索输入区：
                Combobox 负责“输入关键字 + 展示目录搜索结果 + 直接选择加入列表”整条链路。 */}
            <div className={styles.section}>
              <Label htmlFor="permission-principal-input">
                Add {getTabTitle(selectedTab)}
              </Label>
              <div className={styles.principalInputWrapper}>
                <Combobox
                  id="permission-principal-input"
                  aria-label={`Add ${getTabTitle(selectedTab)}`}
                  className={styles.principalCombobox}
                  expandIcon={null}
                  placeholder={`输入至少 3 个字符后搜索 ${getTabTitle(selectedTab)}`}
                  freeform
                  selectedOptions={[]}
                  value={query}
                  open={isDropdownOpen}
                  onChange={handleComboboxChange}
                  onOptionSelect={handleOptionSelect}
                >
                  {status === "waitingForMoreInput" ? (
                    <Option disabled text="Need more input">
                      <Text size={200}>请至少输入 3 个字符后再开始搜索。</Text>
                    </Option>
                  ) : null}

                  {status === "debouncing" ? (
                    <Option disabled text="Debouncing">
                      <Text size={200}>正在整理输入，稍后开始搜索...</Text>
                    </Option>
                  ) : null}

                  {status === "loading" ? (
                    <Option disabled text="Searching">
                      <div
                        className={styles.loadingOption}
                        data-testid="directory-search-loading"
                      >
                        <Spinner size="tiny" />
                        <Text>正在搜索目录对象...</Text>
                      </div>
                    </Option>
                  ) : null}

                  {status === "success"
                    ? results.map((candidate) => {
                        // 已存在于当前 access list 的对象仍然保留在结果里，
                        // 这样用户能看见“命中了谁”，同时获得明确的重复反馈。
                        const alreadyAdded = isCandidateAdded(
                          selectedTab,
                          candidate.id,
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
                                  已存在
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
                        没有找到匹配的目录对象。请尝试更完整的姓名、邮箱或组名关键字。
                      </Text>
                    </Option>
                  ) : null}

                  {status === "error" ? (
                    <Option disabled text="Search failed">
                      <Text size={200}>{errorMessage}</Text>
                    </Option>
                  ) : null}
                </Combobox>
              </div>

              {/* 搜索框下方的说明 / 反馈区：
                  - 有重复反馈时优先显示重复反馈
                  - 有错误时显示错误
                  - 都没有时显示默认使用说明 */}
              {feedbackMessage ? (
                <Text
                  size={200}
                  role="status"
                  aria-live="polite"
                  className={styles.duplicateStatusText}
                >
                  {feedbackMessage}
                </Text>
              ) : null}
              {!feedbackMessage && errorMessage ? (
                <Text
                  size={200}
                  role="status"
                  aria-live="polite"
                  className={styles.errorStatusText}
                >
                  {errorMessage}
                </Text>
              ) : null}
              {!feedbackMessage && !errorMessage ? (
                <Text size={200} className={styles.searchStatusText}>
                  选择结果后会直接加入当前页签的 access list，重复对象不会再次加入。
                </Text>
              ) : null}
            </div>

            {/* access list：
                这里展示的是本地草稿视图，支持行内改角色和删除。 */}
            <div className={styles.section}>
              <Label>Access List</Label>
              <div className={styles.tableWrapper}>
                <Table
                  aria-label={`${getTabTitle(selectedTab)} access list`}
                  className={styles.accessTable}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell
                        className={mergeClasses(
                          styles.headerCell,
                          styles.principalColumn,
                        )}
                      >
                        Account
                      </TableHeaderCell>
                      <TableHeaderCell
                        className={mergeClasses(
                          styles.headerCell,
                          styles.roleColumn,
                        )}
                      >
                        Role
                      </TableHeaderCell>
                      <TableHeaderCell
                        className={mergeClasses(
                          styles.headerCell,
                          styles.actionColumn,
                        )}
                      >
                        Action
                      </TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleEntries.length > 0 ? (
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
                            当前没有权限项。可以先在上方输入关键字并从搜索结果中选择一条加入。
                          </TableCellLayout>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>

          <DialogActions>
            {/* Close 会放弃当前未保存草稿，恢复到弹窗打开时的状态。 */}
            <Button
              appearance="secondary"
              onClick={() => discardDraftAndClose(onClose)}
            >
              Close
            </Button>
            {/* Apply 当前仍然只确认本地草稿，真实 Graph 写回会在后续步骤实现。 */}
            <Button
              appearance="primary"
              disabled={!hasUnsavedChanges}
              onClick={() => applyDraftAndClose(onClose)}
            >
              Apply
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
