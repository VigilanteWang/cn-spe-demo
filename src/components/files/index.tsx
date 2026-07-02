import { useCallback, useRef, useState, type ChangeEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Input,
  InputOnChangeData,
  InputProps,
  Label,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import Preview from "../preview";
import { IDriveItemExtended } from "../../common/types";
import { deleteItems } from "../../services/backendApi";
import { useFilesStyles } from "./filesStyles";
import { IFilesProps } from "./filesTypes";
import { toProgressValue } from "./filesUtils";
import { FilesBreadcrumb } from "./components/FilesBreadcrumb";
import { FilesToolbar } from "./components/FilesToolbar";
import { FilesDataGrid } from "./components/FilesDataGrid";
import { FilesProgress } from "./components/FilesProgress";
import { useFilesData } from "./hooks/useFilesData";
import { useFilesNavigation } from "./hooks/useFilesNavigation";
import { useFilesUpload } from "./hooks/useFilesUpload";
import { useFilesArchiveDownload } from "./hooks/useFilesArchiveDownload";
import { Providers } from "@microsoft/mgt-element";
import { ItemPermissionDialog } from "../permissions";
import {
  formatAppErrorMessageForUI,
  type AppError,
} from "../../../common/appError";
import type { IItemVersionEntryForUI } from "../../../common/contracts/itemVersionContracts";
import {
  deleteItemHistoryVersions,
  deleteItemVersion,
  getCurrentItemVersion,
  getItemVersionDownload,
  listItemVersions,
  restoreItemVersion,
} from "../../services/itemVersionApi";
import {
  buildDeletePartialFailureError,
  normalizeFilesOperationError,
} from "./services/filesErrors";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";

/**
 * 文件管理组件模块。
 *
 * 本模块负责：
 * 1. 展示选中容器内的文件和文件夹列表（DataGrid 表格）
 * 2. 支持文件/文件夹的上传（单文件、多文件、整个文件夹）
 * 3. 支持文件下载（单文件直链下载、多文件/文件夹 ZIP 归档下载）
 * 4. 支持文件/文件夹的删除（批量删除）
 * 5. 支持创建新文件夹
 * 6. 支持文件夹导航（面包屑导航 + 返回上级）
 * 7. 支持文件预览（通过 <Preview /> 子组件）。
 *
 * 组件结构：
 *   <div>
 *     <input type="file" hidden />       ← 隐藏的文件上传和文件夹上传输入框
 *     <a hidden />                       ← 隐藏的下载链接（用于单文件下载）
 *     <FilesBreadcrumb />                ← 面包屑导航
 *     <FilesToolbar />                   ← 工具栏（返回、新建文件夹、上传、下载、删除）
 *     <FilesProgress />                  ← 上传与下载进度提示
 *     <Dialog newFolder />               ← 新建文件夹对话框
 *     <Dialog delete />                  ← 确认删除对话框
 *     <FilesDataGrid />                  ← 文件列表表格（支持多选）
 *     <Preview />                        ← 文件预览对话框
 *   </div>
 *
 * Graph API 调用（前端直接调用，不经后端）：
 * - GET  /drives/{driveId}/items/{itemId}/children  → 列出文件夹内容
 * - POST /drives/{driveId}/items/{itemId}/children  → 创建子文件夹
 * - PUT  /drives/{driveId}/items/{itemId}:/{name}:/content  → 上传文件
 *
 * 后端 API 调用（通过 backendApi 模块）：
 * - deleteItems()            → 批量删除文件
 * - startDownload()          → 启动 ZIP 下载准备任务
 * - getDownloadProgress()    → 轮询归档准备进度
 * - getDownloadManifest()    → 获取归档清单
 *
 * 前端归档模块调用（通过 archiveDownloader 模块）：
 * - downloadArchiveFromManifest() → 前端流式下载并压缩
 */

/**
 * Files 文件管理组件。
 * @param props 组件属性。
 * @returns 文件管理页面。
 */
export const Files = ({
  container,
  onOpenContainerPermissions,
}: IFilesProps) => {
  // =============== 页面级编排状态 ===============
  const styles = useFilesStyles();
  // useRef 主要用于在多次 render 之间存储一个可变且持久的引用，而不会触发组件 re-render；
  // 它既可以引用 DOM 元素，也可以引用任何普通的 JavaScript 变量。
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newFolderError, setNewFolderError] = useState<AppError | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<AppError | null>(
    null,
  );
  const [previewActionError, setPreviewActionError] = useState<AppError | null>(
    null,
  );
  const [itemPermissionDialogOpen, setItemPermissionDialogOpen] =
    useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionDialogEntries, setVersionDialogEntries] = useState<
    IItemVersionEntryForUI[]
  >([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [versionDialogLoading, setVersionDialogLoading] = useState(false);
  const [versionDialogActionPending, setVersionDialogActionPending] =
    useState(false);
  const [versionDialogError, setVersionDialogError] = useState<AppError | null>(
    null,
  );
  const [currentPreviewFile, setCurrentPreviewFile] =
    useState<IDriveItemExtended | null>(null);
  const [currentItemPermissionItem, setCurrentItemPermissionItem] =
    useState<IDriveItemExtended | null>(null);
  const [currentVersionItem, setCurrentVersionItem] =
    useState<IDriveItemExtended | null>(null);

  const {
    driveItems,
    selectedRows,
    currentFolderId,
    loadError,
    loadItems,
    onSelectionChange,
    clearSelection,
    updateSelectedRows,
  } = useFilesData({
    containerId: container.id,
  });

  const {
    folderId,
    breadcrumbPath,
    navigateToFolder,
    navigateToParentFolder,
    onBreadcrumbClick,
  } = useFilesNavigation({
    loadItems,
    clearSelection,
  });

  const reloadCurrentFolder = useCallback(async () => {
    return loadItems(folderId || "root");
  }, [folderId, loadItems]);

  const {
    uploadFileRef,
    uploadFolderRef,
    uploadProgress,
    onUploadFileClick,
    onUploadFolderClick,
    onUploadFileSelected,
    onUploadFolderSelected,
  } = useFilesUpload({
    containerId: container.id,
    currentFolderId,
    reloadCurrentFolder,
  });

  /**
   * 使用隐藏链接触发单文件直链下载。
   * @param downloadUrl Graph 返回的下载地址。
   */
  const onDownloadItemClick = useCallback((downloadUrl: string) => {
    const link = downloadLinkRef.current;

    if (!link) {
      return;
    }

    link.href = downloadUrl;
    link.click();
  }, []);

  const {
    downloadProgress,
    onAbortClick,
    onDismissClick,
    onToolbarDownloadClick,
    getArchiveProgressBarValue,
    getArchiveProgressPercentText,
    getArchiveProgressText,
  } = useFilesArchiveDownload({
    containerId: container.id,
    driveItems,
    selectedRows,
    onDirectDownload: onDownloadItemClick,
  });

  /**
   * 打开删除确认框。
   */
  const onToolbarDeleteClick = useCallback(() => {
    if (selectedRows.size === 0) {
      return;
    }

    setDeleteDialogError(null);
    setDeleteDialogOpen(true);
  }, [selectedRows.size]);

  /**
   * 处理批量删除。
   *
   * 流程：
   * 1. 收集当前选中项 ID。
   * 2. 在异步删除前快照当前文件夹 ID，避免删除过程中用户导航导致刷新到错误目录。
   * 3. 调用后端删除接口并记录失败项日志。
   * 4. 删除完成后刷新快照目录，关闭对话框并清空选择状态。
   */
  const onDeleteItemClick = useCallback(async () => {
    const selectedIds = Array.from(selectedRows) as string[];

    if (selectedIds.length === 0) {
      return;
    }

    const folderIdSnapshot = folderId || "root";

    try {
      const result = await deleteItems(container.id, selectedIds);

      if (result.failed.length > 0) {
        const partialDeleteError = buildDeletePartialFailureError(
          result.failed,
        );
        console.warn("Some items failed to delete:", partialDeleteError);
        setDeleteDialogError(partialDeleteError);
        updateSelectedRows(new Set(result.failed.map((item) => item.id)));
        await loadItems(folderIdSnapshot);
        return;
      }

      await loadItems(folderIdSnapshot);
      setDeleteDialogOpen(false);
      setDeleteDialogError(null);
      // 新引用来更新 State，确保组件重新 render。
      updateSelectedRows(new Set());
    } catch (error: unknown) {
      const deleteError = normalizeFilesOperationError(error, {
        code: "deleteItemsFailed",
        fallbackMessage: "Failed to delete selected items.",
        name: "FilesDeleteError",
        context: { itemIds: selectedIds },
      });
      console.error("Delete failed:", deleteError);
      setDeleteDialogError(deleteError);
    }
  }, [container.id, folderId, loadItems, selectedRows, updateSelectedRows]);

  /**
   * 创建新文件夹。
   * 在当前目录下创建子文件夹，使用 conflictBehavior: "rename" 避免重名冲突。
   */
  const onFolderCreateClick = useCallback(async () => {
    setCreatingFolder(true);
    setNewFolderError(null);

    try {
      const graphClient = Providers.globalProvider.graph.client;
      const endpoint = `/drives/${container.id}/items/${folderId}/children`;
      // 调用 Graph API 在当前目录下创建子文件夹。
      await graphClient.api(endpoint).post({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      });

      await loadItems(folderId);
      setFolderName("");
      setNewFolderDialogOpen(false);
    } catch (error: unknown) {
      const createFolderError = normalizeFilesOperationError(error, {
        code: "createFolderFailed",
        fallbackMessage: "Failed to create folder.",
        name: "FilesCreateFolderError",
        context: { folderId, folderName },
      });
      console.error("Create folder failed:", createFolderError);
      setNewFolderError(createFolderError);
    } finally {
      setCreatingFolder(false);
    }
  }, [container.id, folderId, folderName, loadItems]);

  /**
   * 同步新文件夹名称输入框。
   * @param _event 输入事件。
   * @param data 输入数据。
   */
  const onHandleFolderNameChange: InputProps["onChange"] = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
      if (newFolderError) {
        setNewFolderError(null);
      }
      setFolderName(data.value);
    },
    [newFolderError],
  );

  /**
   * 处理预览中的文件切换。
   * @param file 目标文件。
   */
  const handlePreviewNavigate = useCallback((file: IDriveItemExtended) => {
    setPreviewActionError(null);
    setCurrentPreviewFile(file);
  }, []);

  /**
   * 处理预览中的下载动作。
   * @param downloadUrl 下载地址。
   */
  const handlePreviewDownload = useCallback(
    (downloadUrl: string) => {
      onDownloadItemClick(downloadUrl);
    },
    [onDownloadItemClick],
  );

  /**
   * 处理预览中的删除动作。
   * 删除完成后刷新文件列表，使 UI 保持同步。
   */
  const handlePreviewDelete = useCallback(async () => {
    if (!currentPreviewFile?.id) {
      return;
    }

    // 在异步删除前快照当前目录，避免删除过程中导航导致刷新目录漂移。
    const folderIdSnapshot = folderId || "root";

    try {
      const result = await deleteItems(container.id, [currentPreviewFile.id]);

      if (result.failed.length > 0) {
        const previewDeleteError = buildDeletePartialFailureError(
          result.failed,
        );
        console.warn("Preview delete failed:", previewDeleteError);
        setPreviewActionError(previewDeleteError);
        return;
      }

      await loadItems(folderIdSnapshot);
      setPreviewActionError(null);
      setPreviewOpen(false);
    } catch (error: unknown) {
      const previewDeleteError = normalizeFilesOperationError(error, {
        code: "previewDeleteFailed",
        fallbackMessage: "Failed to delete the current file.",
        name: "FilesPreviewDeleteError",
        context: { itemId: currentPreviewFile.id },
      });
      console.error("Preview delete failed:", previewDeleteError);
      setPreviewActionError(previewDeleteError);
    }
  }, [container.id, currentPreviewFile?.id, folderId, loadItems]);

  /**
   * 打开文件预览。
   * @param file 目标文件。
   */
  const handlePreviewOpen = useCallback((file: IDriveItemExtended) => {
    setPreviewActionError(null);
    setCurrentPreviewFile(file);
    setPreviewOpen(true);
  }, []);

  /**
   * 打开当前行 item 的权限管理对话框。
   */
  const handleManageItemPermissions = useCallback(
    (item: IDriveItemExtended) => {
      setCurrentItemPermissionItem(item);
      setItemPermissionDialogOpen(true);
    },
    [],
  );

  /**
   * 关闭 item 权限管理对话框，并清理当前 item 上下文。
   */
  const handleCloseItemPermissionDialog = useCallback(() => {
    setItemPermissionDialogOpen(false);
    setCurrentItemPermissionItem(null);
  }, []);

  /**
   * 统一读取 Versions Dialog 依赖的 list + current 数据。
   *
   * @param item 当前正在查看版本历史的文件。
   * @param resetBeforeLoad 是否在读取前清空旧数据。
   */
  const loadVersionDialogData = useCallback(
    async (
      item: IDriveItemExtended,
      options: { resetBeforeLoad?: boolean } = {},
    ) => {
      if (options.resetBeforeLoad) {
        setVersionDialogEntries([]);
        setCurrentVersionId(null);
      }

      setVersionDialogLoading(true);
      setVersionDialogError(null);

      try {
        const [entries, currentEntry] = await Promise.all([
          listItemVersions(container.id, item.id as string),
          getCurrentItemVersion(container.id, item.id as string),
        ]);

        setVersionDialogEntries(entries);
        setCurrentVersionId(currentEntry.id);
      } catch (error: unknown) {
        const loadVersionsError = normalizeFilesOperationError(error, {
          code: "loadVersionsFailed",
          fallbackMessage: "Failed to load versions.",
          name: "FilesVersionLoadError",
          context: {
            containerId: container.id,
            itemId: item.id,
          },
        });
        console.error("Load versions failed:", loadVersionsError);
        setVersionDialogError(loadVersionsError);
      } finally {
        setVersionDialogLoading(false);
      }
    },
    [container.id],
  );

  /**
   * 打开版本历史弹窗，并主动读取列表与当前版本元数据。
   */
  const handleManageVersions = useCallback(
    (item: IDriveItemExtended) => {
      setCurrentVersionItem(item);
      setVersionDialogOpen(true);
      void loadVersionDialogData(item, { resetBeforeLoad: true });
    },
    [loadVersionDialogData],
  );

  /**
   * 关闭版本历史弹窗，并清理当前文件上下文。
   */
  const handleCloseVersionDialog = useCallback(() => {
    setVersionDialogOpen(false);
    setCurrentVersionItem(null);
    setVersionDialogEntries([]);
    setCurrentVersionId(null);
    setVersionDialogLoading(false);
    setVersionDialogActionPending(false);
    setVersionDialogError(null);
  }, []);

  /**
   * 执行版本写操作，并在成功后统一重读 list + current。
   *
   * @param action 写操作实现。
   * @param fallbackMessage 兜底错误文案。
   * @param code 稳定错误码。
   */
  const runVersionWriteAction = useCallback(
    async (
      action: () => Promise<void>,
      fallbackMessage: string,
      code: string,
    ) => {
      if (!currentVersionItem?.id) {
        return;
      }

      setVersionDialogActionPending(true);
      setVersionDialogError(null);

      try {
        await action();
        await loadVersionDialogData(currentVersionItem);
      } catch (error: unknown) {
        const versionActionError = normalizeFilesOperationError(error, {
          code,
          fallbackMessage,
          name: "FilesVersionActionError",
          context: {
            containerId: container.id,
            itemId: currentVersionItem.id,
          },
        });
        console.error("Version action failed:", versionActionError);
        setVersionDialogError(versionActionError);
      } finally {
        setVersionDialogActionPending(false);
      }
    },
    [container.id, currentVersionItem, loadVersionDialogData],
  );

  /**
   * 下载指定版本。
   *
   * 这里沿用页面已有的隐藏 `<a>` 直链下载模式。
   *
   * @param entry 目标版本条目。
   */
  const handleVersionDownload = useCallback(
    async (entry: IItemVersionEntryForUI) => {
      if (!currentVersionItem?.id) {
        return;
      }

      setVersionDialogError(null);

      try {
        const downloadUrl = await getItemVersionDownload(
          container.id,
          currentVersionItem.id,
          entry.id,
        );
        onDownloadItemClick(downloadUrl);
      } catch (error: unknown) {
        const downloadVersionError = normalizeFilesOperationError(error, {
          code: "downloadVersionFailed",
          fallbackMessage: "Failed to download the selected version.",
          name: "FilesVersionDownloadError",
          context: {
            containerId: container.id,
            itemId: currentVersionItem.id,
            versionId: entry.id,
          },
        });
        console.error("Version download failed:", downloadVersionError);
        setVersionDialogError(downloadVersionError);
      }
    },
    [container.id, currentVersionItem, onDownloadItemClick],
  );

  /**
   * 恢复指定历史版本。
   *
   * @param entry 目标版本条目。
   */
  const handleVersionRestore = useCallback(
    async (entry: IItemVersionEntryForUI) => {
      await runVersionWriteAction(
        () =>
          restoreItemVersion(
            container.id,
            currentVersionItem?.id as string,
            entry.id,
          ),
        "Failed to restore the selected version.",
        "restoreVersionFailed",
      );
    },
    [container.id, currentVersionItem?.id, runVersionWriteAction],
  );

  /**
   * 删除指定历史版本。
   *
   * @param entry 目标版本条目。
   */
  const handleVersionDelete = useCallback(
    async (entry: IItemVersionEntryForUI) => {
      await runVersionWriteAction(
        () =>
          deleteItemVersion(
            container.id,
            currentVersionItem?.id as string,
            entry.id,
          ),
        "Failed to delete the selected version.",
        "deleteVersionFailed",
      );
    },
    [container.id, currentVersionItem?.id, runVersionWriteAction],
  );

  /**
   * 删除除当前版本外的所有历史版本。
   */
  const handleDeleteHistoryVersions = useCallback(async () => {
    await runVersionWriteAction(
      () =>
        deleteItemHistoryVersions(
          container.id,
          currentVersionItem?.id as string,
        ),
      "Failed to delete history versions.",
      "deleteHistoryVersionsFailed",
    );
  }, [container.id, currentVersionItem?.id, runVersionWriteAction]);

  const previewableFiles = driveItems.filter((item) => !item.isFolder);

  return (
    <div className={styles.filesContainer}>
      {/*
        隐藏的文件上传 input：点击工具栏按钮后，通过 ref 主动触发文件选择框。
      */}
      <input
        ref={uploadFileRef}
        type="file"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void onUploadFileSelected(event)
        }
        style={{ display: "none" }}
      />
      {/*
        隐藏的文件夹上传 input：使用 webkitdirectory 属性允许选择整个文件夹。
        该属性已在 src/global.d.ts 中通过声明合并扩展 InputHTMLAttributes，
        因此可直接使用而无需 as any 绕过类型检查。
      */}
      <input
        ref={uploadFolderRef}
        type="file"
        webkitdirectory=""
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          void onUploadFolderSelected(event)
        }
        style={{ display: "none" }}
      />
      {/*
        隐藏的下载 <a> ：单文件直链下载时，由 onDownloadItemClick 动态设置 href
        后触发此元素的 click()，浏览器会按 attachment 语义处理文件下载。
      */}
      <a
        ref={downloadLinkRef}
        href="#"
        target="_blank"
        style={{ display: "none" }}
        aria-label="Download link"
      >
        Download
      </a>

      {/*
        面包屑导航：显示当前文件夹层级路径（如 Root > FolderA > FolderB）。
      */}
      <div className={styles.breadcrumbContainer}>
        <FilesBreadcrumb
          breadcrumbPath={breadcrumbPath}
          onBreadcrumbClick={onBreadcrumbClick}
        />
      </div>

      {/*
        操作工具栏：包含文件夹导航和文件操作按钮。
      */}
      <div className={styles.toolbarContainer}>
        <FilesToolbar
          canGoBack={breadcrumbPath.length > 1}
          hasSelection={selectedRows.size > 0}
          isDownloadActive={downloadProgress.isActive}
          onBack={navigateToParentFolder}
          onCreateFolder={() => {
            setNewFolderError(null);
            setNewFolderDialogOpen(true);
          }}
          onUploadFile={onUploadFileClick}
          onUploadFolder={onUploadFolderClick}
          onDownload={onToolbarDownloadClick}
          onDelete={onToolbarDeleteClick}
        />
      </div>

      {/*
        上传与下载进度区域：
        - 上传中展示文件级进度与成功/失败统计
        - ZIP 下载时展示后端准备进度和前端压缩进度
      */}
      <FilesProgress
        uploadProgress={uploadProgress}
        pageError={loadError}
        downloadProgress={downloadProgress}
        progressContainerClassName={styles.progressContainer}
        progressBarClassName={styles.progressBar}
        progressTextClassName={styles.progressText}
        progressCompletedClassName={styles.progressCompleted}
        progressStatusRowClassName={styles.progressStatusRow}
        progressStatusTextClassName={styles.progressStatusText}
        progressStatusRightClassName={styles.progressStatusRight}
        progressPercentClassName={styles.progressPercent}
        toProgressValue={toProgressValue}
        getArchiveProgressBarValue={getArchiveProgressBarValue}
        getArchiveProgressText={getArchiveProgressText}
        getArchiveProgressPercentText={getArchiveProgressPercentText}
        onAbortClick={onAbortClick}
        onDismissClick={onDismissClick}
      />

      {/*
        新建文件夹对话框：由工具栏 "New Folder" 按钮触发。
        - 输入框绑定 folderName 状态，空字符串时禁用确认按钮
        - 点击 "Create Folder" 调用 onFolderCreateClick，期间显示 Spinner 并禁用所有按钮
        - 创建完成后自动关闭对话框并刷新当前文件夹列表
      */}
      <Dialog open={newFolderDialogOpen}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Label htmlFor="new-folder-name">Folder name:</Label>
              <Input
                id="new-folder-name"
                className={styles.dialogInputControl}
                autoFocus
                required
                value={folderName}
                onChange={onHandleFolderNameChange}
              />
              {/* 创建中显示 Spinner 阻止用户重复提交 */}
              {creatingFolder && (
                <Spinner
                  size="medium"
                  label="Creating folder..."
                  labelPosition="after"
                />
              )}
              {newFolderError && (
                <Text
                  role="alert"
                  style={{ color: tokens.colorPaletteRedForeground1 }}
                >
                  {formatAppErrorMessageForUI(
                    newFolderError,
                    "Failed to create folder.",
                  )}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button
                  appearance="secondary"
                  onClick={() => {
                    setNewFolderDialogOpen(false);
                    setNewFolderError(null);
                  }}
                  disabled={creatingFolder}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              {/* folderName 为空或正在创建时禁用，避免提交空名称或重复请求 */}
              <Button
                appearance="primary"
                onClick={() => void onFolderCreateClick()}
                disabled={creatingFolder || folderName === ""}
              >
                Create Folder
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/*
        确认删除对话框：由工具栏 "Delete" 按钮触发。
        - 标题和正文根据 selectedRows.size 动态展示单/多项措辞
        - 点击 "Delete" 调用 onDeleteItemClick（批量删除 → 刷新列表 → 关闭对话框）
      */}
      <Dialog
        open={deleteDialogOpen}
        modalType="modal"
        onOpenChange={() => {
          setDeleteDialogOpen(false);
          setDeleteDialogError(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            {/* 动态标题：单项显示 "Delete Item"，多项显示 "Delete N items" */}
            <DialogTitle>
              Delete{" "}
              {selectedRows.size > 1 ? `${selectedRows.size} items` : "Item"}
            </DialogTitle>
            <DialogContent>
              <p>
                Are you sure you want to delete{" "}
                {selectedRows.size > 1
                  ? `these ${selectedRows.size} items`
                  : "this item"}
                ?
              </p>
              {deleteDialogError && (
                <Text
                  role="alert"
                  style={{ color: tokens.colorPaletteRedForeground1 }}
                >
                  {formatAppErrorMessageForUI(
                    deleteDialogError,
                    "Failed to delete selected items.",
                  )}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger>
                <Button
                  appearance="secondary"
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeleteDialogError(null);
                  }}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={() => void onDeleteItemClick()}
              >
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/*
        文件列表 DataGrid：展示当前文件夹内所有文件和子文件夹。
        - items: 当前文件夹的 DriveItem 列表（IDriveItemExtended）
        - selectionMode="multiselect": 支持多选，选中集合存入 selectedRows
      */}
      {/* DataGrid 独立滚动区：仅表格横向溢出时滚动，不影响页面其他部分 */}
      <div className={styles.dataGridWrapper}>
        <FilesDataGrid
          driveItems={driveItems}
          selectedRows={selectedRows}
          onSelectionChange={onSelectionChange}
          onOpenFolder={navigateToFolder}
          onPreviewFile={handlePreviewOpen}
          onManagePermissions={handleManageItemPermissions}
          onManageVersions={handleManageVersions}
          actionsButtonGroupClassName={styles.actionsButtonGroup}
          nameCellContentClassName={styles.nameCellContent}
        />
      </div>

      <VersionHistoryDialog
        open={versionDialogOpen}
        versions={versionDialogEntries}
        currentVersionId={currentVersionId}
        isLoading={versionDialogLoading}
        isActionPending={versionDialogActionPending}
        error={versionDialogError}
        onClose={handleCloseVersionDialog}
        onDownload={(entry) => void handleVersionDownload(entry)}
        onRestore={(entry) => void handleVersionRestore(entry)}
        onDelete={(entry) => void handleVersionDelete(entry)}
        onDeleteHistoryVersions={() => void handleDeleteHistoryVersions()}
      />

      <ItemPermissionDialog
        open={itemPermissionDialogOpen}
        driveId={container.id}
        itemId={currentItemPermissionItem?.id ?? undefined}
        itemName={currentItemPermissionItem?.name ?? undefined}
        isFolder={currentItemPermissionItem?.isFolder ?? undefined}
        mimeType={currentItemPermissionItem?.file?.mimeType ?? undefined}
        fileName={currentItemPermissionItem?.name ?? undefined}
        onClose={handleCloseItemPermissionDialog}
        onManageContainerPermission={onOpenContainerPermissions}
      />

      {/*
        文件预览对话框（全屏）：点击文件名时打开。
        - currentFile: 当前预览文件
        - allFiles: 仅包含非文件夹文件，用于前/后导航
        - onDownload: 调用隐藏 <a> 标签触发直链下载
        - onDelete: 删除当前文件并刷新列表后关闭对话框
      */}
      <Preview
        isOpen={previewOpen}
        onDismiss={() => {
          setPreviewActionError(null);
          setPreviewOpen(false);
        }}
        currentFile={currentPreviewFile}
        allFiles={previewableFiles}
        onNavigate={handlePreviewNavigate}
        onDownload={handlePreviewDownload}
        onDelete={() => void handlePreviewDelete()}
        containerId={container.id}
        actionError={previewActionError}
      />
    </div>
  );
};

export default Files;
