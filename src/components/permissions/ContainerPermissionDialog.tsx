/**
 * 容器权限管理对话框模块
 *
 * 本模块负责：
 * 1. 提供“容器级权限管理”弹窗外壳
 * 2. 展示当前容器名称
 * 3. 展示权限 tab 、输入区和访问列表
 * 4. 为后续接入真实 Graph 搜索和写回逻辑预留结构
 *
 * 说明：
 * - 本步骤只实现本地草稿编辑能力。
 * - 不请求真实权限数据，不做 Graph 搜索，也不做写回。
 */

import {
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Button,
  Label,
  mergeClasses,
  Option,
  Select,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import {
  ContainerPermissionRole,
  PermissionTabValue,
} from "./models/permissionModels";
import {
  LOCAL_PERMISSION_CANDIDATES,
  createInitialPermissionEntries,
} from "./services/localPermissionData";
import { useContainerPermissionDialogState } from "./hooks/useContainerPermissionDialogState";
import { IContainerPermissionDialogProps } from "./permissionsTypes";
import { usePermissionsStyles } from "./permissionsStyles";

const CONTAINER_PERMISSION_ROLES: ContainerPermissionRole[] = [
  "Reader",
  "Writer",
  "Manager",
  "Owner",
];

/**
 * 根据 tab 值返回当前界面要展示的标题文案。
 *
 * 这里把 people / groups 到显示名称的映射集中起来，
 * 避免组件内部重复写条件分支。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 容器权限管理弹窗。
 *
 * @param open 对话框是否打开
 * @param containerId 当前容器 ID，用于隔离每个容器的本地草稿状态
 * @param containerName 当前选中的容器名称；未选择容器时显示占位文案
 * @param onClose 关闭弹窗的回调
 *
 * 状态管理：
 * -  tab 切换、草稿列表、编辑前原始状态、筛选关键字都拆到了独立 Hook。
 * - Close 会放弃未保存草稿并恢复到原始状态。
 * - Apply 目前只在本地确认草稿，不调用真实写回。
 */
export const ContainerPermissionDialog = ({
  open,
  containerId,
  containerName,
  onClose,
}: IContainerPermissionDialogProps) => {
  const styles = usePermissionsStyles();
  // 当前步骤没有真实接口，这里先构造“弹窗打开时看到的初始权限状态”。
  const initialEntriesByTab = createInitialPermissionEntries();

  // 这里统一拿到弹窗所需的 tab 、筛选、草稿编辑和关闭/应用操作，
  // 组件层只负责把这些状态绑定到输入框、表格和按钮。
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

  // 当前输入框中的文本。这个值现在既驱动本地候选过滤，也驱动表格本地过滤。
  const currentFilter = filterByTab[selectedTab];
  // 统一做 trim 和小写化，避免大小写和首尾空格影响本地匹配结果。
  const normalizedFilter = currentFilter.trim().toLowerCase();
  // 当前 tab 表格里真正要展示的权限项，由 Hook 根据草稿和筛选词计算得到。
  const visibleEntries = getVisibleEntries(selectedTab);
  // 当前 tab 下拉框里展示的候选项。
  // 现在只在本地假数据里做过滤，后续接 Graph 搜索时这里会替换成接口返回结果。
  const visibleCandidates = LOCAL_PERMISSION_CANDIDATES[selectedTab].filter(
    (candidate) => {
      if (!normalizedFilter) {
        return true;
      }

      const searchableText =
        `${candidate.name} ${candidate.description}`.toLowerCase();
      return searchableText.includes(normalizedFilter);
    },
  );
  // 只有用户输入了内容才展开候选下拉，避免空输入时直接展示整份本地列表。
  const shouldShowCandidateDropdown = normalizedFilter.length > 0;

  /**
   * 处理输入框文本变化。
   *
   * 当前先把输入内容当成本地筛选关键字，
   * 后续替换为真实搜索时可以沿用这个入口。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event,
  ) => {
    setFilter(selectedTab, event.target.value);
  };

  /**
   * 处理从本地下拉候选中选择 principal 。
   *
   * 当前行为：
   * 1. 将候选项追加到本地草稿
   * 2. 默认角色为 Reader
   * 3. 选择后清空输入框，收起下拉面板
   */
  const handleCandidateSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    // Combobox 选中后拿到的是候选项的稳定标识，当前来自本地假数据，
    // 后续也可以直接换成 Graph 返回的用户/组 ID。
    const candidateId = data.optionValue;

    if (!candidateId) {
      return;
    }

    // 根据选中的 ID 回查完整候选对象，再转换成权限草稿行。
    const nextCandidate = LOCAL_PERMISSION_CANDIDATES[selectedTab].find(
      (candidate) => candidate.id === candidateId,
    );

    if (!nextCandidate) {
      return;
    }

    addCandidate(selectedTab, nextCandidate);
    setFilter(selectedTab, "");
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
            {/* 当前容器说明区：先展示容器名和本步骤范围，帮助开发者明确这一步只做本地草稿编辑。 */}
            <div className={styles.section}>
              <Text weight="semibold">
                Container: {containerName ?? "<No container selected>"}
              </Text>
              <Text>
                这里先实现本地草稿编辑体验。后续步骤再接入真实 Graph
                搜索、容器权限读取和 Apply 写回。
              </Text>
            </div>

            {/* 权限 tab ：把 People 与 Groups 的草稿列表拆开，避免不同 principal 类型的编辑混在一起。 */}
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

            {/* 输入框当前承载“本地筛选 + 本地下拉候选”，后续可以整体替换为真实 principal 搜索体验。 */}
            <div className={styles.section}>
              <Label htmlFor="permission-principal-input">
                Add {getTabTitle(selectedTab)}
              </Label>
              <div className={styles.principalInputWrapper}>
                {/* Combobox 现在承担“输入关键字 + 选择本地候选”两件事。
                    后续如果切到远程搜索，可以保留这个交互外壳，只替换数据来源和事件处理。 */}
                <Combobox
                  id="permission-principal-input"
                  aria-label={`Add ${getTabTitle(selectedTab)}`}
                  className={styles.principalCombobox}
                  expandIcon={null}
                  placeholder="输入关键字后显示本地候选项，后续会替换为真实 principal 搜索"
                  freeform
                  selectedOptions={[]}
                  value={currentFilter}
                  open={shouldShowCandidateDropdown}
                  onChange={handleComboboxChange}
                  onOptionSelect={handleCandidateSelect}
                >
                  {visibleCandidates.length > 0 ? (
                    visibleCandidates.map((candidate) => {
                      // 已经加入草稿的候选项仍然保留在列表里，但会禁用，
                      // 这样用户能看到命中结果，同时避免重复添加。
                      const added = isCandidateAdded(selectedTab, candidate.id);

                      return (
                        <Option
                          key={candidate.id}
                          value={candidate.id}
                          text={candidate.name}
                          disabled={added}
                        >
                          <div
                            className={styles.dropdownOption}
                            data-testid={`candidate-option-${candidate.id}`}
                          >
                            <Text weight="semibold">{candidate.name}</Text>
                            <Text size={200}>{candidate.description}</Text>
                          </div>
                        </Option>
                      );
                    })
                  ) : (
                    <Option disabled text="No local candidates">
                      <Text size={200}>没有匹配的本地候选项</Text>
                    </Option>
                  )}
                </Combobox>
              </div>
              <Text size={200}>
                输入关键字后会弹出本地候选下拉列表，当前只演示本地草稿交互，后续再接入真实搜索。
              </Text>
            </div>

            {/* 访问列表由本地草稿状态驱动，支持行内改权限与删除。 */}
            <div className={styles.section}>
              <Label>Access List</Label>
              <div className={styles.tableWrapper}>
                {/* 表格始终展示“当前 tab + 当前筛选条件”下的草稿视图。
                    这里的改角色和删除都只改本地草稿，直到用户点击 Apply。 */}
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
                            当前没有权限项。可以先在上方输入关键字并从下拉候选中添加一条。
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
            {/* Close 会丢弃当前未保存草稿，确保用户可以安全退出本地编辑。 */}
            <Button
              appearance="secondary"
              onClick={() => discardDraftAndClose(onClose)}
            >
              Close
            </Button>
            {/* Apply 当前仅做本地确认，先把草稿提升为“编辑后状态”，后续步骤再接真实写回。 */}
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
