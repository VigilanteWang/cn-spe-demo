/**
 * 文件管理组件 - 核心业务逻辑
 *
 * 功能概述：
 * 这是应用的核心组件，让用户能够在选定的 SharePoint Embedded 容器内：
 * 1. 浏览文件和文件夹（支持文件夹导航）
 * 2. 上传单个文件或完整的文件夹结构
 * 3. 下载单个文件或多个文件/文件夹（打包为 ZIP）
 * 4. 删除文件和文件夹
 * 5. 创建新文件夹
 * 6. 预览文件内容（通过 Preview 组件）
 *
 * 架构设计：
 * - 使用 Microsoft Graph API 进行所有文件操作
 * - 长时间操作（如下载多个文件）通过后端 job 队列异步处理
 * - 进度反馈通过轮询后端 progress API 实现
 * - 使用 Fluent UI DataGrid 组件显示文件列表
 *
 * 核心概念：
 * - 文件夹导航：维护面包屑路径，支持快速返回
 * - 文件夹上传：保留文件夹结构，递归创建目录
 * - ZIP 下载：后端生成 ZIP job，前端轮询并下载
 * - 进度反馈：实时显示上传/下载进度、文件数、当前文件等
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

const spEmbedded = new SpEmbedded();

interface IFilesProps {
  container: IContainer;
}

interface IBreadcrumbItem {
  id: string;
  name: string;
}

interface IUploadProgress {
  isUploading: boolean;
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
  fileSize: string;
  isCompleted: boolean;
}

interface IDownloadProgress {
  isActive: boolean; // polling in progress
  jobProgress: IJobProgress | null;
  isCompleted: boolean;
  errorMessage: string;
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
export const Files = (props: IFilesProps) => {
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
  useEffect(() => {
    (async () => {
      loadItems();
    })();
  }, [props]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Helper function to get file paths from folder structure
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

  const onSelectionChange: DataGridProps["onSelectionChange"] = (
    event: React.MouseEvent | React.KeyboardEvent,
    data: OnSelectionChangeData,
  ): void => {
    setSelectedRows(data.selectedItems);
  };

  const onDownloadItemClick = (downloadUrl: string) => {
    const link = downloadLinkRef.current;
    link!.href = downloadUrl;
    link!.click();
  };

  // ── Toolbar: Download selected items ──────────────────────────────────────
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

  // ── Toolbar: Delete selected items ─────────────────────────────────────────
  const onToolbarDeleteClick = () => {
    if (selectedRows.size === 0) return;
    setDeleteDialogOpen(true);
  };

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

  const onHandleFolderNameChange: InputProps["onChange"] = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ): void => {
    setFolderName(data?.value);
  };

  const onUploadFileClick = () => {
    if (uploadFileRef.current) {
      uploadFileRef.current.click();
    }
  };

  const onUploadFolderClick = () => {
    if (uploadFolderRef.current) {
      uploadFolderRef.current.click();
    }
  };

  const onUploadFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // Reset the input value to allow re-uploading the same files
    event.target.value = "";
  };

  const onUploadFolderSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // Reset the input value
    event.target.value = "";
  };

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

  // Navigation functions
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

  // Preview handlers
  const handlePreviewNavigate = (file: IDriveItemExtended) => {
    setCurrentPreviewFile(file);
  };

  const handlePreviewDownload = (downloadUrl: string) => {
    onDownloadItemClick(downloadUrl);
  };

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

  // Get only non-folder files for preview navigation
  const previewableFiles = driveItems.filter((item) => !item.isFolder);
  // BOOKMARK 2 - handlers go here
  const columns: TableColumnDefinition<IDriveItemExtended>[] = [
    createTableColumn({
      columnId: "driveItemName",
      renderHeaderCell: () => {
        return "Name";
      },
      renderCell: (driveItem) => {
        return (
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
                  e.stopPropagation();
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

      {/* Breadcrumb Navigation */}
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

      <div className={styles.toolbarContainer}>
        <Toolbar>
          <ToolbarButton
            vertical
            icon={<ArrowLeftRegular />}
            onClick={navigateToParentFolder}
            disabled={breadcrumbPath.length <= 1}
          >
            Back
          </ToolbarButton>
          <ToolbarButton
            vertical
            icon={<AddRegular />}
            onClick={() => setNewFolderDialogOpen(true)}
          >
            New Folder
          </ToolbarButton>
          <ToolbarButton
            vertical
            icon={<ArrowUploadRegular />}
            onClick={onUploadFileClick}
          >
            Upload File
          </ToolbarButton>
          <ToolbarButton
            vertical
            icon={<FolderAddRegular />}
            onClick={onUploadFolderClick}
          >
            Upload Folder
          </ToolbarButton>
          <ToolbarButton
            vertical
            icon={<ArrowDownloadRegular />}
            onClick={onToolbarDownloadClick}
            disabled={selectedRows.size === 0 || downloadProgress.isActive}
          >
            Download
          </ToolbarButton>
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

      {/* Upload Progress */}
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

      {/* Download / Archive Progress */}
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
      <Dialog
        open={deleteDialogOpen}
        modalType="modal"
        onOpenChange={() => setDeleteDialogOpen(false)}
      >
        <DialogSurface>
          <DialogBody>
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

      {/* Preview Dialog */}
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
