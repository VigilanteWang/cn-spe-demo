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
 * - getArchivePreparationProgress() → 轮询归档准备进度
 * - getDownloadManifest()    → 获取归档清单
 * - downloadArchiveFromManifest() → 前端流式下载并压缩
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Providers } from "@microsoft/mgt-element";
import {
  AddRegular,
  ArrowUploadRegular,
  FolderRegular,
  DocumentRegular,
  DeleteRegular,
  ArrowLeftRegular,
  ChevronRightRegular,
  HomeRegular,
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
  ProgressBar,
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
import {
  IArchiveClientProgress,
  IContainer,
  IDriveItemExtended,
} from "../common/types";
import Preview from "./preview";
import SpEmbedded, {
  IArchiveSaveTarget,
  IJobProgress,
} from "../services/spembedded";
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
  currentIndex: number; // 当前尝试上传的文件序号（从 1 开始）
  successfulFiles: number; // 上传成功文件数
  failedFiles: number; // 上传失败文件数
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
 * 下载流程：启动任务 -> 轮询后端准备进度 -> 前端流式下载+压缩 -> 自动触发下载。
 */
interface IDownloadProgress {
  phase: "idle" | "preparing" | "downloading" | "zipping" | "done" | "failed";
  isActive: boolean;
  backendProgress: IJobProgress | null;
  clientProgress: IArchiveClientProgress | null;
  isCompleted: boolean;
  errorMessage: string;
  shouldAutoHide: boolean;
  abortHandler: (() => void) | null;
  isAborted: boolean;
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
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    rowGap: "8px",
  },
  progressBar: {
    width: "100%",
  },
  progressText: {
    fontSize: "14px",
    color: tokens.colorNeutralForeground1,
  },
  progressCompleted: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: "600",
  },
  progressStatusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: "12px",
  },
  progressStatusText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  progressStatusRight: {
    display: "flex",
    alignItems: "center",
    columnGap: "10px",
    flexShrink: 0,
  },
  progressPercent: {
    fontWeight: "600",
  },
  actionsButtonGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  // Files 容器样式：100% 宽度、最大宽度限制并水平居中
  filesContainer: {
    width: "100%",
    maxWidth: "min(1000px, 92%)",
    margin: "0 auto",
  },
});

/**
 * 列宽预设配置——模块级常量，引用永远不变。
 * idealWidth 用于初始期望宽度，实际宽度会被 resizableColumns 交互动态调整。
 * 放在组件外部确保它永远是同一个对象引用，避免每次 render 产生新对象
 * 触发 DataGrid 内部列宽初始化。
 */
