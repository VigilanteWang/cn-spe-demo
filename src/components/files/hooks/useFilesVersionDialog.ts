import { useCallback, useState } from "react";
import type { AppError } from "../../../../common/appError";
import type { IItemVersionEntryForUI } from "../../../../common/contracts/itemVersionContracts";
import type { IDriveItemExtended } from "../../../common/types";
import type { VersionDialogPendingAction } from "../filesTypes";
import {
  deleteItemHistoryVersions,
  deleteItemVersion,
  getCurrentItemVersion,
  getItemVersionDownload,
  listItemVersions,
  restoreItemVersion,
} from "../../../services/itemVersionApi";
import { normalizeFilesOperationError } from "../services/filesErrors";

interface IUseFilesVersionDialogOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 单文件直链下载函数。 */
  onDirectDownload: (downloadUrl: string) => void;
}

/**
 * 管理版本历史弹窗的完整状态机。
 *
 * @param options Hook 初始化参数。
 * @returns 版本弹窗状态与用户动作。
 */
export const useFilesVersionDialog = ({
  containerId,
  onDirectDownload,
}: IUseFilesVersionDialogOptions) => {
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [currentVersionItem, setCurrentVersionItem] =
    useState<IDriveItemExtended | null>(null);
  const [versionDialogEntries, setVersionDialogEntries] = useState<
    IItemVersionEntryForUI[]
  >([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [versionDialogLoading, setVersionDialogLoading] = useState(false);
  const [versionDialogActionPending, setVersionDialogActionPending] =
    useState(false);
  const [versionDialogPendingAction, setVersionDialogPendingAction] =
    useState<VersionDialogPendingAction | null>(null);
  const [versionDialogError, setVersionDialogError] = useState<AppError | null>(
    null,
  );

  /**
   * 统一读取版本列表和当前版本元数据。
   *
   * @param item 当前查看的文件。
   * @param options 读取控制项。
   */
  const loadVersionDialogData = useCallback(
    async (
      item: IDriveItemExtended,
      options: { resetBeforeLoad?: boolean } = {},
    ) => {
      // 首次打开新文件时先清空旧列表，避免用户在加载间隙看到上一个文件的版本数据。
      if (options.resetBeforeLoad) {
        setVersionDialogEntries([]);
        setCurrentVersionId(null);
      }

      // 版本列表和“当前版本”标识来自两个独立接口，这里统一并行读取，保证弹窗状态同步更新。
      setVersionDialogLoading(true);
      setVersionDialogError(null);

      try {
        const [entries, currentEntry] = await Promise.all([
          listItemVersions(containerId, item.id as string),
          getCurrentItemVersion(containerId, item.id as string),
        ]);

        setVersionDialogEntries(entries);
        setCurrentVersionId(currentEntry.id);
      } catch (error: unknown) {
        // 读取失败时统一整理成弹窗可直接展示的错误对象，避免组件层理解多种异常来源。
        const loadVersionsError = normalizeFilesOperationError(error, {
          code: "loadVersionsFailed",
          fallbackMessage: "Failed to load versions.",
          name: "FilesVersionLoadError",
          context: {
            containerId,
            itemId: item.id,
          },
        });
        console.error("Load versions failed:", loadVersionsError);
        setVersionDialogError(loadVersionsError);
      } finally {
        setVersionDialogLoading(false);
      }
    },
    [containerId],
  );

  /**
   * 执行版本写操作，并在成功后重读版本数据。
   *
   * @param action 具体写操作。
   * @param fallbackMessage 兜底错误文案。
   * @param code 稳定错误码。
   * @returns 是否执行成功。
   */
  const runVersionWriteAction = useCallback(
    async (
      action: () => Promise<void>,
      fallbackMessage: string,
      code: string,
      actionType: VersionDialogPendingAction,
    ) => {
      // 弹窗没有绑定到具体文件时，不允许继续执行版本写操作。
      if (!currentVersionItem?.id) {
        return false;
      }

      // 恢复、删除单版本、删除历史版本都共用这一套 pending 与错误处理状态机。
      setVersionDialogActionPending(true);
      setVersionDialogPendingAction(actionType);
      setVersionDialogError(null);

      try {
        await action();
        // 写操作成功后重新读取版本数据，让“当前版本”和列表内容一起回到后端真实状态。
        await loadVersionDialogData(currentVersionItem);
        return true;
      } catch (error: unknown) {
        // 不同版本写操作只传入不同的错误码和兜底文案，其余归一化逻辑统一复用。
        const versionActionError = normalizeFilesOperationError(error, {
          code,
          fallbackMessage,
          name: "FilesVersionActionError",
          context: {
            containerId,
            itemId: currentVersionItem.id,
          },
        });
        console.error("Version action failed:", versionActionError);
        setVersionDialogError(versionActionError);
        return false;
      } finally {
        setVersionDialogActionPending(false);
        setVersionDialogPendingAction(null);
      }
    },
    [containerId, currentVersionItem, loadVersionDialogData],
  );

  /**
   * 打开版本历史弹窗并加载数据。
   * @param item 当前文件。
   */
  const openVersionDialog = useCallback(
    (item: IDriveItemExtended) => {
      // 先记录当前上下文文件，再打开弹窗并开始加载，后续所有版本动作都依赖这个文件 ID。
      setCurrentVersionItem(item);
      setVersionDialogOpen(true);
      void loadVersionDialogData(item, { resetBeforeLoad: true });
    },
    [loadVersionDialogData],
  );

  /**
   * 关闭版本历史弹窗并清理上下文。
   */
  const closeVersionDialog = useCallback(() => {
    // 关闭时把列表、当前版本和错误全部重置，避免下次打开时闪出旧状态。
    setVersionDialogOpen(false);
    setCurrentVersionItem(null);
    setVersionDialogEntries([]);
    setCurrentVersionId(null);
    setVersionDialogLoading(false);
    setVersionDialogActionPending(false);
    setVersionDialogPendingAction(null);
    setVersionDialogError(null);
  }, []);

  /**
   * 下载指定版本。
   * @param entry 目标版本。
   * @returns 是否执行成功。
   */
  const downloadVersion = useCallback(
    async (entry: IItemVersionEntryForUI) => {
      // 没有当前文件上下文时，无法定位版本所属 item，自然也不能下载。
      if (!currentVersionItem?.id) {
        return false;
      }

      // 下载动作不会重载列表，但仍应清空旧错误，让用户看到的是本次下载结果。
      setVersionDialogError(null);

      try {
        const downloadUrl = await getItemVersionDownload(
          containerId,
          currentVersionItem.id,
          entry.id,
        );
        // 这里仍复用页面层的直链下载入口，避免 hook 自己耦合浏览器下载实现。
        onDirectDownload(downloadUrl);
        return true;
      } catch (error: unknown) {
        // 下载失败也统一归一化，和读取/写操作共用一致的错误展示协议。
        const downloadVersionError = normalizeFilesOperationError(error, {
          code: "downloadVersionFailed",
          fallbackMessage: "Failed to download the selected version.",
          name: "FilesVersionDownloadError",
          context: {
            containerId,
            itemId: currentVersionItem.id,
            versionId: entry.id,
          },
        });
        console.error("Version download failed:", downloadVersionError);
        setVersionDialogError(downloadVersionError);
        return false;
      }
    },
    [containerId, currentVersionItem, onDirectDownload],
  );

  /**
   * 恢复指定版本。
   * @param entry 目标版本。
   */
  const restoreVersion = useCallback(
    async (entry: IItemVersionEntryForUI) =>
      runVersionWriteAction(
        () =>
          restoreItemVersion(
            containerId,
            currentVersionItem?.id as string,
            entry.id,
          ),
        "Failed to restore the selected version.",
        "restoreVersionFailed",
        "restoreVersion",
      ),
    [containerId, currentVersionItem?.id, runVersionWriteAction],
  );

  /**
   * 删除指定版本。
   * @param entry 目标版本。
   */
  const deleteVersion = useCallback(
    async (entry: IItemVersionEntryForUI) =>
      runVersionWriteAction(
        () =>
          deleteItemVersion(
            containerId,
            currentVersionItem?.id as string,
            entry.id,
          ),
        "Failed to delete the selected version.",
        "deleteVersionFailed",
        "deleteVersion",
      ),
    [containerId, currentVersionItem?.id, runVersionWriteAction],
  );

  /**
   * 删除所有历史版本。
   */
  const deleteHistoryVersions = useCallback(
    async () =>
      runVersionWriteAction(
        () =>
          deleteItemHistoryVersions(
            containerId,
            currentVersionItem?.id as string,
          ),
        "Failed to delete history versions.",
        "deleteHistoryVersionsFailed",
        "deleteHistoryVersions",
      ),
    [containerId, currentVersionItem?.id, runVersionWriteAction],
  );

  return {
    versionDialogOpen,
    versionDialogEntries,
    currentVersionId,
    versionDialogLoading,
    versionDialogActionPending,
    versionDialogPendingAction,
    versionDialogError,
    openVersionDialog,
    closeVersionDialog,
    downloadVersion,
    restoreVersion,
    deleteVersion,
    deleteHistoryVersions,
  };
};
