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

export type PermissionAccessListEntryWithRole = IPermissionEntryBaseForUI & {
  role: string;
};

/**
 * 通用权限表格组件的输入属性。
 */
export interface IPermissionAccessListTableProps<
  TEntry extends PermissionAccessListEntryWithRole,
> {
  selectedTab: PermissionTabValue;
  entries: readonly TEntry[];
  isLoading: boolean;
  roleOptions: readonly TEntry["role"][];
  isInteractionDisabled: boolean;
  inheritedTooltipText?: string;
  onRoleChange: (entry: TEntry, role: TEntry["role"]) => void;
  onRemove: (entry: TEntry) => void;
  isRoleDisabled: (entry: TEntry) => boolean;
  isRemoveDisabled: (entry: TEntry) => boolean;
}

/**
 * 统一渲染权限弹窗里的 access list 表格。
 *
 * 它负责收口三类重复 UI：
 * 1. loading、empty、rows 三种表格状态
 * 2. 主体信息、角色下拉和删除按钮
 * 3. inherited 图标与提示文案
 */
export const PermissionAccessListTable = <
  TEntry extends PermissionAccessListEntryWithRole,
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
}: IPermissionAccessListTableProps<TEntry>) => {
  const styles = usePermissionsStyles();

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
              <Text weight="semibold">{entry.principalName}</Text>
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
          <Select
            className={styles.roleSelect}
            aria-label={`${entry.principalName} role`}
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
            aria-label={`Remove ${entry.principalName}`}
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
