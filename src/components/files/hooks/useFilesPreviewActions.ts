import { useCallback, useState } from "react";
import type { AppError } from "../../../../common/appError";
import type { IDriveItemExtended } from "../../../common/types";
import { deleteItems } from "../../../services/containerAndFileApi";
import {
  buildDeletePartialFailureError,
  normalizeFilesOperationError,
} from "../services/filesErrors";

interface IUseFilesPreviewActionsOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 当前预览中的文件。 */
  currentPreviewFile: IDriveItemExtended | null;
  /** 当前目录 ID。 */
  folderId: string;
  /** 刷新目录内容。 */
  loadItems: (folderId?: string) => Promise<boolean>;
  /** 删除成功后的页面级收尾动作。 */
  onDeleteSuccess: () => void;
}

/**
 * 管理预览弹窗中的副作用动作。
 *
 * 当前只承接“删除当前文件”，避免页面组件同时维护浏览状态与删除状态机。
 *
 * @param options Hook 初始化参数。
 * @returns 预览动作状态与操作。
 */
export const useFilesPreviewActions = ({
  containerId,
  currentPreviewFile,
  folderId,
  loadItems,
  onDeleteSuccess,
}: IUseFilesPreviewActionsOptions) => {
  const [previewActionError, setPreviewActionError] = useState<AppError | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * 清空预览动作错误。
   */
  const clearPreviewActionError = useCallback(() => {
    setPreviewActionError(null);
  }, []);

  /**
   * 删除当前预览文件。
   */
  const deletePreviewItem = useCallback(async () => {
    // 预览里如果还没有稳定的文件目标，就不发删除请求，避免出现空 ID 调用。
    if (!currentPreviewFile?.id) {
      return false;
    }

    // 删除期间即使页面目录状态变化，也要按本次操作开始时的目录重新刷新列表。
    const folderIdSnapshot = folderId || "root";
    setIsDeleting(true);

    try {
      const result = await deleteItems(containerId, [currentPreviewFile.id]);

      // 虽然这里只删一个文件，但后端仍可能用统一的“部分失败”结构返回结果。
      if (result.failed.length > 0) {
        const previewDeleteError = buildDeletePartialFailureError(
          result.failed,
        );
        console.warn("Preview delete failed:", previewDeleteError);
        setPreviewActionError(previewDeleteError);
        return false;
      }

      // 删除成功后刷新当前目录，再通知页面层执行关闭预览等收尾动作。
      await loadItems(folderIdSnapshot);
      setPreviewActionError(null);
      onDeleteSuccess();
      return true;
    } catch (error: unknown) {
      // 将请求异常统一归一化，保证预览弹窗拿到的是可稳定展示的错误对象。
      const previewDeleteError = normalizeFilesOperationError(error, {
        code: "previewDeleteFailed",
        fallbackMessage: "Failed to delete the current file.",
        name: "FilesPreviewDeleteError",
        context: { itemId: currentPreviewFile.id },
      });
      console.error("Preview delete failed:", previewDeleteError);
      setPreviewActionError(previewDeleteError);
      return false;
    } finally {
      // 不论成功或失败，都要把删除中的状态收回，避免按钮一直卡在 loading。
      setIsDeleting(false);
    }
  }, [containerId, currentPreviewFile, folderId, loadItems, onDeleteSuccess]);

  return {
    previewActionError,
    isDeleting,
    deletePreviewItem,
    clearPreviewActionError,
  };
};
