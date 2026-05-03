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
import { formatDateTimeColumnValue } from "../../../common/dateTime";
import { PersonCell } from "./PersonCell";

// DataGrid 列宽策略：给每列一个“可拖拽时的最小宽度 + 初始宽度”，
// 让页面首次渲染时布局稳定，同时允许用户按需调整。
const columnSizingOptions = {
  driveItemName: {
    // 名称列通常内容最长，因此给更大的默认宽度，减少换行。
    minWidth: 220,
    defaultWidth: 960,
  },
  lastModifiedTimestamp: {
    // 时间列内容相对固定（日期/短文本），宽度可比名称列小。
    minWidth: 160,
    defaultWidth: 190,
  },
  lastModifiedBy: {
    // 人员列需要显示头像+姓名，保持与时间列接近的视觉平衡。
    minWidth: 160,
    defaultWidth: 190,
  },
  actions: {
    // 操作列包含两个按钮，预留足够空间避免按钮挤压。
    minWidth: 240,
    defaultWidth: 260,
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
  // useMemo 保证：依赖不变时，columns 保持同一引用。
  // DataGrid 内部用引用比较检测 columns 是否变化，引用不变则不重置列宽状态。
  const columns = useMemo<TableColumnDefinition<IDriveItemExtended>[]>(
    () => [
      createTableColumn({
        columnId: "driveItemName",
        // 按文件/文件夹名称字母序排序（忽略大小写）
        compare: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
        renderHeaderCell: () => "Name",
        renderCell: (driveItem) => (
          // media 会显示在名称前方，这里复用上游准备好的文件/文件夹图标。
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
                // 文件点击进入预览；不需要 stopPropagation，因为预览行为可与行选中共存。
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
        // 按最后修改时间排序（早 → 晚）；缺失时间视为 0（最早）
        compare: (a, b) =>
          new Date(a.lastModifiedDateTime ?? 0).getTime() -
          new Date(b.lastModifiedDateTime ?? 0).getTime(),
        renderHeaderCell: () => "Last Modified",
        renderCell: (driveItem) => (
          <TableCellLayout>
            {/* 统一使用公共时间格式化函数，确保整个应用时间文案风格一致。 */}
            {formatDateTimeColumnValue(driveItem.lastModifiedDateTime)}
          </TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "lastModifiedBy",
        // 按修改者姓名字母序排序（忽略大小写）
        compare: (a, b) => a.modifiedByName.localeCompare(b.modifiedByName),
        renderHeaderCell: () => "Last Modified By",
        renderCell: (driveItem) => (
          // PersonCell 负责头像、姓名、在线状态三者组合展示，避免在表格里重复拼装 UI。
          <PersonCell
            name={driveItem.modifiedByName}
            imageUrl={driveItem.modifiedByPhotoUrl}
            presenceStatus={driveItem.modifiedByPresence}
          />
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
      // 使用 Graph 返回的 driveItem.id 作为稳定键，避免排序/筛选后行状态错位。
      getRowId={(item) => item.id}
      style={{ width: "100%" }}
      sortable
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
