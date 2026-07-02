import { useEffect, useMemo, useState } from "react";
import {
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Spinner,
  TableCellLayout,
  TableColumnDefinition,
  Text,
  createTableColumn,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { AppError } from "../../../../common/appError";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import { formatDateTimeColumnValue } from "../../../common/dateTime";
import type { IItemVersionEntryForUI } from "../../../../common/contracts/itemVersionContracts";

const useVersionHistoryDialogStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    minWidth: "720px",
    maxWidth: "960px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  gridWrapper: {
    overflowX: "auto",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  emptyText: {
    color: tokens.colorNeutralForeground2,
  },
  popoverContent: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    maxWidth: "320px",
  },
  popoverActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
});

interface IVersionHistoryDialogProps {
  /** 当前 Versions Dialog 是否打开。 */
  open: boolean;
  /** 列表数据。 */
  versions: IItemVersionEntryForUI[];
  /** 后端确认的当前版本 ID。 */
  currentVersionId: string | null;
  /** 首次读取或重读中的状态。 */
  isLoading: boolean;
  /** 写操作进行中的状态。 */
  isActionPending: boolean;
  /** 弹窗内展示的错误。 */
  error: AppError | null;
  /** 关闭弹窗。 */
  onClose: () => void;
  /** 下载指定版本。 */
  onDownload: (entry: IItemVersionEntryForUI) => void;
  /** 恢复指定版本。 */
  onRestore: (entry: IItemVersionEntryForUI) => void;
  /** 删除指定版本。 */
  onDelete: (entry: IItemVersionEntryForUI) => void;
  /** 删除全部历史版本。 */
  onDeleteHistoryVersions: () => void;
}

/**
 * 文件版本历史弹窗。
 *
 * 这个组件只负责展示版本列表和转发用户动作，
 * 不在组件内部维护版本数据来源或当前版本判定逻辑。
 *
 * @param props 组件属性。
 * @returns Versions Dialog UI。
 */
export const VersionHistoryDialog = ({
  open,
  versions,
  currentVersionId,
  isLoading,
  isActionPending,
  error,
  onClose,
  onDownload,
  onRestore,
  onDelete,
  onDeleteHistoryVersions,
}: IVersionHistoryDialogProps) => {
  const styles = useVersionHistoryDialogStyles();
  const [isDeleteHistoryPopoverOpen, setIsDeleteHistoryPopoverOpen] =
    useState(false);

  useEffect(() => {
    // 弹窗关闭时顺手收起二次确认浮层，避免下次打开时沿用上一次的确认状态。
    if (!open) {
      setIsDeleteHistoryPopoverOpen(false);
    }
  }, [open]);

  const columns = useMemo<TableColumnDefinition<IItemVersionEntryForUI>[]>(
    () => [
      createTableColumn({
        columnId: "versionId",
        renderHeaderCell: () => "No.",
        renderCell: (entry) => <TableCellLayout>{entry.id}</TableCellLayout>,
      }),
      createTableColumn({
        columnId: "modified",
        renderHeaderCell: () => "Modified",
        renderCell: (entry) => (
          <TableCellLayout>
            {formatDateTimeColumnValue(entry.lastModifiedDateTime)}
          </TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "modifiedBy",
        renderHeaderCell: () => "Modified by",
        renderCell: (entry) => (
          <TableCellLayout>{entry.lastModifiedByDisplayName}</TableCellLayout>
        ),
      }),
      createTableColumn({
        columnId: "actions",
        renderHeaderCell: () => "Actions",
        renderCell: (entry) => {
          // “当前版本”由后端单独接口确认，而不是简单地依赖列表顺序推断。
          const isCurrentVersion = entry.id === currentVersionId;
          // 读取中或写操作 pending 时统一禁用按钮，避免并发点击打乱版本状态。
          const isDisabled = isLoading || isActionPending;

          return (
            <div className={styles.actionGroup}>
              <Button
                size="small"
                onClick={() => onDownload(entry)}
                disabled={isDisabled}
              >
                Download
              </Button>
              <Button
                size="small"
                onClick={() => onRestore(entry)}
                disabled={isDisabled || isCurrentVersion}
              >
                Restore
              </Button>
              <Button
                size="small"
                onClick={() => onDelete(entry)}
                disabled={isDisabled || isCurrentVersion}
              >
                Delete
              </Button>
            </div>
          );
        },
      }),
    ],
    [
      currentVersionId,
      isActionPending,
      isLoading,
      onDelete,
      onDownload,
      onRestore,
      styles.actionGroup,
    ],
  );

  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_event, data) => {
        // 把 Dialog 的关闭行为统一回收到页面层，保持弹窗开关只有一个出口。
        if (!data.open) {
          onClose();
        }
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Versions</DialogTitle>
          <DialogContent className={styles.content}>
            {/* 顶部区域左边显示读取状态，右边放批量动作入口。 */}
            <div className={styles.headerRow}>
              <div>
                {isLoading && (
                  <Spinner
                    size="small"
                    label="Loading versions..."
                    labelPosition="after"
                  />
                )}
              </div>
              <div className={styles.headerActions}>
                {/* 删除全部历史版本是高风险动作，因此先经过一次轻量确认。 */}
                <Popover
                  open={isDeleteHistoryPopoverOpen}
                  onOpenChange={(_event, data) => {
                    setIsDeleteHistoryPopoverOpen(data.open);
                  }}
                >
                  <PopoverTrigger disableButtonEnhancement>
                    <Button disabled={isLoading || isActionPending}>
                      Delete history versions
                    </Button>
                  </PopoverTrigger>
                  <PopoverSurface>
                    <div className={styles.popoverContent}>
                      <Text>
                        This will delete all history versions except the current
                        version. Are you sure?
                      </Text>
                      <div className={styles.popoverActions}>
                        <Button
                          appearance="secondary"
                          onClick={() => setIsDeleteHistoryPopoverOpen(false)}
                        >
                          No
                        </Button>
                        <Button
                          appearance="primary"
                          disabled={isActionPending}
                          onClick={() => {
                            // 先关闭确认浮层，再交给外层执行删除，避免执行后浮层状态残留。
                            setIsDeleteHistoryPopoverOpen(false);
                            onDeleteHistoryVersions();
                          }}
                        >
                          Yes
                        </Button>
                      </div>
                    </div>
                  </PopoverSurface>
                </Popover>
              </div>
            </div>

            {/* 所有读取、下载、恢复、删除类错误都汇总显示在同一位置，降低用户定位成本。 */}
            {error && (
              <Text role="alert" className={styles.errorText}>
                {formatAppErrorMessageForUI(error, "Failed to load versions.")}
              </Text>
            )}

            {/* 表格只负责展示版本条目和转发动作，不自行推导数据来源。 */}
            <div className={styles.gridWrapper}>
              <DataGrid
                items={versions}
                columns={columns}
                getRowId={(entry) => entry.id}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>
                        {renderHeaderCell()}
                      </DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody<IItemVersionEntryForUI>>
                  {({ item, rowId }) => (
                    <DataGridRow<IItemVersionEntryForUI> key={rowId}>
                      {({ renderCell }) => (
                        <DataGridCell>{renderCell(item)}</DataGridCell>
                      )}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            </div>

            {/* 非加载中且没有错误时，空列表才真正表示“当前没有可展示的版本记录”。 */}
            {!isLoading && versions.length === 0 && !error && (
              <Text className={styles.emptyText}>No versions found.</Text>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
