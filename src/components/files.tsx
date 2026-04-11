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
 */

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
  WarningRegular,
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

/** 扩展 File 类型：文件夹上传时浏览器会提供 webkitRelativePath */
interface IFileWithRelativePath extends File {
  webkitRelativePath: string;
}

/**
 * 扩展 DriveItem 类型，增加 @microsoft.graph.downloadUrl 属性。
 * 在 SPA 中需要这个属性，详见 https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0&tabs=http#downloading-files-in-javascript-apps。
 */
interface DriveItemWithDownloadUrl extends DriveItem {
  "@microsoft.graph.downloadUrl"?: string;
}

/**
 * ZIP 归档下载进度状态
 *
 * 下载流程：启动任务 -> 轮询进度 -> 归档就绪 -> 用户点击后触发浏览器下载。
 */
interface IDownloadProgress {
  isActive: boolean; // 是否正在轮询进度
  jobProgress: IJobProgress | null; // 后端返回的任务进度详情
  readyJobId: string | null; // 归档已就绪时可下载的任务 ID
  isReadyToDownload: boolean; // 是否已就绪，等待用户触发下载
  isTriggeringDownload: boolean; // 是否正在触发浏览器下载
  isCompleted: boolean; // 是否下载完成
  errorMessage: string; // 错误信息（为空表示无错误）
  /**
   * 下载触发失败（例如票据过期或网络抖动），可通过重新申请票据重试。
   * 当此字段为 true 且 readyJobId 不为 null 时，UI 显示过期提示和
   * "Request new link" 按钮。
   */
  needsTicketRefresh: boolean;
}

/** 组件样式定义 */
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
 * @param props.container 当前选中的容器对象。
 *
 * 状态管理概览：
 * - driveItems: 当前文件夹内的文件/文件夹列表
 * - selectedRows: DataGrid 中选中的行 ID 集合
 * - folderId: 当前文件夹 ID（"root" 表示根目录）
 * - breadcrumbPath: 面包屑导航路径
 * - uploadProgress / downloadProgress: 上传/下载进度状态
 * - previewOpen / currentPreviewFile: 文件预览对话框状态
 */
