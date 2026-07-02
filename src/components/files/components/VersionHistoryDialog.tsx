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
          const isCurrentVersion = entry.id === currentVersionId;
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
        if (!data.open) {
          onClose();
        }
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Versions</DialogTitle>
          <DialogContent className={styles.content}>
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
                        version.
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

            {error && (
              <Text role="alert" className={styles.errorText}>
                {formatAppErrorMessageForUI(error, "Failed to load versions.")}
              </Text>
            )}

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

            {!isLoading && versions.length === 0 && !error && (
              <Text className={styles.emptyText}>No versions found.</Text>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
