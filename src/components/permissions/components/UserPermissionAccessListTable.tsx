import { type ChangeEvent } from "react";
import {
  Button,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableRow,
  Text,
  Tooltip,
} from "@fluentui/react-components";
import { ConvertRangeRegular, DeleteRegular } from "@fluentui/react-icons";
import type { IPermissionEntryBaseForUI } from "../../../../common/contracts/permissionCommonContracts";
import type { PermissionTabValue } from "../models/permissionSharedModels";
import { getPermissionTabTitle } from "../utils/permissionDialogSharedUtils";
import { usePermissionsStyles } from "./permissionsStyles";

/**
 * Access List 表格内部使用的最小权限行结构。
 *
 * 在共享基础权限字段之上补充 `role`，让 container / item
 * 两类权限弹窗都能复用同一套表格渲染逻辑。
 */
export type UserPermissionAccessListEntryWithRole = IPermissionEntryBaseForUI & {
  role: string;
};

/**
 * 通用权限表格组件的输入属性。
 *
 * @typeParam TEntry 单条权限记录的具体类型。
 */
export interface IUserPermissionAccessListTableProps<
  TEntry extends UserPermissionAccessListEntryWithRole,
> {
  /** 当前激活的 tab，用来生成表格的可访问名称。 */
  selectedTab: PermissionTabValue;
  /** 当前 tab 下需要渲染的权限行。 */
  entries: readonly TEntry[];
  /** 是否正在加载后端权限数据。 */
  isLoading: boolean;
  /** 角色下拉框可选项。 */
  roleOptions: readonly TEntry["role"][];
  /** 是否需要统一禁用整张表里的交互控件。 */
  isInteractionDisabled: boolean;
  /** 继承权限图标对应的提示文案。 */
  inheritedTooltipText?: string;
  /** 当用户切换角色时回传更新后的角色值。 */
  onRoleChange: (entry: TEntry, role: TEntry["role"]) => void;
  /** 当用户点击删除时回传对应的权限行。 */
  onRemove: (entry: TEntry) => void;
  /** 返回当前权限行的角色下拉框是否应禁用。 */
  isRoleDisabled: (entry: TEntry) => boolean;
  /** 返回当前权限行的删除按钮是否应禁用。 */
  isRemoveDisabled: (entry: TEntry) => boolean;
}

/**
 * 统一渲染权限弹窗中的 Access List 表格。
 *
 * 这个组件只关心展示层：
 * 1. 根据加载状态、空状态和真实数据切换表格内容
 * 2. 渲染主体信息、角色下拉框和删除按钮
 * 3. 在继承权限场景下补充图标和提示文案
 *
 * @typeParam TEntry 单条权限记录的具体类型。
 * @returns 渲染后的权限列表表格。
 */
export const UserPermissionAccessListTable = <
  TEntry extends UserPermissionAccessListEntryWithRole,
>({
  selectedTab,
  entries,
  isLoading,
  roleOptions,
  isInteractionDisabled,
  inheritedTooltipText,
  onRoleChange,
  onRemove,
  isRoleDisabled,
  isRemoveDisabled,
}: IUserPermissionAccessListTableProps<TEntry>) => {
  const styles = usePermissionsStyles();

  // 把 loading、空列表、正常行三种状态统一折叠成同一个 TableBody 内容，避免 return 分支过多。
  const tableBodyContent = isLoading ? (
    <TableRow>
      <TableCell colSpan={3}>
        <TableCellLayout>
          <Spinner size="tiny" />
          <Text>Loading current permissions</Text>
        </TableCellLayout>
      </TableCell>
    </TableRow>
  ) : entries.length > 0 ? (
    entries.map((entry) => (
      <TableRow key={entry.id} data-testid={`permission-row-${entry.id}`}>
        <TableCell className={styles.principalColumn}>
          <div className={styles.principalCellContent}>
            <div className={styles.principalCellText}>
              <Text weight="semibold">{entry.principalDisplayName}</Text>
              {entry.description ? (
                <Text size={200} className={styles.principalSecondaryText}>
                  {entry.description}
                </Text>
              ) : null}
            </div>

            {entry.isInherited && inheritedTooltipText ? (
              <Tooltip
                relationship="label"
                positioning="above"
                withArrow
                content={{
                  className: styles.tooltipContent,
                  children: <Text size={100}>{inheritedTooltipText}</Text>,
                }}
              >
                {/* 让键盘用户也能把焦点落到提示图标上，读到 Tooltip 说明。 */}
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
        </TableCell>

        <TableCell className={styles.roleColumn}>
          {/* Fluent UI 的 Select 事件值来自原生 select，这里在边界处收敛成业务角色类型。 */}
          <Select
            className={styles.roleSelect}
            aria-label={`${entry.principalDisplayName} role`}
            disabled={isInteractionDisabled || isRoleDisabled(entry)}
            value={entry.role}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onRoleChange(entry, event.currentTarget.value as TEntry["role"])
            }
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </TableCell>

        <TableCell className={styles.actionColumn}>
          <Button
            appearance="subtle"
            disabled={isInteractionDisabled || isRemoveDisabled(entry)}
            icon={<DeleteRegular />}
            aria-label={`Remove ${entry.principalDisplayName}`}
            onClick={() => onRemove(entry)}
          />
        </TableCell>
      </TableRow>
    ))
  ) : (
    <TableRow>
      <TableCell colSpan={3}>
        <TableCellLayout>
          <Text size={200}>No permissions added yet.</Text>
        </TableCellLayout>
      </TableCell>
    </TableRow>
  );

  return (
    <div className={styles.accessListSection}>
      <div className={styles.tableWrapper}>
        {/* 结合当前 tab 标题生成无障碍名称，便于读屏区分 people / groups 两张列表。 */}
        <Table
          aria-label={`${getPermissionTabTitle(selectedTab)} access list`}
          className={styles.accessTable}
        >
          <TableBody>{tableBodyContent}</TableBody>
        </Table>
      </div>
    </div>
  );
};
