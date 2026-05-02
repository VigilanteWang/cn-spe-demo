import { useMemo } from "react";
import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridProps,
  DataGridRow,
  Link,
  SelectionItemId,
  TableCellLayout,
  TableColumnDefinition,
  createTableColumn,
} from "@fluentui/react-components";
import { HistoryRegular, PeopleRegular } from "@fluentui/react-icons";
import { IDriveItemExtended } from "../../../common/types";

const columnSizingOptions = {
  driveItemName: {
    minWidth: 150,
    defaultWidth: 350,
    idealWidth: 300,
  },
  lastModifiedTimestamp: {
    minWidth: 150,
    defaultWidth: 150,
  },
  lastModifiedBy: {
    minWidth: 150,
    defaultWidth: 150,
  },
  actions: {
    minWidth: 300,
    defaultWidth: 320,
  },
};

interface IFilesDataGridProps {
  /** 当前目录中的文件列表。 */
  driveItems: IDriveItemExtended[];
  /** 选中行集合。 */
  selectedRows: Set<SelectionItemId>;
  /** 表格选中变更处理。 */
  onSelectionChange: DataGridProps["onSelectionChange"];
  /** 打开文件夹。 */
  onOpenFolder: (folderId: string, folderName: string) => Promise<void>;
  /** 预览文件。 */
  onPreviewFile: (file: IDriveItemExtended) => void;
  /** 动作按钮容器样式类名。 */
  actionsButtonGroupClassName: string;
  /** Name 列单元格内容样式类名，用于启用文字换行。 */
  nameCellContentClassName: string;
}

/**
 * 文件列表表格。
 * @param props 组件属性。
 * @returns DataGrid UI。
 *
 * 列宽预设配置是模块级常量，引用永远不变。
 * 这样可以避免每次 render 产生新对象，触发 DataGrid 内部列宽初始化。
 */
export const FilesDataGrid = ({
  driveItems,
  selectedRows,
  onSelectionChange,
  onOpenFolder,
  onPreviewFile,
  actionsButtonGroupClassName,
  nameCellContentClassName,
}: IFilesDataGridProps) => {
  // useMemo 保证：只要 navigateToFolder 和 styles 引用不变，columns 数组就是同一个引用。
  // DataGrid 内部用引用比较检测 columns 是否变化，引用不变则不重置列宽状态。
  const columns = useMemo<TableColumnDefinition<IDriveItemExtended>[]>(
    () => [
      createTableColumn({
        columnId: "driveItemName",
        renderHeaderCell: () => "Name",
        renderCell: (driveItem) => (
          <TableCellLayout media={driveItem.iconElement}>
            {driveItem.isFolder ? (
              <Link
                className={nameCellContentClassName}
                onClick={(event) => {
                  // 防止事件冒泡到 DataGridRow 的选中逻辑，避免进入文件夹同时选中文件夹。
                  event.stopPropagation();
                  void onOpenFolder(
                    driveItem.id as string,
                    driveItem.name as string,
                  );
                }}
              >
                {driveItem.name}
              </Link>
            ) : (
              <Link
                className={nameCellContentClassName}
                onClick={() => onPreviewFile(driveItem)}
              >
                {driveItem.name}
              </Link>
            )}
          </TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "lastModifiedTimestamp",
        renderHeaderCell: () => "Last Modified",
        renderCell: (driveItem) => (
          <TableCellLayout>{driveItem.lastModifiedDateTime}</TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "lastModifiedBy",
        renderHeaderCell: () => "Last Modified By",
        renderCell: (driveItem) => (
          <TableCellLayout>{driveItem.modifiedByName}</TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "actions",
        renderHeaderCell: () => "Actions",
        renderCell: (driveItem) => {
          // 占位处理函数：当前仅用于展示，不包含真实业务实现。
          const onVersionsClick = () => {
            console.log("Versions placeholder clicked for:", driveItem.id);
          };
          const onPermissionsClick = () => {
            console.log("Permissions placeholder clicked for:", driveItem.id);
          };

          return (
            <div className={actionsButtonGroupClassName}>
              <Button
                aria-label="Versions"
                icon={<HistoryRegular />}
                onClick={onVersionsClick}
              >
                Versions
              </Button>
              <Button
                aria-label="Permissions"
                icon={<PeopleRegular />}
                onClick={onPermissionsClick}
              >
                Permissions
              </Button>
            </div>
          );
        },
      }),
    ],
    [actionsButtonGroupClassName, onOpenFolder, onPreviewFile],
  );

  return (
    /*
      文件列表 DataGrid：展示当前文件夹内所有文件和子文件夹
      - items: 当前文件夹的 DriveItem 列表（IDriveItemExtended）
      - getRowId: 使用 DriveItem.id 作为行唯一键，供多选状态跟踪
      - resizableColumns + columnSizingOptions: 支持用户拖拽调整列宽
      - selectionMode="multiselect": 支持多选，选中集合存入 selectedRows
    */
    <DataGrid
      items={driveItems}
      columns={columns}
      getRowId={(item) => item.id}
      resizableColumns
      columnSizingOptions={columnSizingOptions}
      selectionMode="multiselect"
      selectedItems={selectedRows}
      onSelectionChange={onSelectionChange}
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell }) => (
            <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
          )}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<IDriveItemExtended>>
        {({ item, rowId }) => (
          <DataGridRow<IDriveItemExtended> key={rowId}>
            {({ renderCell }) => (
              <DataGridCell>{renderCell(item)}</DataGridCell>
            )}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  );
};
