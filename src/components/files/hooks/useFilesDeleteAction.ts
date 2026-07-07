import { useCallback, useState } from "react";
import type { SelectionItemId } from "@fluentui/react-components";
import type { AppError } from "../../../../common/appError";
import { deleteItems } from "../../../services/containerAndFileApi";
import {
  buildDeletePartialFailureError,
  normalizeFilesOperationError,
} from "../services/filesErrors";

interface IUseFilesDeleteActionOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 当前选中的行。 */
  selectedRows: Set<SelectionItemId>;
  /** 当前目录 ID。 */
  folderId: string;
  /** 刷新目录内容。 */
  loadItems: (folderId?: string) => Promise<boolean>;
  /** 回写新的选中行集合。 */
  updateSelectedRows: (nextSelectedRows: Set<SelectionItemId>) => void;
}

/**
 * 管理文件列表中的批量删除动作。
 *
 * @param options Hook 初始化参数。
 * @returns 删除流程状态与操作。
 */
export const useFilesDeleteAction = ({
  containerId,
  selectedRows,
  folderId,
  loadItems,
  updateSelectedRows,
}: IUseFilesDeleteActionOptions) => {
  const [deleteDialogError, setDeleteDialogError] = useState<AppError | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 清除删除弹窗中的错误提示。
   */
  const resetDeleteError = useCallback(() => {
    setDeleteDialogError(null);
  }, []);

  /**
   * 删除当前选中的项目。
   *
   * @returns 是否全部删除成功；成功时由页面层负责关闭对话框。
   */
  const deleteSelectedItems = useCallback(async () => {
    const selectedIds = Array.from(selectedRows) as string[];

    // 没有选中项时直接返回，避免发起无意义的删除请求。
    if (selectedIds.length === 0) {
      return false;
    }

    // 删除过程中即使当前目录切换，刷新也应回到本次操作开始时所在的目录。
    const folderIdSnapshot = folderId || "root";
    setIsDeleting(true);

    try {
      const result = await deleteItems(containerId, selectedIds);

      // 如果后端返回“部分删除成功”，则保留失败项的选中状态，方便用户继续处理。
      if (result.failed.length > 0) {
        const partialDeleteError = buildDeletePartialFailureError(
          result.failed,
        );
        console.warn("Some items failed to delete:", partialDeleteError);
        setDeleteDialogError(partialDeleteError);
        updateSelectedRows(new Set(result.failed.map((item) => item.id)));
        await loadItems(folderIdSnapshot);
        return false;
      }

      // 全部删除成功后刷新列表，并清空旧错误与选中状态。
      await loadItems(folderIdSnapshot);
      setDeleteDialogError(null);
      updateSelectedRows(new Set());
      return true;
    } catch (error: unknown) {
      // 将各种来源的异常统一整理成前端可展示的 AppError，便于弹窗稳定显示。
      const deleteError = normalizeFilesOperationError(error, {
        code: "deleteItemsFailed",
        fallbackMessage: "Failed to delete selected items.",
        name: "FilesDeleteError",
        context: { itemIds: selectedIds },
      });
      console.error("Delete failed:", deleteError);
      setDeleteDialogError(deleteError);
      return false;
    } finally {
      // 无论成功、部分失败还是抛错，都要结束删除中的 UI 状态。
      setIsDeleting(false);
    }
  }, [containerId, folderId, loadItems, selectedRows, updateSelectedRows]);

  return {
    deleteDialogError,
    isDeleting,
    deleteSelectedItems,
    resetDeleteError,
  };
};
