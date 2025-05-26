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
import { IContainer } from "./../common/IContainer";
require("isomorphic-fetch");

interface IFilesProps {
  container: IContainer;
}

interface IDriveItemExtended extends DriveItem {
  isFolder: boolean;
  modifiedByName: string;
  iconElement: JSX.Element;
  downloadUrl: string;
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
    padding: "12px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    backgroundColor: "#f9f9f9",
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
    new Set<TableRowId>([1]),
  );
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
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
    currentFile: '',
    currentIndex: 0,
    totalFiles: 0,
    fileSize: '',
    isCompleted: false,
  });
  // for breadcrumb navigation
  const [breadcrumbPath, setBreadcrumbPath] = useState<IBreadcrumbItem[]>([
    { id: "root", name: "Root" },
  ]);
  // BOOKMARK 1 - constants & hooks
  useEffect(() => {
    (async () => {
      loadItems();
    })();
  }, [props]);

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper function to get file paths from folder structure
  const getFolderStructure = (files: FileList): Array<{file: File, relativePath: string}> => {
    const result: Array<{file: File, relativePath: string}> = [];
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

  const onDeleteItemClick = async () => {
    /**
     * 使用了解构赋值的方式，从 selectedRows 中获取第一个被选中的 id。
     * 示例：
     * const [first, second] = [1, 2, 3]; // first = 1, second = 2
     * 相比于 `selectedRows.entries().next().value[0]`，这种写法更安全，
     * 因为如果 selectedRows 为空数组，解构赋值会得到 undefined，
     * 而直接用迭代器可能会导致 value 为 undefined，访问 [0] 时会报错。
     */
    const [firstSelectedId] = selectedRows;

    if (!firstSelectedId) {
      console.warn("No item selected for deletion");
      return;
    }

    const graphClient = Providers.globalProvider.graph.client;
    const endpoint = `/drives/${props.container.id}/items/${firstSelectedId}`;
    await graphClient.api(endpoint).delete();
    await loadItems(folderId || "root");
    setDeleteDialogOpen(false);
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
    event.target.value = '';
  };

  const onUploadFolderSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(files);
    // Reset the input value
    event.target.value = '';
  };

  const uploadFiles = async (files: FileList) => {
    const fileStructure = getFolderStructure(files);
    const totalFiles = fileStructure.length;

    setUploadProgress({
      isUploading: true,
      currentFile: '',
      currentIndex: 0,
      totalFiles,
      fileSize: '',
      isCompleted: false,
    });

    const graphClient = Providers.globalProvider.graph.client;

    for (let i = 0; i < fileStructure.length; i++) {
      const { file, relativePath } = fileStructure[i];
      
      // Update progress
      setUploadProgress(prev => ({
        ...prev,
        currentFile: relativePath,
        currentIndex: i + 1,
        fileSize: formatFileSize(file.size),
      }));

      try {
        // If the file is part of a folder structure, we need to create the folder path
        const pathParts = relativePath.split('/');
        let currentPath = folderId || "root";
        
        // Create folder structure if needed (skip the last part which is the file name)
        for (let j = 0; j < pathParts.length - 1; j++) {
          const folderName = pathParts[j];
          currentPath = await createFolderIfNotExists(graphClient, currentPath, folderName);
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
        console.error(`Failed to upload file ${relativePath}: ${error.message}`);
      }
    }

    // Show completion state
    setUploadProgress(prev => ({
      ...prev,
      isUploading: false,
      isCompleted: true,
    }));

    // Hide completion message after 3 seconds
    setTimeout(() => {
      setUploadProgress(prev => ({
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
    folderName: string
  ): Promise<string> => {
    try {
      // First, try to get the folder if it already exists
      const endpoint = `/drives/${props.container.id}/items/${parentId}/children`;
      const response = await graphClient.api(endpoint).get();
      
      const existingFolder = response.value.find((item: any) => 
        item.name === folderName && item.folder
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
              <Link href={driveItem!.webUrl!} target="_blank">
                {driveItem.name}
              </Link>
            ) : (
              <Link
                onClick={() =>
                  navigateToFolder(
                    driveItem.id as string,
                    driveItem.name as string,
                  )
                }
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
        return (
          <>
            <Button
              aria-label="Download"
              disabled={!selectedRows.has(driveItem.id as string)}
              icon={<SaveRegular />}
              onClick={() => onDownloadItemClick(driveItem.downloadUrl)}
            >
              Download
            </Button>
            <Button
              aria-label="Delete"
              icon={<DeleteRegular />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete
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
      minWidth: 250,
      defaultWidth: 250,
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
      <a
        ref={downloadLinkRef}
        href=""
        target="_blank"
        style={{ display: "none" }}
      />

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
        </Toolbar>
      </div>

      {/* Upload Progress */}
      {(uploadProgress.isUploading || uploadProgress.isCompleted) && (
        <div className={styles.progressContainer}>
          {uploadProgress.isUploading ? (
            <>
              <Spinner size="small" />
              <Text className={styles.progressText}>
                Uploading {uploadProgress.currentFile} ({uploadProgress.currentIndex}/{uploadProgress.totalFiles}) - {uploadProgress.fileSize}
              </Text>
            </>
          ) : uploadProgress.isCompleted ? (
            <>
              <CheckmarkRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
              <Text className={styles.progressCompleted}>
                Upload completed
              </Text>
            </>
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
        onOpenChange={() => setSelectedRows(new Set<TableRowId>([0]))}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogContent>
              <p>Are you sure you want to delete this item?</p>
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
        selectionMode="single"
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
    </div>
  );
};

export default Files;