const columnSizingOptions = {
  driveItemName: {
    minWidth: 150,
    defaultWidth: 350,
    idealWidth: 300,
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
  // 记录当前可用的下载中止函数，确保点击 Abort 或组件卸载时都能安全清理。
  const downloadAbortHandlerRef = useRef<(() => void) | null>(null);
  // 标记当前下载是否由用户主动中止，用于避免将中止误判为失败。
  const downloadAbortRequestedRef = useRef(false);
  // 记录 loadItems 的最新请求序号，避免旧请求，因为慢一步返回而覆盖新目录数据。
  const loadItemsRequestSeqRef = useRef(0);
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
    successfulFiles: 0,
    failedFiles: 0,
    totalFiles: 0,
    fileSize: "",
    isCompleted: false,
  });
  // 下载进度状态（用于 ZIP 任务）。
  const [downloadProgress, setDownloadProgress] = useState<IDownloadProgress>({
    phase: "idle",
    isActive: false,
    backendProgress: null,
    clientProgress: null,
    isCompleted: false,
    errorMessage: "",
    shouldAutoHide: false,
    abortHandler: null,
    isAborted: false,
  });
  // 用于面包屑导航。
  const [breadcrumbPath, setBreadcrumbPath] = useState<IBreadcrumbItem[]>([
    { id: "root", name: "Root" },
  ]);
  // 用于文件预览。
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentPreviewFile, setCurrentPreviewFile] =
    useState<IDriveItemExtended | null>(null);

  // 组件卸载时清理下载轮询定时器，防止内存泄漏和对已卸载组件的状态更新
  // useEffect 第一个参数为 setup 函数，可以返回一个函数作为清理函数
  useEffect(() => {
    return () => {
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
        downloadPollRef.current = null;
      }

      if (downloadAbortHandlerRef.current) {
        downloadAbortHandlerRef.current();
        downloadAbortHandlerRef.current = null;
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

  /** 计算百分比文本，避免出现 NaN% 或 Infinity%。 */
  const formatPercent = (current: number, total: number): string => {
    if (total <= 0) {
      return "0%";
    }
    const value = Math.min(100, Math.max(0, (current / total) * 100));
    return `${value.toFixed(0)}%`;
  };

  /**
   * 将进度转换为 ProgressBar 所需的 0-1 数值。
   * @param current 当前进度值。
   * @param total 总量。
   * @returns 0 到 1 之间的进度值。
   */
  const toProgressValue = (current: number, total: number): number => {
    if (total <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, current / total));
  };

  /**
   * 创建下载进度默认状态，并允许按需覆盖字段。
   * @param overrides 需要覆盖的状态字段。
   * @returns 完整的下载进度状态对象。
   */
  const createDownloadProgressState = (
    overrides: Partial<IDownloadProgress> = {},
  ): IDownloadProgress => ({
    phase: "idle",
    isActive: false,
    backendProgress: null,
    clientProgress: null,
    isCompleted: false,
    errorMessage: "",
    shouldAutoHide: false,
    abortHandler: null,
    isAborted: false,
    ...overrides,
  });

  /**
   * 截断进度文案中的文件名，避免超长文件名破坏布局。
   * @param fileName 原始文件名或相对路径。
   * @returns 最多 32 个字符的文件名，超出部分追加省略号。
   */
  const truncateProgressFileName = (fileName: string): string => {
    const maxLength = 32;
    if (fileName.length <= maxLength) {
      return fileName;
    }
    return `${fileName.slice(0, maxLength)}...`;
  };

  /**
   * 计算 ZIP 下载区域的进度条值。
   * @returns 0 到 1 之间的进度值。
   */
  const getArchiveProgressBarValue = (): number => {
    if (downloadProgress.phase === "preparing") {
      const processed = downloadProgress.backendProgress?.processedFiles ?? 0;
      const total = downloadProgress.backendProgress?.totalFiles ?? 0;
      return 0.25 * toProgressValue(processed, total);
    }

    if (downloadProgress.phase === "downloading") {
      const downloaded = downloadProgress.clientProgress?.downloadedBytes ?? 0;
      const total = downloadProgress.clientProgress?.totalBytes ?? 0;
      return 0.25 + 0.65 * toProgressValue(downloaded, total);
    }

    if (downloadProgress.phase === "done" || downloadProgress.isCompleted) {
      return 1;
    }

    return 0;
  };

  /**
   * 获取归档任务的整体百分比文本（0-100%）。
   * @returns 百分比字符串，如 50%。
   */
  const getArchiveProgressPercentText = (): string => {
    const percent = Math.round(getArchiveProgressBarValue() * 100);
    return `${percent}%`;
  };

  /**
   * 生成 ZIP 下载区域的说明文案。
   * @returns 当前进度文本。
   */
  const getArchiveProgressText = (): string => {
    if (downloadProgress.phase === "preparing") {
      const processed = downloadProgress.backendProgress?.processedFiles ?? 0;
      const total = downloadProgress.backendProgress?.totalFiles ?? 0;
      return `Preparing manifest: ${processed}/${total} (${getArchiveProgressPercentText()})`;
    }

    if (
      downloadProgress.phase === "downloading" ||
      downloadProgress.phase === "zipping"
    ) {
      const currentItem =
        downloadProgress.clientProgress?.currentItem?.trim() ?? "";
      if (currentItem) {
        return `Downloading and zipping: ${truncateProgressFileName(currentItem)}`;
      }
      return "Downloading and zipping";
    }

    if (downloadProgress.phase === "done" || downloadProgress.isCompleted) {
      return "Download Completed";
    }

    return "Processing archive...";
  };

  /**
   * 用户点击 Abort 时中止当前下载流程，并立即重置可视状态。
   * @returns void
   */
  const onAbortClick = () => {
    downloadAbortRequestedRef.current = true;

    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }

    if (downloadAbortHandlerRef.current) {
      downloadAbortHandlerRef.current();
      downloadAbortHandlerRef.current = null;
    }

    setDownloadProgress((prev) =>
      createDownloadProgressState({
        isAborted: true,
        shouldAutoHide: false,
        backendProgress: prev.backendProgress,
        clientProgress: prev.clientProgress,
      }),
    );
  };

  /**
   * 用户点击 Dismiss 后手动关闭下载进度区域。
   * @returns void
   */
  const onDismissClick = () => {
    downloadAbortRequestedRef.current = false;
    downloadAbortHandlerRef.current = null;
    setDownloadProgress(createDownloadProgressState());
  };

  /**
   * 这段代码的作用是将从本地计算机中选中的文件整理成一个包含“相对路径”的列表，以便后续上传时能够保留文件夹结构。
   * 对于文件夹上传（webkitdirectory），会保留完整的相对路径结构。
   * 对于单文件上传，relativePath 就是文件名。
   *
   * 示例：
   * 输入 (伪表示 FileList 中的三项)：
   *   files[0] => { name: "readme.txt", webkitRelativePath: "" }
   *   files[1] => { name: "img1.jpg", webkitRelativePath: "photos/img1.jpg" }
   *   files[2] => { name: "document.pdf", webkitRelativePath: "documents/reports/document.pdf" }
   *
   * 返回值（函数输出）：
   *   [
   *     { file: File(readme.txt), relativePath: "readme.txt" },
   *     { file: File(img1.jpg), relativePath: "photos/img1.jpg" },
   *     { file: File(document.pdf), relativePath: "documents/reports/document.pdf" }
   *   ]
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
  // useCallback 保证：只要 props.container.id 不变，每次 render 拿到的都是
  // 同一个函数引用，从而使依赖它的 useEffect / useCallback 不会无谓重跑。
  const loadItems = useCallback(
    async (itemId?: string, folderName?: string) => {
      try {
        const graphClient = Providers.globalProvider.graph.client;
        const driveId = props.container.id;
        const driveItemId = itemId || "root";
        // 为本次请求分配序号；仅允许最新一次请求落盘。
        const requestSeq = ++loadItemsRequestSeqRef.current;

        // 获取当前层级的容器项目。
        const graphResponse = await graphClient
          .api(`/drives/${driveId}/items/${driveItemId}/children`)
          .get();
        // 如果当前请求不是最新请求，直接丢弃结果，避免覆盖新目录状态。
        if (requestSeq !== loadItemsRequestSeqRef.current) {
          return;
        }
        const containerItems =
          graphResponse.value as DriveItemWithDownloadUrl[];
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [props.container.id],
  );

  // =============== 副作用：容器变化时重新加载文件列表 ===============
  // 必须在 loadItems 声明之后，因为 useCallback 产生的是 const，存在TDZ。
  // deps 写 loadItems 而非 props：loadItems 内部已封装"何时重载"的逻辑
  //（props.container.id 变化 → 新引用），useEffect 只需跟随 loadItems，
  // 避免父组件任意 re-render 时触发不必要的 Graph API 请求。
  useEffect(() => {
    (async () => {
      loadItems();
    })();
  }, [loadItems]);

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
    const defaultFilename = `SPE-${Date.now()}.zip`;
    let saveTarget: IArchiveSaveTarget;
    try {
      /**用户手势限制 (User Gesture Restriction) 是浏览器的一种安全机制。
       * 它规定某些敏感操作（如弹出窗口、自动播放音频、启动下载等）必须由用户的直接交互（如点击或按键）触发
       * 在用户点击手势上下文中先申请保存目标，避免后续异步流程触发手势限制。*/
      saveTarget = await spEmbedded.selectArchiveSaveTarget(defaultFilename);
    } catch (err: any) {
      setDownloadProgress(
        createDownloadProgressState({
          phase: "failed",
          errorMessage:
            err.message === "Download cancelled by user."
              ? "Download cancelled."
              : `Failed to open save dialog: ${err.message}`,
        }),
      );
      return;
    }

    await startZipDownload(selectedIds, saveTarget);
  };

  /**
   * 启动 ZIP 归档下载
   *
   * 完整流程：
   * 1. 调用 spEmbedded.startDownloadArchive() 启动后端准备任务
   * 2. 轮询后端进度直到状态 ready
   * 3. 获取 manifest 后在前端边下载边压缩
   * 4. 压缩完成后自动触发浏览器下载
   */
  const startZipDownload = async (
    itemIds: string[],
    saveTarget: IArchiveSaveTarget,
  ) => {
    // 清理上一轮下载进度状态。
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }

    downloadAbortRequestedRef.current = false;
    downloadAbortHandlerRef.current = null;

    setDownloadProgress(
      createDownloadProgressState({
        phase: "preparing",
        isActive: true,
      }),
    );

    let jobId: string;
    try {
      jobId = await spEmbedded.startDownloadArchive(
        props.container.id,
        itemIds,
      );
    } catch (err: any) {
      setDownloadProgress(
        createDownloadProgressState({
          phase: "failed",
          errorMessage: `Failed to start download: ${err.message}`,
        }),
      );
      return;
    }

    let isPolling = false;

    // 每 800ms 轮询一次任务进度。
    downloadPollRef.current = setInterval(async () => {
      if (isPolling || downloadAbortRequestedRef.current) {
        return;
      }

      try {
        isPolling = true;
        const progress = await spEmbedded.getArchivePreparationProgress(jobId);

        if (downloadAbortRequestedRef.current) {
          return;
        }

        setDownloadProgress((prev) => ({
          ...prev,
          phase: progress.status === "failed" ? "failed" : "preparing",
          backendProgress: progress,
        }));

        if (progress.status === "ready") {
          clearInterval(downloadPollRef.current!);
          downloadPollRef.current = null;

          if (downloadAbortRequestedRef.current) {
            return;
          }

          const manifest = await spEmbedded.getDownloadManifest(jobId);

          if (downloadAbortRequestedRef.current) {
            return;
          }

          const finalSaveTarget: IArchiveSaveTarget = {
            ...saveTarget,
            // filename 优先级：用户定义名（若存在）> 前端建议默认名 > 后端默认名。
            filename: saveTarget.filename || manifest.archiveName,
          };

          const downloadSession = spEmbedded.downloadArchiveFromManifest(
            manifest,
            finalSaveTarget,
            (clientProgress) => {
              if (downloadAbortRequestedRef.current) {
                return;
              }

              setDownloadProgress((prev) => ({
                ...prev,
                isActive: clientProgress.stage !== "done",
                phase:
                  clientProgress.stage === "done"
                    ? "done"
                    : clientProgress.stage,
                clientProgress,
              }));
            },
          );

          downloadAbortHandlerRef.current = downloadSession.abort;
          setDownloadProgress((prev) => ({
            ...prev,
            abortHandler: downloadSession.abort,
          }));

          await downloadSession.completion;

          if (downloadAbortRequestedRef.current) {
            return;
          }

          setDownloadProgress((prev) => ({
            ...prev,
            phase: "done",
            isActive: false,
            isCompleted: true,
            errorMessage: "",
            shouldAutoHide: false,
            abortHandler: null,
            isAborted: false,
          }));
        } else if (progress.status === "failed") {
          clearInterval(downloadPollRef.current!);
          downloadPollRef.current = null;
          setDownloadProgress(
            createDownloadProgressState({
              phase: "failed",
              backendProgress: progress,
              errorMessage:
                progress.errors.length > 0
                  ? progress.errors.join("; ")
                  : "Archive job failed.",
            }),
          );
        }
      } catch (err: any) {
        clearInterval(downloadPollRef.current!);
        downloadPollRef.current = null;

        if (!downloadAbortRequestedRef.current) {
          setDownloadProgress(
            createDownloadProgressState({
              phase: "failed",
              errorMessage: `Download failed: ${err.message}`,
            }),
          );
        }
      } finally {
        isPolling = false;
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
   * 确认删除：调用后端 API 批量删除选中的文件/文件夹。
   *
   * 流程：
   * 1. 收集当前选中项 ID。
   * 2. 在异步删除前快照当前文件夹 ID，避免删除过程中用户导航导致刷新到错误目录。
   * 3. 调用后端删除接口并记录失败项日志。
   * 4. 删除完成后刷新快照目录，关闭对话框并清空选择状态。
   */
  const onDeleteItemClick = async () => {
    const selectedIds = Array.from(selectedRows) as string[];
    if (selectedIds.length === 0) return;
    const currentFolderId = folderId || "root";

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
    await loadItems(currentFolderId);
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
   * 上传文件核心逻辑。
   *
   * @param files 用户选择的文件列表（来自 <input type="file" />）。
   *
   * 流程：
   * 1. 解析文件列表及其相对路径（支持文件夹结构）。
   * 2. 在异步上传开始前快照当前文件夹 ID，确保整批上传及最终刷新基于同一目录上下文。
   * 3. 遍历每个文件，按路径逐级确保中间文件夹存在。
   * 4. 使用 Graph API PUT 请求上传文件内容，并实时更新上传进度状态。
   * 5. 全部完成后展示完成提示，并刷新快照目录对应的文件列表。
   */
  const uploadFiles = async (files: FileList) => {
    // 见getFolderStructure函数注释，有输入输出示例
    const fileStructure = getFolderStructure(files);
    const totalFiles = fileStructure.length;
    const currentFolderId = folderId || "root";

    setUploadProgress({
      isUploading: true,
      currentFile: "",
      currentIndex: 0,
      successfulFiles: 0,
      failedFiles: 0,
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
        let currentPath = currentFolderId;

        // 必要时创建中间文件夹，返回 新文件夹的id（最后一段是文件名，跳过）。
        // SharePoint 文件系统是扁平化的，只要有父文件夹 id 就能定位并上传文件，不需要全路径。
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

        const fileData = await file.arrayBuffer();

        await graphClient.api(endpoint).putStream(fileData);
        setUploadProgress((prev) => ({
          ...prev,
          successfulFiles: prev.successfulFiles + 1,
        }));
      } catch (error: any) {
        setUploadProgress((prev) => ({
          ...prev,
          failedFiles: prev.failedFiles + 1,
        }));
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
    await loadItems(currentFolderId);
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
        (item: any) => item.folder && item.name === folderName,
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
   *
   * @param targetFolderId 目标文件夹 ID。
   * @param targetFolderName 目标文件夹名称。
   *
   * 流程：
   * 1. 清空当前行选择状态，避免跨目录保留选中项。
   * 2. 异步加载目标目录内容并更新当前目录 ID。
   * 3. 通过函数式 setState 更新面包屑，避免 await 之后读取到过期 breadcrumbPath：
   *    - 目标为 root：重置为 Root 单节点。
   *    - 目标已存在于路径：截断到目标节点（后退导航）。
   *    - 目标不在路径中：追加到末尾（前进导航）。
   */
  // useCallback dep 为 loadItems：loadItems 只在容器切换时重建，
  // navigateToFolder 随之重建，确保调用的始终是捕获最新 container.id 的版本。
  const navigateToFolder = useCallback(
    async (targetFolderId: string, targetFolderName: string) => {
      setSelectedRows(new Set());
      await loadItems(targetFolderId, targetFolderName);
      // 使用函数式更新，避免 await 之后读取到过期 breadcrumbPath。
      setBreadcrumbPath((prevPath) => {
        if (targetFolderId === "root") {
          return [{ id: "root", name: "Root" }];
        }
        // 判断该文件夹是否已在路径中（后退导航场景）。
        const existingIndex = prevPath.findIndex(
          (item) => item.id === targetFolderId,
        );
        if (existingIndex !== -1) {
          // 后退导航：截断路径。
          return prevPath.slice(0, existingIndex + 1);
        }
        // 前进导航：追加路径。
        return [...prevPath, { id: targetFolderId, name: targetFolderName }];
      });
    },
    [loadItems],
  );

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
  /** 预览对话框中点击左右箭头导航时，更新当前预览文件 */
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
      // 在异步删除前快照当前目录，避免删除过程中导航导致刷新目录漂移。
      const currentFolderId = folderId || "root";
      try {
        await spEmbedded.deleteItems(props.container.id, [
          currentPreviewFile.id as string,
        ]);
      } catch (err: any) {
        console.error("Preview delete failed:", err.message);
      }
      await loadItems(currentFolderId);
      setPreviewOpen(false);
    }
  };

  /** 仅保留非文件夹项用于预览导航（前/后切换时跳过文件夹） */
  const previewableFiles = driveItems.filter((item) => !item.isFolder);
  const styles = useStyles();

  // =============== DataGrid 列定义 ===============
  // useMemo 保证：只要 navigateToFolder 和 styles 引用不变，columns 数组就是同一个引用。
  // DataGrid 内部用引用比较检测 columns 是否变化，引用不变则不重置列宽状态。
  const columns = useMemo<TableColumnDefinition<IDriveItemExtended>[]>(
    () => [
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
                    e.stopPropagation(); // 防止事件冒泡到 DataGridRow 的选中逻辑，避免进入文件夹同时选中文件夹
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
            <div className={styles.actionsButtonGroup}>
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
            </div>
          );
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [navigateToFolder, styles],
  );

  // 组件渲染区域。
  // width: "100%" 确保 DataGrid 的 useMeasureElement 初始即能测量到完整父容器宽度。
  // 若省略，父容器 Containers 的 alignItems:"center" 会使本 div 收缩至内容宽度，
  // 导致高 DPI 下（CSS 视口更窄）DataGrid 误判容器不足，把各列压缩至 minWidth。
  // maxWidth 限制最大宽度，防止 DataGrid 的 autoFitColumns 把各列拉伸到视口宽度；
  // 父容器 alignItems:"center" 会将本 div 在水平方向居中显示。
  return (
    <div className={styles.filesContainer}>
      <input
        ref={uploadFileRef}
        type="file"
        multiple
        onChange={onUploadFileSelected}
        style={{ display: "none" }}
      />
      {/*
        隐藏的文件夹上传 input：使用 webkitdirectory 属性允许选择整个文件夹，
        因为 webkitdirectory 不是标准属性，TypeScript 可能会报错，
        所以使用类型断言 any 绕过 (其实可以扩展interface)。
        通过对象展开的方式注入属性。在某些 React 版本中，直接在组件上写未知的非标准属性可能会被 React 过滤掉。
        通过展开对象的方式，可以确保属性最终成功挂载到真实的 DOM 元素上
      */}
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
        - 上传中：使用 ProgressBar，并按成功文件数推进
        - 完成后：显示满进度条与完成提示
      */}
      {(uploadProgress.isUploading || uploadProgress.isCompleted) && (
        <div className={styles.progressContainer}>
          <ProgressBar
            className={styles.progressBar}
            shape="rounded"
            thickness="medium"
            value={
              uploadProgress.isCompleted
                ? 1
                : toProgressValue(
                    uploadProgress.successfulFiles,
                    uploadProgress.totalFiles,
                  )
            }
          />
          {uploadProgress.isUploading ? (
            <Text className={styles.progressText}>
              Uploading: {uploadProgress.successfulFiles}/
              {uploadProgress.totalFiles} succeeded
              {uploadProgress.failedFiles > 0
                ? `, ${uploadProgress.failedFiles} failed`
                : ""}
              {uploadProgress.currentFile
                ? ` - Current: ${uploadProgress.currentFile} (${uploadProgress.fileSize})`
                : ""}
            </Text>
          ) : uploadProgress.isCompleted ? (
            <Text className={styles.progressCompleted}>
              Upload completed: {uploadProgress.successfulFiles}/
              {uploadProgress.totalFiles} succeeded
              {uploadProgress.failedFiles > 0
                ? `, ${uploadProgress.failedFiles} failed`
                : ""}
            </Text>
          ) : null}
        </div>
      )}

      {/*
        ZIP 归档下载进度：使用 ProgressBar 展示当前阶段进度，文字放置在进度条下方。
      */}
      {(downloadProgress.isActive ||
        downloadProgress.isCompleted ||
        downloadProgress.errorMessage) && (
        <div className={styles.progressContainer}>
          {(downloadProgress.isActive || downloadProgress.isCompleted) && (
            <ProgressBar
              className={styles.progressBar}
              shape="rounded"
              thickness="medium"
              value={getArchiveProgressBarValue()}
            />
          )}
          {downloadProgress.isActive || downloadProgress.isCompleted ? (
            <div className={styles.progressStatusRow}>
              <Text
                className={
                  downloadProgress.isCompleted
                    ? styles.progressCompleted
                    : styles.progressText
                }
                block
                truncate
              >
                {getArchiveProgressText()}
              </Text>
              <div className={styles.progressStatusRight}>
                {downloadProgress.isActive ? (
                  <Link onClick={onAbortClick}>Abort</Link>
                ) : downloadProgress.isCompleted ? (
                  <Link onClick={onDismissClick}>Dismiss</Link>
                ) : null}
                <Text className={styles.progressPercent}>
                  {getArchiveProgressPercentText()}
                </Text>
              </div>
            </div>
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
