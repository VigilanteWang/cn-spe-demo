/**
 * 文件管理组件模块
 *
 * 本模块负责：
 * 1. 展示选中容器内的文件和文件夹列表（DataGrid 表格）
 * 2. 支持文件/文件夹的上传（单文件、多文件、整个文件夹）
 * 3. 支持文件下载（单文件直链下载、多文件/文件夹 ZIP 归档下载）
 * 4. 支持文件/文件夹的删除（批量删除）
 * 5. 支持创建新文件夹
 * 6. 支持文件夹导航（面包屑导航 + 返回上级）
 * 7. 支持文件预览（通过 <Preview /> 子组件）
 *
 * 组件结构：
 *   <div>
 *     <input type="file" hidden />       ← 隐藏的文件上传和文件夹上传输入框
 *     <a hidden />                        ← 隐藏的下载链接（用于单文件下载）
 *     <Breadcrumb />                      ← 面包屑导航
 *     <Toolbar />                         ← 工具栏（返回、新建文件夹、上传、下载、删除）
 *     {uploadProgress UI}                 ← 上传进度提示
 *     {downloadProgress UI}               ← 下载进度提示
 *     <Dialog newFolder />                ← 新建文件夹对话框
 *     <Dialog delete />                   ← 确认删除对话框
 *     <DataGrid />                        ← 文件列表表格（支持多选）
 *     <Preview />                         ← 文件预览对话框
 *   </div>
 *
 * Graph API 调用（前端直接调用，不经后端）：
 * - GET  /drives/{driveId}/items/{itemId}/children  → 列出文件夹内容
 * - POST /drives/{driveId}/items/{itemId}/children  → 创建子文件夹
 * - PUT  /drives/{driveId}/items/{itemId}:/{name}:/content  → 上传文件
 *
 * 后端 API 调用（通过 SpEmbedded 服务层）：
 * - deleteItems()            → 批量删除文件
 * - startDownloadArchive()   → 启动 ZIP 归档任务
 * - getDownloadProgress()    → 轮询归档进度
 * - triggerArchiveFileDownload() → 触发归档文件下载
 **/

import React, { useState, useEffect, useRef } from "react";
import { Providers } from "@microsoft/mgt-element";
import {
  AddRegular,
  ArrowUploadRegular,
  FolderRegular,
  DocumentRegular,
  SaveRegular,
  DeleteRegular,
  ArrowLeftRegular,
  ChevronRightRegular,
  HomeRegular,
  CheckmarkRegular,
  FolderAddRegular,
  ArrowDownloadRegular,
  HistoryRegular,
  PeopleRegular,
} from "@fluentui/react-icons";
import {
  Button,
  Link,
  Label,
  Spinner,
  Input,
  InputProps,
  InputOnChangeData,
  Dialog,
  DialogActions,
  DialogContent,
  DialogBody,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  DataGrid,
  DataGridProps,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  TableRowId,
  TableCellLayout,
  OnSelectionChangeData,
  SelectionItemId,
  Toolbar,
  ToolbarButton,
  makeStyles,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  Text,
  tokens,
} from "@fluentui/react-components";
import { DriveItem } from "@microsoft/microsoft-graph-types-beta";
import { IContainer } from "../common/types";
import Preview from "./preview";
import { IDriveItemExtended } from "../common/types";
import SpEmbedded, { IJobProgress } from "../services/spembedded";
require("isomorphic-fetch");

/** SpEmbedded 服务实例（全局单例），用于调用后端 API（删除、下载归档） */
const spEmbedded = new SpEmbedded();

/** Files 组件的属性接口 */
interface IFilesProps {
  /** 当前选中的容器（由 Containers 父组件传入），其 id 即 Drive ID */
  container: IContainer;
}

/** 面包屑导航项 */
interface IBreadcrumbItem {
  id: string; // 文件夹 ID（"root" 表示根目录）
  name: string; // 文件夹显示名称
}

/** 文件上传进度状态 */
interface IUploadProgress {
  isUploading: boolean; // 是否正在上传
  currentFile: string; // 当前上传的文件路径
  currentIndex: number; // 当前文件序号（从 1 开始）
  totalFiles: number; // 总文件数
  fileSize: string; // 当前文件大小（格式化后，如 "1.5 MB"）
  isCompleted: boolean; // 上传是否已完成（用于显示完成提示）
}

/**
 * ZIP 归档下载进度状态
 *
 * 下载流程：启动任务 → 轮询进度 → 任务完成 → 触发浏览器下载
 **/
