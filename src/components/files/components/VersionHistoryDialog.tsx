import { useEffect, useMemo, useRef, useState } from "react";
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
  Spinner,
  TableCellLayout,
  TableColumnDefinition,
  TableColumnSizingOptions,
  Text,
  createTableColumn,
} from "@fluentui/react-components";
import {
  ArrowCounterclockwiseRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import type { AppError } from "../../../../common/appError";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import { ActionConfirmPopover } from "../../common/ActionConfirmPopover";
import { formatDateTimeColumnValue } from "../../../common/dateTime";
import type { IItemVersionEntryForUI } from "../../../../common/contracts/itemVersionContracts";
import type { VersionDialogPendingAction } from "../filesTypes";
import { useVersionHistoryDialogStyles } from "../filesStyles";

// Versions 表格的默认列宽刻意贴近内容：
// - 默认先按内容附近的紧凑宽度渲染，避免少量列把整个 dialog 撑得过宽
// - 仍保留较小的 minWidth，让窄视口时先收缩，实在放不下时再出现横向滚动
const versionColumnSizingOptions: TableColumnSizingOptions = {
  versionId: {
    minWidth: 60,
    idealWidth: 72,
    defaultWidth: 72,
  },
  modified: {
    minWidth: 116,
    idealWidth: 190,
    defaultWidth: 190,
  },
  modifiedBy: {
    minWidth: 116,
    idealWidth: 190,
    defaultWidth: 190,
  },
  actions: {
    minWidth: 70,
    idealWidth: 90,
    defaultWidth: 90,
  },
};

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
  /** 当前正在执行的写动作类型。 */
  pendingAction: VersionDialogPendingAction | null;
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
  pendingAction,
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
  const [activeRowPopover, setActiveRowPopover] = useState<{
    versionId: string;
    action: Exclude<VersionDialogPendingAction, "deleteHistoryVersions">;
  } | null>(null);
  // 单看当前 isActionPending 只能知道“现在是否仍在执行”，
  // 这里额外记住上一轮的值，是为了识别 isActionPending 从 true 变为 false 的时刻
  const wasActionPendingRef = useRef(isActionPending);

  useEffect(() => {
    // 弹窗关闭时顺手收起二次确认浮层，避免下次打开时沿用上一次的确认状态。
    if (!open) {
      setIsDeleteHistoryPopoverOpen(false);
      setActiveRowPopover(null);
    }
  }, [open]);

  useEffect(() => {
    // 写操作结束后统一收起确认浮层，让成功与失败都回到一致的起点。
    if (wasActionPendingRef.current && !isActionPending) {
      setIsDeleteHistoryPopoverOpen(false);
      setActiveRowPopover(null);
    }

    wasActionPendingRef.current = isActionPending;
  }, [isActionPending]);

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
          // Popover 采用“受控打开”模式：
          // 当前这一行是否打开，不由 ActionConfirmPopover 自己记状态，
          // 而是由本组件的 activeRowPopover 统一记录“哪一行、哪个动作正在确认”。
          // 因此用户点击 trigger 后，会先通过 onOpenChange 把“想打开”的意图传回来，
          // 再由 setActiveRowPopover 触发本组件重新 render，
          // 下一轮 render 才会把 open=true 传给对应那一个 Popover。
          const isRestorePopoverOpen =
            activeRowPopover?.versionId === entry.id &&
            activeRowPopover.action === "restoreVersion";
          const isDeletePopoverOpen =
            activeRowPopover?.versionId === entry.id &&
            activeRowPopover.action === "deleteVersion";

          return (
            <div className={styles.actionGroup}>
              <Button
                size="small"
                appearance="subtle"
                className={styles.actionIconButton}
                aria-label="Download"
                title="Download"
                icon={<ArrowDownloadRegular />}
                onClick={() => onDownload(entry)}
                disabled={isDisabled}
              />
              <ActionConfirmPopover
                trigger={
                  <Button
                    size="small"
                    appearance="subtle"
                    className={styles.actionIconButton}
                    aria-label="Restore"
                    title="Restore"
                    icon={<ArrowCounterclockwiseRegular />}
                    disabled={isDisabled || isCurrentVersion}
                  />
                }
                open={isRestorePopoverOpen}
                onOpenChange={(nextOpen) => {
                  if (nextOpen) {
                    // 顶部的“Delete history versions”和行内确认框是互斥的：
                    // 这里一旦准备打开某一行的 Restore 确认框，就先强制关闭顶部确认框，
                    // 避免页面上同时存在两个高风险动作的确认浮层。
                    setIsDeleteHistoryPopoverOpen(false);
                    // 把“当前打开的是哪一行的 Restore 确认框”写入组件 state。
                    // 这个 setState 会触发 VersionHistoryDialog 重新 render，
                    // 然后当前行重新计算出 isRestorePopoverOpen === true，
                    // 最终把 open=true 传回 ActionConfirmPopover / Popover。
                    setActiveRowPopover({
                      versionId: entry.id,
                      action: "restoreVersion",
                    });
                    return;
                  }

                  if (isRestorePopoverOpen) {
                    // 关闭意图到来时，只需要清空当前行记录；
                    // 下一轮 render 后，这一行的 open 就会回到 false。
                    setActiveRowPopover(null);
                  }
                }}
                message="Are you sure you want to restore this version? This will create a copy of it and make it the latest version."
                loadingLabel="Restoring"
                isPending={
                  isActionPending && pendingAction === "restoreVersion"
                }
                onConfirm={() => onRestore(entry)}
                disabled={isDisabled || isCurrentVersion}
              />
              <ActionConfirmPopover
                trigger={
                  <Button
                    size="small"
                    appearance="subtle"
                    className={styles.actionIconButton}
                    aria-label="Delete"
                    title="Delete"
                    icon={<DeleteRegular />}
                    disabled={isDisabled || isCurrentVersion}
                  />
                }
                open={isDeletePopoverOpen}
                onOpenChange={(nextOpen) => {
                  if (nextOpen) {
                    // 和 Restore 一样，行内 Delete 确认框打开前也要先收起顶部确认框，
                    // 保持整个 dialog 同一时间只存在一个确认浮层。
                    setIsDeleteHistoryPopoverOpen(false);
                    // 统一由 activeRowPopover 记录当前打开的行内确认框。
                    setActiveRowPopover({
                      versionId: entry.id,
                      action: "deleteVersion",
                    });
                    return;
                  }

                  if (isDeletePopoverOpen) {
                    // 清空后重新 render，这一行的受控 open 会回到 false。
                    setActiveRowPopover(null);
                  }
                }}
                message="Are you sure you want to delete this version?"
                loadingLabel="Deleting"
                isPending={isActionPending && pendingAction === "deleteVersion"}
                onConfirm={() => onDelete(entry)}
                disabled={isDisabled || isCurrentVersion}
              />
            </div>
          );
        },
      }),
    ],
    [
      activeRowPopover,
      currentVersionId,
      isActionPending,
      isLoading,
      onDelete,
      onDownload,
      onRestore,
      pendingAction,
      styles.actionGroup,
      styles.actionIconButton,
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
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          {/* 标题区保持和 Preview 一致：左侧标题，右侧提供显式关闭入口。 */}
          <div className={styles.titleRow}>
            <DialogTitle>Versions</DialogTitle>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onClose}
              aria-label="Close versions"
            />
          </div>
          <DialogContent className={styles.content}>
            {/* 顶部区域改为从左到右排列：先放批量动作入口，再放读取状态。 */}
            <div className={styles.headerRow}>
              <div className={styles.headerActions}>
                {/* 删除全部历史版本是高风险动作，因此先经过一次轻量确认。 */}
                <ActionConfirmPopover
                  trigger={
                    <Button
                      size="small"
                      disabled={isLoading || isActionPending}
                    >
                      Delete history versions
                    </Button>
                  }
                  open={isDeleteHistoryPopoverOpen}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) {
                      // 顶部批量删除确认框打开时，反过来清空所有行内确认框。
                      // 这样顶部确认框与任意一行的 Restore/Delete 确认框始终互斥。
                      setActiveRowPopover(null);
                    }
                    // 顶部确认框自己的开关状态单独保存在 isDeleteHistoryPopoverOpen。
                    setIsDeleteHistoryPopoverOpen(nextOpen);
                  }}
                  message="This will delete all history versions except the current version. Are you sure?"
                  loadingLabel="Deleting"
                  isPending={
                    isActionPending && pendingAction === "deleteHistoryVersions"
                  }
                  onConfirm={onDeleteHistoryVersions}
                  disabled={isLoading || isActionPending}
                />
              </div>
              <div className={styles.headerLoading}>
                {isLoading && (
                  <Spinner
                    size="tiny"
                    className={styles.headerLoadingSpinner}
                    label="Loading versions..."
                    labelPosition="after"
                  />
                )}
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
                className={styles.grid}
                resizableColumns
                resizableColumnsOptions={{ autoFitColumns: false }}
                columnSizingOptions={versionColumnSizingOptions}
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
