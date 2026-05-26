import { type ReactNode } from "react";
import { Table, TableBody } from "@fluentui/react-components";
import type { PermissionTabValue } from "../models/permissionSharedModels";
import { usePermissionsStyles } from "./permissionsStyles";

interface IPermissionAccessListTableProps {
  selectedTab: PermissionTabValue;
  tableBodyContent: ReactNode;
}

/**
 * 根据页签值返回当前界面要显示的标题文案。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 权限对话框里的 access list table 外壳。
 *
 * 它只负责：
 * - 滚动容器
 * - 表格结构
 * - 统一的 aria label
 *
 * 具体的表格行仍由调用方通过 `tableBodyContent` 传入。
 */
export const PermissionAccessListTable = ({
  selectedTab,
  tableBodyContent,
}: IPermissionAccessListTableProps) => {
  const styles = usePermissionsStyles();

  return (
    <div className={styles.accessListSection}>
      <div className={styles.tableWrapper}>
        <Table
          aria-label={`${getTabTitle(selectedTab)} access list`}
          className={styles.accessTable}
        >
          <TableBody>{tableBodyContent}</TableBody>
        </Table>
      </div>
    </div>
  );
};