interface IDownloadProgress {
  isActive: boolean; // 是否正在轮询进度
  jobProgress: IJobProgress | null; // 后端返回的任务进度详情
  isCompleted: boolean; // 是否下载完成
  errorMessage: string; // 错误信息（为空表示无错误）
}
const useStyles = makeStyles({
  dialogInputControl: {
    width: "400px",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
    marginBottom: "25px",
  },
  breadcrumbContainer: {
    marginBottom: "16px",
    padding: "8px 0",
  },
  toolbarContainer: {
    marginBottom: "16px",
  },
  progressContainer: {
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  progressText: {
    fontSize: "14px",
    color: tokens.colorNeutralForeground1,
  },
  progressCompleted: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: "600",
  },
});
/**
 * 文件管理组件
 *
 * @param props.container 当前选中的容器对象
 *
 * 状态管理概览：
 * - driveItems: 当前文件夹内的文件/文件夹列表
 * - selectedRows: DataGrid 中选中的行 ID 集合
 * - folderId: 当前文件夹 ID（"root" 表示根目录）
 * - breadcrumbPath: 面包屑导航路径
 * - uploadProgress / downloadProgress: 上传/下载进度状态
 * - previewOpen / currentPreviewFile: 文件预览对话框状态
 **/
export const Files = (props: IFilesProps) => {
  // =============== 文件列表状态 ===============
  const [driveItems, setDriveItems] = useState<IDriveItemExtended[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<SelectionItemId>>(
    new Set<TableRowId>(),
  );
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // for creating new folders
  const [folderId, setFolderId] = useState<string>("root");
  const [folderName, setFolderName] = useState<string>("");
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  // for deleting items
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // for uploading files
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>({
    isUploading: false,
    currentFile: "",
    currentIndex: 0,
    totalFiles: 0,
    fileSize: "",
    isCompleted: false,
  });
  // Download progress state (for ZIP jobs)
  const [downloadProgress, setDownloadProgress] = useState<IDownloadProgress>({
    isActive: false,
    jobProgress: null,
    isCompleted: false,
    errorMessage: "",
  });
  // for breadcrumb navigation
  const [breadcrumbPath, setBreadcrumbPath] = useState<IBreadcrumbItem[]>([
    { id: "root", name: "Root" },
  ]);
  // for file preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentPreviewFile, setCurrentPreviewFile] =
    useState<IDriveItemExtended | null>(null);
  // BOOKMARK 1 - constants & hooks

  // =============== 副作用：容器变化时重新加载文件列表 ===============
  useEffect(() => {
    (async () => {
      loadItems();
    })();
  }, [props]); // eslint-disable-line react-hooks/exhaustive-deps

  // =============== 工具函数 ===============

  /** 格式化文件大小为人类可读格式（如 "1.5 MB"） */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  /**
   * 从 FileList 中提取文件及其相对路径
   * 对于文件夹上传（webkitdirectory），会保留完整的相对路径结构
   * 对于单文件上传，relativePath 就是文件名
   **/
  const getFolderStructure = (
    files: FileList,
  ): Array<{ file: File; relativePath: string }> => {
    const result: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Use webkitRelativePath for folder uploads or just the file name for single files
      const relativePath = (file as any).webkitRelativePath || file.name;
      result.push({ file, relativePath });
    }
    return result;
  };

  /**
   * 加载指定文件夹内的文件/文件夹列表
   *
   * @param itemId 文件夹 ID，默认 "root"（根目录）
   * @param folderName 文件夹名称（可选，用于面包屑）
   *
   * 流程：
   * 1. 调用 Graph API 获取指定文件夹的子项
   * 2. 将 DriveItem 转换为 IDriveItemExtended（添加 UI 辅助属性）
   * 3. 更新 driveItems 状态和当前 folderId
   **/
  const loadItems = async (itemId?: string, folderName?: string) => {
    try {
      const graphClient = Providers.globalProvider.graph.client;
      const driveId = props.container.id;
      const driveItemId = itemId || "root";

      // get Container items at current level
      const graphResponse = await graphClient
        .api(`/drives/${driveId}/items/${driveItemId}/children`)
        .get();
      const containerItems: DriveItem[] = graphResponse.value as DriveItem[];
      const items: IDriveItemExtended[] = [];
      containerItems.forEach((driveItem: DriveItem) => {
        items.push({
          ...driveItem,
          isFolder: driveItem.folder ? true : false,
          modifiedByName: driveItem.lastModifiedBy?.user?.displayName
            ? driveItem.lastModifiedBy!.user!.displayName
            : "unknown",
          iconElement: driveItem.folder ? (
            <FolderRegular />
          ) : (
            <DocumentRegular />
          ),
          downloadUrl: (driveItem as any)["@microsoft.graph.downloadUrl"],
        });
      });
      setDriveItems(items);

      // Update folder ID
      setFolderId(driveItemId);
    } catch (error: any) {
      console.error(`Failed to load items: ${error.message}`);
    }
  };

  /**
   * DataGrid 行选中状态变化处理
   * 将选中的行 ID 集合同步到 selectedRows 状态，供工具栏下载/删除按钮判断是否有选中项
   **/
  const onSelectionChange: DataGridProps["onSelectionChange"] = (
    event: React.MouseEvent | React.KeyboardEvent,
    data: OnSelectionChangeData,
  ): void => {
    setSelectedRows(data.selectedItems);
  };

  /**
   * 通过隐藏 <a> 标签触发单文件直链下载
   * @param downloadUrl 文件的 @microsoft.graph.downloadUrl 直链
   **/
  const onDownloadItemClick = (downloadUrl: string) => {
    const link = downloadLinkRef.current;
    link!.href = downloadUrl;
    link!.click();
  };

  // ── 工具栏：下载选中项 ──────────────────────────────────────────────────────
  /**
   * 工具栏下载按钮处理
   * - 单个非文件夹文件：使用直链下载（@microsoft.graph.downloadUrl）
   * - 多个文件或包含文件夹：通过后端 ZIP 归档任务下载
   **/
  const onToolbarDownloadClick = async () => {
    const selectedIds = Array.from(selectedRows) as string[];
    if (selectedIds.length === 0) return;

    // Single file that is not a folder → direct link download
    if (selectedIds.length === 1) {
      const item = driveItems.find((d) => d.id === selectedIds[0]);
      if (item && !item.isFolder && item.downloadUrl) {
        onDownloadItemClick(item.downloadUrl);
        return;
      }
    }

    // Multiple or contains folder → ZIP via backend job
    await startZipDownload(selectedIds);
  };

  /**
   * 启动 ZIP 归档下载
   *
   * 完整流程：
   * 1. 调用 spEmbedded.startDownloadArchive() 启动后端任务
   * 2. 每 800ms 轮询 spEmbedded.getDownloadProgress() 查看进度
   * 3. 当 status === "ready" 时，调用 triggerArchiveFileDownload() 触发浏览器下载
   * 4. 下载完成后 4 秒自动清除完成提示
   * 5. 如果任务失败，显示错误信息
   **/
  const startZipDownload = async (itemIds: string[]) => {
    // Clear any previous download progress
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }

    setDownloadProgress({
      isActive: true,
      jobProgress: null,
      isCompleted: false,
      errorMessage: "",
    });

    let jobId: string;
    try {
      jobId = await spEmbedded.startDownloadArchive(
        props.container.id,
        itemIds,
      );
    } catch (err: any) {
      setDownloadProgress({
        isActive: false,
        jobProgress: null,
        isCompleted: false,
        errorMessage: `Failed to start download: ${err.message}`,
      });
      return;
    }

    // Poll for progress every 800 ms
    downloadPollRef.current = setInterval(async () => {
      try {
        const progress = await spEmbedded.getDownloadProgress(jobId);

        setDownloadProgress((prev) => ({
          ...prev,
          jobProgress: progress,
        }));

        if (progress.status === "ready") {
          clearInterval(downloadPollRef.current!);
          downloadPollRef.current = null;

          setDownloadProgress((prev) => ({
            ...prev,
            isActive: false,
            isCompleted: true,
          }));

          // Trigger the actual file download
          try {
            await spEmbedded.triggerArchiveFileDownload(jobId);
          } catch (err: any) {
            setDownloadProgress((prev) => ({
              ...prev,
              errorMessage: `Download failed: ${err.message}`,
            }));
          }

          // Auto-clear the completed notice after 4 seconds
          setTimeout(() => {
            setDownloadProgress({
              isActive: false,
              jobProgress: null,
              isCompleted: false,
              errorMessage: "",
            });
          }, 4000);
        } else if (progress.status === "failed") {
          clearInterval(downloadPollRef.current!);
          downloadPollRef.current = null;
          setDownloadProgress({
            isActive: false,
            jobProgress: progress,
            isCompleted: false,
            errorMessage:
              progress.errors.length > 0
                ? progress.errors.join("; ")
                : "Archive job failed.",
          });
        }
      } catch (err: any) {
        clearInterval(downloadPollRef.current!);
        downloadPollRef.current = null;
        setDownloadProgress({
          isActive: false,
          jobProgress: null,
          isCompleted: false,
          errorMessage: `Progress check failed: ${err.message}`,
        });
      }
    }, 800);
  };

  // ── 工具栏：删除选中项 ─────────────────────────────────────────────────────
  /** 打开确认删除对话框 */
  const onToolbarDeleteClick = () => {
    if (selectedRows.size === 0) return;
    setDeleteDialogOpen(true);
  };

  /**
   * 确认删除：调用后端 API 批量删除选中的文件/文件夹
   * 删除后刷新文件列表并清空选择
   **/
  const onDeleteItemClick = async () => {
    const selectedIds = Array.from(selectedRows) as string[];
    if (selectedIds.length === 0) return;

    try {
      const result = await spEmbedded.deleteItems(
        props.container.id,
        selectedIds,
      );

      if (result.failed.length > 0) {
        console.warn(
          "Some items failed to delete:",
          result.failed.map((f) => `${f.id}: ${f.reason}`).join(", "),
        );
      }
    } catch (err: any) {
      console.error("Delete failed:", err.message);
    }

    await loadItems(folderId || "root");
    setDeleteDialogOpen(false);
    setSelectedRows(new Set<TableRowId>());
  };

  /**
   * 创建新文件夹
   * 在当前目录下创建子文件夹，使用 conflictBehavior: "rename" 避免重名冲突
   **/
  const onFolderCreateClick = async () => {
    setCreatingFolder(true);

    const currentFolderId = folderId;
    const graphClient = Providers.globalProvider.graph.client;
    const endpoint = `/drives/${props.container.id}/items/${currentFolderId}/children`;
    const data = {
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    };
    await graphClient.api(endpoint).post(data);

    await loadItems(currentFolderId);

    setCreatingFolder(false);
    setNewFolderDialogOpen(false);
  };

  /**
   * 输入框文件夹名称变化处理
   * @param data.value 最新输入内容，用于创建文件夹对话框的和输入框
   **/
  const onHandleFolderNameChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setFolderName(data?.value);
  };

  /**
   * 触发文件选择对话框弹出（单个或多个文件）
   * 点击工具栏中的 "Upload File" 按钮时触发隐藏 <input type="file"> 的点击
   **/
  const onUploadFileClick = () => {
    if (uploadFileRef.current) {
      uploadFileRef.current.click();
    }
  };

  /**
   * 触发文件夹选择对话框弹出
   * 点击工具栏中的 "Upload Folder" 按钮时触发隐藏 <input webkitdirectory> 的点击
   **/
  const onUploadFolderClick = () => {
    if (uploadFolderRef.current) {
      uploadFolderRef.current.click();
    }
  };

  /**
   * 文件选择回调：用户选择文件后委托给 uploadFiles 处理
   * 处理完成后重置 input value，允许重复选择相同文件
   **/
  const onUploadFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // Reset the input value to allow re-uploading the same files
    event.target.value = "";
  };

  /**
   * 文件夹选择回调：用户选择文件夹后委托给 uploadFiles 处理
   * webkitdirectory 模式下，FileList 包含完整文件夹结构及相对路径
   **/
  const onUploadFolderSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // Reset the input value
    event.target.value = "";
  };

  /**
   * 上传文件核心逻辑
   *
   * @param files 用户选择的文件列表（来自 <input type="file" />）
   *
   * 流程：
   * 1. 解析文件列表及其相对路径（支持文件夹结构）
   * 2. 遍历每个文件，按路径创建必要的中间文件夹
   * 3. 使用 Graph API PUT 请求上传文件内容
   * 4. 上传过程中实时更新进度状态
   * 5. 完成后刷新文件列表
   **/
  const uploadFiles = async (files: FileList) => {
    const fileStructure = getFolderStructure(files);
    const totalFiles = fileStructure.length;

    setUploadProgress({
      isUploading: true,
      currentFile: "",
      currentIndex: 0,
      totalFiles,
      fileSize: "",
      isCompleted: false,
    });

    const graphClient = Providers.globalProvider.graph.client;

    for (let i = 0; i < fileStructure.length; i++) {
      const { file, relativePath } = fileStructure[i];

      // Update progress
      setUploadProgress((prev) => ({
        ...prev,
        currentFile: relativePath,
        currentIndex: i + 1,
        fileSize: formatFileSize(file.size),
      }));

      try {
        // If the file is part of a folder structure, we need to create the folder path
        const pathParts = relativePath.split("/");
        let currentPath = folderId || "root";

        // Create folder structure if needed (skip the last part which is the file name)
        for (let j = 0; j < pathParts.length - 1; j++) {
          const folderName = pathParts[j];
          currentPath = await createFolderIfNotExists(
            graphClient,
            currentPath,
            folderName,
          );
        }

        // Upload the file to the final destination
        const fileName = pathParts[pathParts.length - 1];
        const endpoint = `/drives/${props.container.id}/items/${currentPath}:/${fileName}:/content`;

        const fileReader = new FileReader();
        const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
          fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
          fileReader.onerror = reject;
          fileReader.readAsArrayBuffer(file);
        });

        await graphClient.api(endpoint).putStream(fileData);
      } catch (error: any) {
        console.error(
          `Failed to upload file ${relativePath}: ${error.message}`,
        );
      }
    }

    // Show completion state
    setUploadProgress((prev) => ({
      ...prev,
      isUploading: false,
      isCompleted: true,
    }));

    // Hide completion message after 3 seconds
    setTimeout(() => {
      setUploadProgress((prev) => ({
        ...prev,
        isCompleted: false,
      }));
    }, 3000);

    // Refresh the file list
    await loadItems(folderId || "root");
  };

  /**
   * 如果文件夹不存在则创建
   * 上传文件夹结构时，递归确保每层中间文件夹都存在
   *
   * @param graphClient Graph 客户端实例
   * @param parentId 父文件夹 ID
   * @param folderName 要创建的文件夹名称
   * @returns 文件夹 ID（已存在则返回现有的，否则返回新创建的）
   **/
  const createFolderIfNotExists = async (
    graphClient: any,
    parentId: string,
    folderName: string,
  ): Promise<string> => {
    try {
      // First, try to get the folder if it already exists
      const endpoint = `/drives/${props.container.id}/items/${parentId}/children`;
      const response = await graphClient.api(endpoint).get();

      const existingFolder = response.value.find(
        (item: any) => item.name === folderName && item.folder,
      );

      if (existingFolder) {
        return existingFolder.id;
      }

      // If folder doesn't exist, create it
      const createEndpoint = `/drives/${props.container.id}/items/${parentId}/children`;
      const data = {
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      };
      const newFolder = await graphClient.api(createEndpoint).post(data);
      return newFolder.id;
    } catch (error: any) {
      console.error(`Failed to create folder ${folderName}: ${error.message}`);
      throw error;
    }
  };

  // =============== 文件夹导航 ===============

  /**
   * 导航到指定文件夹
   * 加载目标文件夹内容并更新面包屑路径
   * - 如果目标文件夹已在面包屑中（后退导航），截断路径
   * - 如果是新文件夹（前进导航），追加到路径末尾
   **/
  const navigateToFolder = async (
    targetFolderId: string,
    targetFolderName: string,
  ) => {
    setSelectedRows(new Set());
    await loadItems(targetFolderId, targetFolderName);

    // Update breadcrumb path
    if (targetFolderId === "root") {
      setBreadcrumbPath([{ id: "root", name: "Root" }]);
    } else {
      // Find if this folder is already in the path (navigating backwards)
      const existingIndex = breadcrumbPath.findIndex(
        (item) => item.id === targetFolderId,
      );
      if (existingIndex !== -1) {
        // Navigate backwards - trim the path
        setBreadcrumbPath(breadcrumbPath.slice(0, existingIndex + 1));
      } else {
        // Navigate forwards - add to path
        setBreadcrumbPath([
          ...breadcrumbPath,
          { id: targetFolderId, name: targetFolderName },
        ]);
      }
    }
  };

  /** 返回上级文件夹（取面包屑倒数第二项） */
  const navigateToParentFolder = async () => {
    if (breadcrumbPath.length > 1) {
      const parentFolder = breadcrumbPath[breadcrumbPath.length - 2];
      await navigateToFolder(parentFolder.id, parentFolder.name);
    }
  };

  const onBreadcrumbClick = async (
    targetFolderId: string,
    targetFolderName: string,
  ) => {
    await navigateToFolder(targetFolderId, targetFolderName);
  };

  // =============== 文件预览处理 ===============
  /** 预览对话框中点击前/后导航时，更新当前预览文件 */
  const handlePreviewNavigate = (file: IDriveItemExtended) => {
    setCurrentPreviewFile(file);
  };

  /** 预览对话框中点击下载时，使用隐藏 <a> 标签触发直链下载 */
  const handlePreviewDownload = (downloadUrl: string) => {
    onDownloadItemClick(downloadUrl);
  };

  /**
   * 预览对话框中点击删除时，删除当前预览文件并关闭对话框
   * 删除完成后刷新文件列表，使 UI 保持同步
   **/
  const handlePreviewDelete = async () => {
    if (currentPreviewFile?.id) {
      try {
        await spEmbedded.deleteItems(props.container.id, [
          currentPreviewFile.id as string,
        ]);
      } catch (err: any) {
        console.error("Preview delete failed:", err.message);
      }
      await loadItems(folderId || "root");
      setPreviewOpen(false);
    }
  };

  /** 仅保留非文件夹项用于预览导航（前/后切换时跳过文件夹） */
  const previewableFiles = driveItems.filter((item) => !item.isFolder);
  // BOOKMARK 2 - handlers go here

  // =============== DataGrid 列定义 ===============
  const columns: TableColumnDefinition<IDriveItemExtended>[] = [
    createTableColumn({
      columnId: "driveItemName",
      renderHeaderCell: () => {
        return "Name";
      },
      renderCell: (driveItem) => {
        return (
          // 文件点击弹出预览对话框；文件夸点击进入该层级
          <TableCellLayout media={driveItem.iconElement}>
            {!driveItem.isFolder ? (
              <Link
                onClick={() => {
                  setCurrentPreviewFile(driveItem);
                  setPreviewOpen(true);
                }}
              >
                {driveItem.name}
              </Link>
            ) : (
              <Link
                onClick={(e) => {
                  e.stopPropagation(); // 防止事件冒泡到 DataGrid 行选中处理
                  navigateToFolder(
                    driveItem.id as string,
                    driveItem.name as string,
                  );
                }}
              >
                {driveItem.name}
              </Link>
            )}
          </TableCellLayout>
        );
      },
    }),
    createTableColumn({
      columnId: "lastModifiedTimestamp",
      renderHeaderCell: () => {
        return "Last Modified";
      },
      renderCell: (driveItem) => {
        return (
          <TableCellLayout>{driveItem.lastModifiedDateTime}</TableCellLayout>
        );
      },
    }),
    createTableColumn({
      columnId: "lastModifiedBy",
      renderHeaderCell: () => {
        return "Last Modified By";
      },
      renderCell: (driveItem) => {
        return <TableCellLayout>{driveItem.modifiedByName}</TableCellLayout>;
      },
    }),
    createTableColumn({
      columnId: "actions",
      renderHeaderCell: () => {
        return "Actions";
      },
      renderCell: (driveItem) => {
        // Placeholder handlers – no real implementation yet
        const onVersionsClick = () => {
          console.log("Versions placeholder clicked for:", driveItem.id);
        };
        const onPermissionsClick = () => {
          console.log("Permissions placeholder clicked for:", driveItem.id);
        };

        return (
          <>
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
          </>
        );
      },
    }),
  ];

  /**
   * 列宽预设配置
   * idealWidth 选中到想要的初始宽度，maxWidth 附却会被 resizableColumns 动态调整
   **/
  const columnSizingOptions = {
    driveItemName: {
      minWidth: 150,
      defaultWidth: 250,
      idealWidth: 200,
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
  // BOOKMARK 3 - component rendering return (
  const styles = useStyles();
  return (
    <div>
      <input
        ref={uploadFileRef}
        type="file"
        multiple
        onChange={onUploadFileSelected}
        style={{ display: "none" }}
      />
      <input
        ref={uploadFolderRef}
        type="file"
        {...({ webkitdirectory: "" } as any)}
        multiple
        onChange={onUploadFolderSelected}
        style={{ display: "none" }}
      />
      {/*
        隐藏的下载锚点：单文件直链下载时，由 onDownloadItemClick 动态设置 href
        后触发此元素的 click()，浏览器会在新标签页中静默下载文件
      */}
      {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
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
        面包屑导航：显示当前文件夹层级路径（如 Root > FolderA > FolderB）
        - 第一项（index === 0）固定为 Root，显示 HomeRegular 图标
        - 最后一项（current=true）为当前所在文件夹，高亮显示
        - 点击任意路径项时调用 onBreadcrumbClick，导航到对应文件夹
        - 两个相邻项之间渲染 ChevronRightRegular 分隔符
      */}
      <div className={styles.breadcrumbContainer}>
        <Breadcrumb>
          {breadcrumbPath.map((item, index) => (
            <React.Fragment key={item.id}>
              <BreadcrumbItem>
                <BreadcrumbButton
                  icon={index === 0 ? <HomeRegular /> : undefined}
                  onClick={() => onBreadcrumbClick(item.id, item.name)}
                  current={index === breadcrumbPath.length - 1}
                >
                  {item.name}
                </BreadcrumbButton>
              </BreadcrumbItem>
              {index < breadcrumbPath.length - 1 && (
                <BreadcrumbDivider>
                  <ChevronRightRegular />
                </BreadcrumbDivider>
              )}
            </React.Fragment>
          ))}
        </Breadcrumb>
      </div>

      {/*
        操作工具栏：包含文件夹导航和文件操作按钮
        - Back: 返回上一级文件夹（面包屑只有 Root 时禁用）
        - New Folder: 打开创建文件夹对话框
        - Upload File: 弹出文件选择框，支持多文件上传
        - Upload Folder: 弹出文件夹选择框，保留完整目录结构上传
        - Download: 无选中时禁用；ZIP 任务进行中时也禁用，防止重复提交
        - Delete: 无选中时禁用，点击后弹出确认对话框
      */}
      <div className={styles.toolbarContainer}>
        <Toolbar>
          {/* 返回上级：breadcrumbPath 仅剩 Root 时（length <= 1）不可后退 */}
          <ToolbarButton
            vertical
            icon={<ArrowLeftRegular />}
            onClick={navigateToParentFolder}
            disabled={breadcrumbPath.length <= 1}
          >
            Back
          </ToolbarButton>
          {/* 新建文件夹：打开 newFolderDialogOpen 受控对话框 */}
          <ToolbarButton
            vertical
            icon={<AddRegular />}
            onClick={() => setNewFolderDialogOpen(true)}
          >
            New Folder
          </ToolbarButton>
          {/* 上传文件：触发隐藏的 <input type="file" multiple> */}
          <ToolbarButton
            vertical
            icon={<ArrowUploadRegular />}
            onClick={onUploadFileClick}
          >
            Upload File
          </ToolbarButton>
          {/* 上传文件夹：触发隐藏的 <input webkitdirectory>，保留目录层级 */}
          <ToolbarButton
            vertical
            icon={<FolderAddRegular />}
            onClick={onUploadFolderClick}
          >
            Upload Folder
          </ToolbarButton>
          {/* 下载：单文件直链下载，多文件/文件夹走 ZIP 归档后端任务 */}
          <ToolbarButton
            vertical
            icon={<ArrowDownloadRegular />}
            onClick={onToolbarDownloadClick}
            disabled={selectedRows.size === 0 || downloadProgress.isActive}
          >
            Download
          </ToolbarButton>
          {/* 删除：根据 selectedRows 数量在对话框中显示单/多项措辞 */}
          <ToolbarButton
            vertical
            icon={<DeleteRegular />}
            onClick={onToolbarDeleteClick}
            disabled={selectedRows.size === 0}
          >
            Delete
          </ToolbarButton>
        </Toolbar>
      </div>

      {/*
        上传进度条：仅在上传进行中或刚完成时显示（完成后 3 秒自动隐藏）
        - isUploading=true: 显示 Spinner + 当前文件名、序号和大小
        - isCompleted=true: 显示绿色 Checkmark + "Upload completed" 提示
      */}
      {(uploadProgress.isUploading || uploadProgress.isCompleted) && (
        <div className={styles.progressContainer}>
          {uploadProgress.isUploading ? (
            <>
              <Spinner size="small" />
              <Text className={styles.progressText}>
                Uploading {uploadProgress.currentFile} (
                {uploadProgress.currentIndex}/{uploadProgress.totalFiles}) -{" "}
                {uploadProgress.fileSize}
              </Text>
            </>
          ) : uploadProgress.isCompleted ? (
            <>
              <CheckmarkRegular
                style={{ color: tokens.colorPaletteGreenForeground1 }}
              />
              <Text className={styles.progressCompleted}>Upload completed</Text>
            </>
          ) : null}
        </div>
      )}

      {/*
        ZIP 归档下载进度：在归档任务活跃、完成或失败时显示
        - isActive=true: 显示 Spinner，文字根据后端 status 细分三个阶段：
            * 无 jobProgress（任务刚提交）: "Starting download job…"
            * status=="preparing": 正在遍历文件结构，显示当前文件名
            * status=="zipping": 正在压缩，显示 processedFiles/totalFiles 进度
        - isCompleted=true: 显示绿色 Checkmark + "Archive ready" 提示（4 秒后自动清除）
        - errorMessage 非空: 以红色文字显示错误原因
      */}
      {(downloadProgress.isActive ||
        downloadProgress.isCompleted ||
        downloadProgress.errorMessage) && (
        <div className={styles.progressContainer}>
          {downloadProgress.isActive ? (
            <>
              <Spinner size="small" />
              <Text className={styles.progressText}>
                {downloadProgress.jobProgress?.status === "preparing"
                  ? `Preparing archive${downloadProgress.jobProgress.currentItem ? `: ${downloadProgress.jobProgress.currentItem}` : "…"}`
                  : downloadProgress.jobProgress?.status === "zipping"
                    ? `Compressing ${downloadProgress.jobProgress.processedFiles}/${downloadProgress.jobProgress.totalFiles}: ${downloadProgress.jobProgress.currentItem}`
                    : "Starting download job…"}
              </Text>
            </>
          ) : downloadProgress.isCompleted ? (
            <>
              <CheckmarkRegular
                style={{ color: tokens.colorPaletteGreenForeground1 }}
              />
              <Text className={styles.progressCompleted}>
                Archive ready – download started
              </Text>
            </>
          ) : downloadProgress.errorMessage ? (
            <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
              {downloadProgress.errorMessage}
            </Text>
          ) : null}
        </div>
      )}

      {/*
        新建文件夹对话框：由工具栏 "New Folder" 按钮触发
        - 输入框绑定 folderName 状态，空字符串时禁用确认按钮
        - 点击 "Create Folder" 调用 onFolderCreateClick，期间显示 Spinner 并禁用所有按钮
        - 创建完成后自动关闭对话框并刷新当前文件夹列表
      */}
      <Dialog open={newFolderDialogOpen}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Label htmlFor={folderName}>Folder name:</Label>
              <Input
                id={folderName}
                className={styles.dialogInputControl}
                autoFocus
                required
                value={folderName}
                onChange={onHandleFolderNameChange}
              ></Input>
              {/* 创建中显示 Spinner 阻止用户重复提交 */}
              {creatingFolder && (
                <Spinner
                  size="medium"
                  label="Creating folder..."
                  labelPosition="after"
                />
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button
                  appearance="secondary"
                  onClick={() => setNewFolderDialogOpen(false)}
                  disabled={creatingFolder}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              {/* folderName 为空或正在创建时禁用，避免提交空名称或重复请求 */}
              <Button
                appearance="primary"
                onClick={onFolderCreateClick}
                disabled={creatingFolder || folderName === ""}
              >
                Create Folder
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {/*
        确认删除对话框：由工具栏 "Delete" 按钮或行内删除触发
        - 标题和正文根据 selectedRows.size 动态展示单/多项措辞
        - 点击 "Delete" 调用 onDeleteItemClick（批量删除 → 刷新列表 → 关闭对话框）
        - modalType="modal" 确保对话框获得焦点捕获，防止误操作背景区域
      */}
      <Dialog
        open={deleteDialogOpen}
        modalType="modal"
        onOpenChange={() => setDeleteDialogOpen(false)}
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
            </DialogContent>
            <DialogActions>
              <DialogTrigger>
                <Button
                  appearance="secondary"
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={onDeleteItemClick}>
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {/*
        文件列表 DataGrid：展示当前文件夹内所有文件和子文件夹
        - items: 当前文件夹的 DriveItem 列表（IDriveItemExtended）
        - getRowId: 使用 DriveItem.id 作为行唯一键，供多选状态跟踪
        - resizableColumns + columnSizingOptions: 支持用户拖拽调整列宽
        - selectionMode="multiselect": 支持 Shift/Ctrl 多选，选中集合存入 selectedRows
        - DataGridHeader: 渲染列标题行（Name / Last Modified / Last Modified By / Actions）
        - DataGridBody: 每行调用列定义中的 renderCell 渲染单元格内容
      */}
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
              {({ renderCell, columnId }) => (
                <DataGridCell>{renderCell(item)}</DataGridCell>
              )}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>

      {/*
        文件预览对话框（全屏）：点击文件名时打开
        - isOpen / onDismiss: 受 previewOpen 状态控制，关闭时重置为 false
        - currentFile: 当前预览的文件（IDriveItemExtended），由 DataGrid 行点击设置
        - allFiles: 仅包含非文件夹文件（previewableFiles），用于前/后导航
        - onNavigate: 点击前/后按钮时更新 currentPreviewFile，触发 Preview 重新加载 URL
        - onDownload: 调用隐藏 <a> 标签触发直链下载
        - onDelete: 删除当前文件并刷新列表后关闭对话框
        - containerId: 容器 Drive ID，用于 Preview 内部构建 Graph API 路径
      */}
      <Preview
        isOpen={previewOpen}
        onDismiss={() => setPreviewOpen(false)}
        currentFile={currentPreviewFile}
        allFiles={previewableFiles}
        onNavigate={handlePreviewNavigate}
        onDownload={handlePreviewDownload}
        onDelete={handlePreviewDelete}
        containerId={props.container.id}
      />
    </div>
  );
};

export default Files;
