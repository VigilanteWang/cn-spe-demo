import {
  Toolbar,
  ToolbarButton,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ArrowUploadRegular,
  DeleteRegular,
  FolderAddRegular,
} from "@fluentui/react-icons";

interface IFilesToolbarProps {
  /** 是否可以返回上级目录。 */
  canGoBack: boolean;
  /** 是否有已选中的行。 */
  hasSelection: boolean;
  /** 是否正在处理下载。 */
  isDownloadActive: boolean;
  /** 返回上级目录。 */
  onBack: () => Promise<void>;
  /** 打开新建文件夹对话框。 */
  onCreateFolder: () => void;
  /** 触发文件上传。 */
  onUploadFile: () => void;
  /** 触发文件夹上传。 */
  onUploadFolder: () => void;
  /** 工具栏下载动作。 */
  onDownload: () => Promise<void>;
  /** 打开删除对话框。 */
  onDelete: () => void;
}

/**
 * 文件操作工具栏。
 * @param props 组件属性。
 * @returns 工具栏 UI。
 */
export const FilesToolbar = ({
  canGoBack,
  hasSelection,
  isDownloadActive,
  onBack,
  onCreateFolder,
  onUploadFile,
  onUploadFolder,
  onDownload,
  onDelete,
}: IFilesToolbarProps) => {
  return (
    <Toolbar>
      <ToolbarButton
        vertical
        icon={<ArrowLeftRegular />}
        onClick={() => void onBack()}
        disabled={!canGoBack}
      >
        Back
      </ToolbarButton>
      <ToolbarButton vertical icon={<AddRegular />} onClick={onCreateFolder}>
        New Folder
      </ToolbarButton>
      <ToolbarButton vertical icon={<ArrowUploadRegular />} onClick={onUploadFile}>
        Upload File
      </ToolbarButton>
      <ToolbarButton vertical icon={<FolderAddRegular />} onClick={onUploadFolder}>
        Upload Folder
      </ToolbarButton>
      <ToolbarButton
        vertical
        icon={<ArrowDownloadRegular />}
        onClick={() => void onDownload()}
        disabled={!hasSelection || isDownloadActive}
      >
        Download
      </ToolbarButton>
      <ToolbarButton
        vertical
        icon={<DeleteRegular />}
        onClick={onDelete}
        disabled={!hasSelection}
      >
        Delete
      </ToolbarButton>
    </Toolbar>
  );
};
