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
  Label,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import Preview from "../preview";
import { type IDriveItemExtended } from "../../common/types";
import { useFilesStyles } from "./filesStyles";
import { type IFilesProps } from "./filesTypes";
import { toProgressValue } from "./filesUtils";
import { FilesBreadcrumb } from "./components/FilesBreadcrumb";
import { FilesToolbar } from "./components/FilesToolbar";
import { FilesDataGrid } from "./components/FilesDataGrid";
import { FilesProgress } from "./components/FilesProgress";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";
import { useFilesData } from "./hooks/useFilesData";
import { useFilesNavigation } from "./hooks/useFilesNavigation";
import { useFilesUpload } from "./hooks/useFilesUpload";
import { useFilesArchiveDownload } from "./hooks/useFilesArchiveDownload";
import { useFilesFolderCreation } from "./hooks/useFilesFolderCreation";
import { useFilesDeleteAction } from "./hooks/useFilesDeleteAction";
import { useFilesPreviewActions } from "./hooks/useFilesPreviewActions";
import { useFilesVersionDialog } from "./hooks/useFilesVersionDialog";
import { ItemPermissionDialog } from "../permissions";
import { formatAppErrorMessageForUI } from "../../../common/appError";

/**
 * 文件管理组件模块。
 *
 * 本模块负责：
 * 1. 作为 files 页面入口，串联文件列表、导航、上传、下载、预览、版本历史与权限管理等子能力
 * 2. 维护少量页面级 UI 状态，例如弹窗开关、当前预览文件、当前权限管理目标
 * 3. 把具体业务副作用委托给专门的 hook，自身主要承担页面编排职责
 *
 * 组件结构：
 *   <div>
 *     <input type="file" hidden />       ← 隐藏的文件上传输入框
 *     <input type="file" webkitdirectory hidden /> ← 隐藏的文件夹上传输入框
 *     <a hidden />                       ← 隐藏的单文件下载链接
 *     <FilesBreadcrumb />                ← 当前目录面包屑
 *     <FilesToolbar />                   ← 页面主操作区
 *     <FilesProgress />                  ← 上传/下载进度展示
 *     <Dialog newFolder />               ← 新建文件夹弹窗
 *     <Dialog delete />                  ← 批量删除确认弹窗
 *     <FilesDataGrid />                  ← 文件与文件夹列表
 *     <VersionHistoryDialog />           ← 版本历史弹窗
 *     <ItemPermissionDialog />           ← item 权限管理弹窗
 *     <Preview />                        ← 文件预览弹窗
 *   </div>
 *
 * 引用的 hook：
 * - useFilesData：负责读取当前目录内容，并维护表格选中状态与列表加载错误。
 * - useFilesNavigation：负责当前目录切换、返回上级和面包屑路径维护。
 * - useFilesUpload：负责单文件/文件夹上传流程，以及上传进度状态。
 * - useFilesArchiveDownload：负责单文件外的归档下载流程、轮询与进度展示。
 * - useFilesFolderCreation：负责新建文件夹输入、提交流程与错误状态。
 * - useFilesDeleteAction：负责当前列表的批量删除动作与删除错误状态。
 * - useFilesPreviewActions：负责预览弹窗中的删除动作与相关错误状态。
 * - useFilesVersionDialog：负责版本历史弹窗的数据读取、写操作与状态机。
 */

/**
 * Files 文件管理组件。
 *
 * 页面层主要负责：
 * 1. 串联各个专项 hook
 * 2. 维护少量页面级弹窗开关与当前上下文
 * 3. 组织各展示组件之间的接线
 *
 * @param props 组件属性。
 * @returns 文件管理页面。
 */