export const Files = (props: IFilesProps) => {
  // =============== 文件列表状态 ===============
  const [driveItems, setDriveItems] = useState<IDriveItemExtended[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<SelectionItemId>>(
    new Set<TableRowId>(),
  );
  // useRef 主要用于在多次 render 之间存储一个可变且持久的引用，而不会触发组件 re-render；
  // 它既可以引用 DOM 元素，也可以引用任何普通的 JavaScript 变量。
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  // 由于下载归档需要轮询后端任务状态，我们使用 useRef 存储定时器 ID，以便在组件卸载时清理
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 用于创建新文件夹。
  const [folderId, setFolderId] = useState<string>("root");
  const [folderName, setFolderName] = useState<string>("");
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  // 用于删除项目。
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // 用于上传文件。
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  // 上传进度状态。
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>({
    isUploading: false,
    currentFile: "",
    currentIndex: 0,
    totalFiles: 0,
    fileSize: "",
    isCompleted: false,
  });
  // 下载进度状态（用于 ZIP 任务）。
  const [downloadProgress, setDownloadProgress] = useState<IDownloadProgress>({
    isActive: false,
    jobProgress: null,
    readyJobId: null,
    isReadyToDownload: false,
    isTriggeringDownload: false,
    isCompleted: false,
    errorMessage: "",
    needsTicketRefresh: false,
  });
  // 用于面包屑导航。
  const [breadcrumbPath, setBreadcrumbPath] = useState<IBreadcrumbItem[]>([
    { id: "root", name: "Root" },
  ]);
  // 用于文件预览。
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentPreviewFile, setCurrentPreviewFile] =
    useState<IDriveItemExtended | null>(null);

  // =============== 副作用：容器变化时重新加载文件列表 ===============
  useEffect(() => {
    (async () => {
      loadItems();
    })();
  }, [props]);

  // 组件卸载时清理下载轮询定时器，防止内存泄漏和对已卸载组件的状态更新
  // useEffect 第一个参数为 setup 函数，可以返回一个函数作为清理函数
  useEffect(() => {
    return () => {
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
        downloadPollRef.current = null;
      }
    };
  }, []);

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
   * 这段代码的作用是将从本地计算机中选中的文件整理成一个包含“相对路径”的列表，以便后续上传时能够保留文件夹结构。
   * 对于文件夹上传（webkitdirectory），会保留完整的相对路径结构。
   * 对于单文件上传，relativePath 就是文件名。
   */
  const getFolderStructure = (
    files: FileList,
  ): Array<{ file: File; relativePath: string }> => {
    const result: Array<{ file: File; relativePath: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileWithRelativePath = file as IFileWithRelativePath;
      // 文件夹上传时使用 webkitRelativePath，单文件上传时使用文件名。
      const relativePath = fileWithRelativePath.webkitRelativePath || file.name;
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
   * 3. 更新 driveItems 状态和当前 folderId。
   */
  const loadItems = async (itemId?: string, folderName?: string) => {
    try {
      const graphClient = Providers.globalProvider.graph.client;
      const driveId = props.container.id;
      const driveItemId = itemId || "root";

      // 获取当前层级的容器项目。
      const graphResponse = await graphClient
        .api(`/drives/${driveId}/items/${driveItemId}/children`)
        .get();
      const containerItems = graphResponse.value as DriveItemWithDownloadUrl[];
      const items: IDriveItemExtended[] = [];
      containerItems.forEach((driveItem) => {
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
          downloadUrl: driveItem["@microsoft.graph.downloadUrl"],
        });
      });
      setDriveItems(items);

      // 更新当前文件夹 ID。
      setFolderId(driveItemId);
    } catch (error: any) {
      console.error(`Failed to load items: ${error.message}`);
    }
  };

  /**
   * DataGrid 行选中状态变化处理。
   * 将选中的行 ID 集合同步到 selectedRows 状态，供工具栏下载/删除按钮判断是否有选中项。
   */
  const onSelectionChange: DataGridProps["onSelectionChange"] = (
    event: React.MouseEvent | React.KeyboardEvent,
    data: OnSelectionChangeData,
  ): void => {
    setSelectedRows(data.selectedItems);
  };

  /**
   * downloadUrl 是通过 Graph 获取的短时直链。
   * 点击下载按钮会触发 onToolbarDownloadClick，并在其中调用此函数。
   * 该函数通过 useRef 获取隐藏 <a> 标签的真实 DOM 实例（downloadLinkRef.current），替换 href，
   * 然后调用原生 click() 方法触发浏览器下载。
   * @param downloadUrl 文件的 @microsoft.graph.downloadUrl 直链。
   */
  const onDownloadItemClick = (downloadUrl: string) => {
    const link = downloadLinkRef.current;
    link!.href = downloadUrl;
    link!.click();
  };

  // ── 工具栏：下载选中项 ──────────────────────────────────────────────────────
  /**
   * 工具栏下载按钮处理。
   * - 单个非文件夹文件：使用直链下载（@microsoft.graph.downloadUrl）。
   * - 多个文件或包含文件夹：通过后端 ZIP 归档任务下载。
   */
  const onToolbarDownloadClick = async () => {
    const selectedIds = Array.from(selectedRows) as string[];
    if (selectedIds.length === 0) return;

    // 单个且非文件夹项目 -> 直链下载。
    if (selectedIds.length === 1) {
      const item = driveItems.find((d) => d.id === selectedIds[0]);
      if (item && !item.isFolder && item.downloadUrl) {
        onDownloadItemClick(item.downloadUrl);
        return;
      }
    }

    // 多个项目或包含文件夹 -> 走后端 ZIP 任务。
    await startZipDownload(selectedIds);
  };

  /**
   * 启动 ZIP 归档下载
   *
   * 完整流程：
   * 1. 调用 spEmbedded.startDownloadArchive() 启动后端任务
   * 2. 每 800ms 轮询 spEmbedded.getDownloadProgress() 查看进度
   * 3. 当 status === "ready" 时，仅更新 UI 为“可下载”状态，等待用户点击
   * 4. 用户点击 Download now 后调用 triggerArchiveFileDownload() 触发浏览器下载
   * 5. 下载触发后 4 秒自动清除完成提示
   * 6. 如果任务失败，显示错误信息。
   */
  const startZipDownload = async (itemIds: string[]) => {
    // 清理上一轮下载进度状态。
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }

    setDownloadProgress({
      isActive: true,
      jobProgress: null,
      readyJobId: null,
      isReadyToDownload: false,
      isTriggeringDownload: false,
      isCompleted: false,
      errorMessage: "",
      needsTicketRefresh: false,
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
        readyJobId: null,
        isReadyToDownload: false,
        isTriggeringDownload: false,
        isCompleted: false,
        errorMessage: `Failed to start download: ${err.message}`,
        needsTicketRefresh: false,
      });
      return;
    }

    // 每 800ms 轮询一次任务进度。
    downloadPollRef.current = setInterval(async () => {
      try {
        const progress = await spEmbedded.getDownloadProgress(jobId);
        // 给set一个 Update function，确保拿到最新的状态值，因为下面会多次调用，而useState只会
        // 在每次 render时更新 state，见useState 文档
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
            readyJobId: jobId,
            isReadyToDownload: true,
            isCompleted: false,
            errorMessage: "",
          }));
        } else if (progress.status === "failed") {
          clearInterval(downloadPollRef.current!);
          downloadPollRef.current = null;
          setDownloadProgress({
            isActive: false,
            jobProgress: progress,
            readyJobId: null,
            isReadyToDownload: false,
            isTriggeringDownload: false,
            isCompleted: false,
            errorMessage:
              progress.errors.length > 0
                ? progress.errors.join("; ")
                : "Archive job failed.",
            needsTicketRefresh: false,
          });
        }
      } catch (err: any) {
        clearInterval(downloadPollRef.current!);
        downloadPollRef.current = null;
        setDownloadProgress({
          isActive: false,
          jobProgress: null,
          readyJobId: null,
          isReadyToDownload: false,
          isTriggeringDownload: false,
          isCompleted: false,
          errorMessage: `Progress check failed: ${err.message}`,
          needsTicketRefresh: false,
        });
      }
    }, 800);
  };

  /**
   * 用户在归档 ready 后手动触发浏览器下载
   * 文件名规则：SPE-<unixMs>.zip
   */
  const onDownloadReadyClick = async () => {
    if (!downloadProgress.readyJobId || downloadProgress.isTriggeringDownload) {
      return;
    }

    const readyJobId = downloadProgress.readyJobId;
    const filename = `SPE-${Date.now()}.zip`;

    setDownloadProgress((prev) => ({
      ...prev,
      isTriggeringDownload: true,
      needsTicketRefresh: false,
      errorMessage: "",
    }));

    try {
      await spEmbedded.triggerArchiveFileDownload(readyJobId, filename);

      setDownloadProgress((prev) => ({
        ...prev,
        isTriggeringDownload: false,
        isReadyToDownload: false,
        readyJobId: null,
        needsTicketRefresh: false,
        isCompleted: true,
      }));

      setTimeout(() => {
        setDownloadProgress((prev) => ({
          ...prev,
          isCompleted: false,
          jobProgress: null,
        }));
      }, 4000);
    } catch (err: any) {
      // 即使 ticket 申请失败，job 仍可能存活（例如瞬时网络抖动，
      // 或后端缓存仍可用）。这里展示重试按钮而不是终态错误，
      // 让用户可以重新申请一个新的下载链接。
      setDownloadProgress((prev) => ({
        ...prev,
        isTriggeringDownload: false,
        isReadyToDownload: false,
        needsTicketRefresh: true,
        errorMessage: `Download failed: ${err.message}`,
      }));
    }
  };

  // ── 工具栏：删除选中项 ─────────────────────────────────────────────────────
  /** 打开确认删除对话框 */
  const onToolbarDeleteClick = () => {
    if (selectedRows.size === 0) return;
    setDeleteDialogOpen(true);
  };

  /**
   * 确认删除：调用后端 API 批量删除选中的文件/文件夹。
   * 删除后刷新文件列表并清空选择。
   */
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
    // 新引用来更新State，useState 会使用 Object.is 来比较新旧值，确保组件重新render
    setSelectedRows(new Set<TableRowId>());
  };

  /**
   * 创建新文件夹。
   * 在当前目录下创建子文件夹，使用 conflictBehavior: "rename" 避免重名冲突。
   */
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
   * 输入框文件夹名称变化处理。
   * @param data.value 最新输入内容，及时更新 FolderName state，用于立刻更新 UI。
   */
  const onHandleFolderNameChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setFolderName(data?.value);
  };

  /**
   * 触发文件选择对话框弹出（单个或多个文件）。
   * 点击工具栏中的 "Upload File" 按钮时触发隐藏 <input type="file"> 的点击。
   */
  const onUploadFileClick = () => {
    if (uploadFileRef.current) {
      uploadFileRef.current.click();
    }
  };

  /**
   * 触发文件夹选择对话框弹出。
   * 点击工具栏中的 "Upload Folder" 按钮时触发隐藏 <input webkitdirectory> 的点击。
   */
  const onUploadFolderClick = () => {
    if (uploadFolderRef.current) {
      uploadFolderRef.current.click();
    }
  };

  /**
   * 文件选择回调：用户选择文件后委托给 uploadFiles 处理。
   * 处理完成后重置 input value，允许重复选择相同文件。
   */
  const onUploadFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // 重置 input value，允许重复上传同一批文件。
    event.target.value = "";
  };

  /**
   * 文件夹选择回调：用户选择文件夹后委托给 uploadFiles 处理。
   * webkitdirectory 模式下，FileList 包含完整文件夹结构及相对路径。
   */
  const onUploadFolderSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // 重置 input value，允许再次选择同一文件夹。
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
   * 5. 完成后刷新文件列表。
   */
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

      // 更新上传进度。
      setUploadProgress((prev) => ({
        ...prev,
        currentFile: relativePath,
        currentIndex: i + 1,
        fileSize: formatFileSize(file.size),
      }));

      try {
        // 如果文件属于文件夹结构，先确保目标路径中的各级文件夹存在。
        const pathParts = relativePath.split("/");
        let currentPath = folderId || "root";

        // 必要时创建中间文件夹（最后一段是文件名，跳过）。
        for (let j = 0; j < pathParts.length - 1; j++) {
          const folderName = pathParts[j];
          currentPath = await createFolderIfNotExists(
            graphClient,
            currentPath,
            folderName,
          );
        }

        // 将文件上传到最终目标路径。
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

    // 展示上传完成状态。
    setUploadProgress((prev) => ({
      ...prev,
      isUploading: false,
      isCompleted: true,
    }));

    // 3 秒后隐藏完成提示。
    setTimeout(() => {
      setUploadProgress((prev) => ({
        ...prev,
        isCompleted: false,
      }));
    }, 3000);

    // 刷新文件列表。
    await loadItems(folderId || "root");
  };

  /**
   * 如果文件夹不存在则创建
   * 上传文件夹结构时，递归确保每层中间文件夹都存在
   *
   * @param graphClient Graph 客户端实例
   * @param parentId 父文件夹 ID
   * @param folderName 要创建的文件夹名称
   * @returns 文件夹 ID（已存在则返回现有 ID，否则返回新创建的 ID）。
   */
  const createFolderIfNotExists = async (
    graphClient: any,
    parentId: string,
    folderName: string,
  ): Promise<string> => {
    try {
      // 先检查目标文件夹是否已存在。
      const endpoint = `/drives/${props.container.id}/items/${parentId}/children`;
      const response = await graphClient.api(endpoint).get();

      const existingFolder = response.value.find(
        (item: any) => item.name === folderName && item.folder,
      );

      if (existingFolder) {
        return existingFolder.id;
      }

      // 若不存在则创建。
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
   * 导航到指定文件夹。
   * 加载目标文件夹内容并更新面包屑路径。
   * - 如果目标文件夹已在面包屑中（后退导航），截断路径。
   * - 如果是新文件夹（前进导航），追加到路径末尾。
   */
  const navigateToFolder = async (
    targetFolderId: string,
    targetFolderName: string,
  ) => {
    setSelectedRows(new Set());
    await loadItems(targetFolderId, targetFolderName);

    // 更新面包屑路径。
    if (targetFolderId === "root") {
      setBreadcrumbPath([{ id: "root", name: "Root" }]);
    } else {
      // 判断该文件夹是否已在路径中（后退导航场景）。
      const existingIndex = breadcrumbPath.findIndex(
        (item) => item.id === targetFolderId,
      );
      if (existingIndex !== -1) {
        // 后退导航：截断路径。
        setBreadcrumbPath(breadcrumbPath.slice(0, existingIndex + 1));
      } else {
        // 前进导航：追加路径。
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

  /**
   * 面包屑点击回调。
   *
   * @param targetFolderId 目标文件夹 ID。
   * @param targetFolderName 目标文件夹名称。
   */
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
   * 预览对话框中点击删除时，删除当前预览文件并关闭对话框。
   * 删除完成后刷新文件列表，使 UI 保持同步。
   */
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

  // =============== DataGrid 列定义 ===============
  const columns: TableColumnDefinition<IDriveItemExtended>[] = [
    createTableColumn({
      columnId: "driveItemName",
      renderHeaderCell: () => {
        return "Name";
      },
      renderCell: (driveItem) => {
        return (
          // 文件点击弹出预览对话框；文件夹点击进入该层级。
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
                  e.stopPropagation(); // 防止事件冒泡到 DataGrid 行选中逻辑。
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
        // 占位处理函数：当前仅用于展示，不包含真实业务实现。
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
   * 列宽预设配置。
   * idealWidth 用于初始期望宽度，实际宽度会被 resizableColumns 交互动态调整。
   */
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
  // 标记 3 - 组件渲染区域。
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
        隐藏的下载 <a> ：单文件直链下载时，由 onDownloadItemClick 动态设置 href
        后触发此元素的 click()，浏览器打开新 tab，识别为 attachment 后会自动关闭 tab 并静默下载文件
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
        - Download: 无选中时禁用；ZIP 任务进行中、已就绪待下载、触发下载中也禁用，防止并发冲突
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
            disabled={
              selectedRows.size === 0 ||
              downloadProgress.isActive ||
              downloadProgress.isReadyToDownload ||
              downloadProgress.isTriggeringDownload ||
              downloadProgress.needsTicketRefresh
            }
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
        ZIP 归档下载进度：在归档任务活跃、待点击下载、触发中、已触发或失败时显示
        - isActive=true: 显示 Spinner，文字根据后端 status 细分三个阶段：
            * 无 jobProgress（任务刚提交）: "Starting download job…"
            * status=="preparing": 正在遍历文件结构，显示当前文件名
            * status=="zipping": 正在压缩，显示 processedFiles/totalFiles 进度
        - isReadyToDownload=true: 显示 "Archive ready" + "Download now"，等待用户明确触发
        - needsTicketRefresh=true: 显示 Warning 图标 + "Download failed" 提示，
          并提供 "Request new link" 按钮让用户重新申请票据
        - isTriggeringDownload=true: 禁用按钮并显示小型 Spinner，防止重复点击
        - isCompleted=true: 显示 "Download started" 提示（4 秒后自动清除）
        - errorMessage 非空: 以红色文字显示错误原因
      */}
      {(downloadProgress.isActive ||
        downloadProgress.isReadyToDownload ||
        downloadProgress.isTriggeringDownload ||
        downloadProgress.isCompleted ||
        downloadProgress.needsTicketRefresh ||
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
          ) : downloadProgress.isReadyToDownload ? (
            <>
              <CheckmarkRegular
                style={{ color: tokens.colorPaletteGreenForeground1 }}
              />
              <Text className={styles.progressCompleted}>Archive ready</Text>
              <Button
                appearance="primary"
                onClick={onDownloadReadyClick}
                disabled={downloadProgress.isTriggeringDownload}
              >
                Download now
              </Button>
              {downloadProgress.isTriggeringDownload && <Spinner size="tiny" />}
            </>
          ) : downloadProgress.needsTicketRefresh ? (
            <>
              <WarningRegular
                style={{ color: tokens.colorPaletteYellowForeground1 }}
              />
              <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
                Download failed - please request a new link.
              </Text>
              <Button
                appearance="primary"
                onClick={onDownloadReadyClick}
                disabled={downloadProgress.isTriggeringDownload}
              >
                Request new link
              </Button>
              {downloadProgress.isTriggeringDownload && <Spinner size="tiny" />}
            </>
          ) : downloadProgress.isCompleted ? (
            <>
              <CheckmarkRegular
                style={{ color: tokens.colorPaletteGreenForeground1 }}
              />
              <Text className={styles.progressCompleted}>Download started</Text>
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
              <Label htmlFor="new-folder-name">Folder name:</Label>
              <Input
                id="new-folder-name"
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