export const Files = ({
  container,
  onOpenContainerPermissions,
}: IFilesProps) => {
  // =============== state ===============
  const styles = useFilesStyles();
  // 使用隐藏 `<a>` 复用浏览器原生的直链下载行为。
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  // 这些开关和当前上下文都属于“页面壳层状态”，因为它们只决定哪个弹窗打开、
  // 当前聚焦的是哪一个文件/条目，本身不承载具体业务副作用。
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentPreviewFile, setCurrentPreviewFile] =
    useState<IDriveItemExtended | null>(null);
  const [itemPermissionDialogOpen, setItemPermissionDialogOpen] =
    useState(false);
  const [currentItemPermissionItem, setCurrentItemPermissionItem] =
    useState<IDriveItemExtended | null>(null);

  // =============== hook ===============
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
  // 列表数据与目录导航是分层的：
  // - useFilesData 负责“当前目录里有什么”
  // - useFilesNavigation 负责“当前在哪个目录”
  // 这里把两个 hook 接在一起，让页面层同时拿到内容和位置。

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

  /**
   * 统一刷新当前目录。
   *
   * 这里把“空值目录回退到 root”的细节集中在一个回调里，
   * 供上传、新建文件夹等多个 hook 复用，避免每个 hook 都重复判断一次。
   */
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
  // 上传 hook 需要当前目录 ID，用来决定文件最终写入哪个文件夹；
  // 上传成功后则通过 reloadCurrentFolder 让列表与后端保持同步。

  /**
   * 触发单文件直链下载。
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
    folderName,
    creatingFolder,
    newFolderError,
    onFolderNameChange,
    createFolder,
    resetFolderCreationState,
  } = useFilesFolderCreation({
    containerId: container.id,
    folderId,
    reloadCurrentFolder,
  });
  // 新建文件夹、批量删除、预览删除、版本历史都已经拆到专项 hook 中。
  // 页面层这里只保留接线：把当前容器、目录和成功后的页面收尾动作传给它们。

  const { deleteDialogError, deleteSelectedItems, resetDeleteError } =
    useFilesDeleteAction({
      containerId: container.id,
      selectedRows,
      folderId,
      loadItems,
      updateSelectedRows,
    });

  const { previewActionError, deletePreviewItem, clearPreviewActionError } =
    useFilesPreviewActions({
      containerId: container.id,
      currentPreviewFile,
      folderId,
      loadItems,
      onDeleteSuccess: () => {
        // 预览删除成功后，页面层只负责关闭弹窗和清理临时错误提示。
        clearPreviewActionError();
        setPreviewOpen(false);
      },
    });

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

  const {
    versionDialogOpen,
    versionDialogEntries,
    currentVersionId,
    versionDialogLoading,
    versionDialogActionPending,
    versionDialogError,
    openVersionDialog,
    closeVersionDialog,
    downloadVersion,
    restoreVersion,
    deleteVersion,
    deleteHistoryVersions,
  } = useFilesVersionDialog({
    containerId: container.id,
    onDirectDownload: onDownloadItemClick,
  });

  // =============== handler ===============
  /**
   * 打开删除确认框。
   *
   * 这里只负责打开 UI，不直接执行删除。
   * 真正的删除逻辑已经下沉到 useFilesDeleteAction。
   */
  const onToolbarDeleteClick = useCallback(() => {
    if (selectedRows.size === 0) {
      return;
    }

    resetDeleteError();
    setDeleteDialogOpen(true);
  }, [resetDeleteError, selectedRows.size]);

  /**
   * 处理预览中的文件切换。
   *
   * Preview 内部支持前后浏览文件，这个回调用于在切换目标文件时同步页面层上下文。
   * 每次切换前先清掉旧错误，避免上一个文件的删除失败提示残留到新文件上。
   * @param file 目标文件。
   */
  const handlePreviewNavigate = useCallback(
    (file: IDriveItemExtended) => {
      clearPreviewActionError();
      setCurrentPreviewFile(file);
    },
    [clearPreviewActionError],
  );

  /**
   * 打开文件预览。
   *
   * 打开前同样先清理旧错误，确保每次进入预览时看到的是当前文件的全新状态。
   * @param file 目标文件。
   */
  const handlePreviewOpen = useCallback(
    (file: IDriveItemExtended) => {
      clearPreviewActionError();
      setCurrentPreviewFile(file);
      setPreviewOpen(true);
    },
    [clearPreviewActionError],
  );

  /**
   * 打开当前行 item 的权限管理对话框。
   *
   * 页面层在这里仅保存“当前正在管理哪个 item”，
   * 真正的权限读写仍由 ItemPermissionDialog 内部继续负责。
   * @param item 当前条目。
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

  // Preview 只接受文件，不接受文件夹，因此这里预先过滤一次，
  // 避免在预览组件内部重复判断哪一类条目可以前后切换。
  const previewableFiles = driveItems.filter((item) => !item.isFolder);

  // =============== jsx ===============
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
            // 打开弹窗前先清掉上一次输入和错误，避免旧状态“带进来”。
            resetFolderCreationState();
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
        - 点击 "Create Folder" 调用 createFolder，由 hook 负责请求、错误和刷新逻辑
        - 页面层只根据 createFolder 的返回值决定是否关闭对话框
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
                onChange={onFolderNameChange}
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
                    resetFolderCreationState();
                  }}
                  disabled={creatingFolder}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              {/* folderName 为空或正在创建时禁用，避免提交空名称或重复请求 */}
              <Button
                appearance="primary"
                onClick={async () => {
                  // createFolder 返回布尔值，让页面层能用最少逻辑决定是否关弹窗。
                  const didCreate = await createFolder();

                  if (didCreate) {
                    setNewFolderDialogOpen(false);
                  }
                }}
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
        - 点击 "Delete" 调用 deleteSelectedItems，由 hook 处理批量删除、错误和列表刷新
        - 页面层只在 deleteSelectedItems 成功时关闭对话框
      */}
      <Dialog
        open={deleteDialogOpen}
        modalType="modal"
        onOpenChange={() => {
          setDeleteDialogOpen(false);
          resetDeleteError();
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
                    resetDeleteError();
                  }}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={async () => {
                  // 删除 hook 负责区分“完全成功 / 部分失败 / 抛异常”，
                  // 这里仅根据最终结果控制弹窗开关。
                  const didDelete = await deleteSelectedItems();

                  if (didDelete) {
                    setDeleteDialogOpen(false);
                  }
                }}
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
        - 行内动作不会自己处理副作用，而是回调到页面层，再由页面层分发给各专项 hook
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
          onManageVersions={openVersionDialog}
          actionsButtonGroupClassName={styles.actionsButtonGroup}
          nameCellContentClassName={styles.nameCellContent}
        />
      </div>

      {/*
        版本历史弹窗：
        - 展示层由 VersionHistoryDialog 负责
        - 数据读取、下载、恢复、删除版本等动作由 useFilesVersionDialog 负责
        - 页面层只做 props 转发，不再持有这套状态机细节
      */}
      <VersionHistoryDialog
        open={versionDialogOpen}
        versions={versionDialogEntries}
        currentVersionId={currentVersionId}
        isLoading={versionDialogLoading}
        isActionPending={versionDialogActionPending}
        error={versionDialogError}
        onClose={closeVersionDialog}
        onDownload={(entry) => void downloadVersion(entry)}
        onRestore={(entry) => void restoreVersion(entry)}
        onDelete={(entry) => void deleteVersion(entry)}
        onDeleteHistoryVersions={() => void deleteHistoryVersions()}
      />

      {/*
        Item 权限弹窗：
        - 打开条件和当前 item 上下文由页面层维护
        - 这样 DataGrid 只需要关心“用户点了哪个条目”，不用知道权限弹窗内部实现
      */}
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
        - onDelete: 调用 preview 删除 hook，由 hook 负责删除与刷新，页面层负责开关弹窗
      */}
      <Preview
        isOpen={previewOpen}
        onDismiss={() => {
          // 关闭预览时同时清掉动作错误，避免下次打开仍看到旧提示。
          clearPreviewActionError();
          setPreviewOpen(false);
        }}
        currentFile={currentPreviewFile}
        allFiles={previewableFiles}
        onNavigate={handlePreviewNavigate}
        onDownload={onDownloadItemClick}
        onDelete={() => void deletePreviewItem()}
        containerId={container.id}
        actionError={previewActionError}
      />
    </div>
  );
};

export default Files;
