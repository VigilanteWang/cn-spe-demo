import { Link, ProgressBar, Text, tokens } from "@fluentui/react-components";
import { IDownloadProgress, IUploadProgress } from "../filesTypes";

interface IFilesProgressProps {
  /** 上传进度。 */
  uploadProgress: IUploadProgress;
  /** 下载进度。 */
  downloadProgress: IDownloadProgress;
  /** 进度条容器样式类名。 */
  progressContainerClassName: string;
  /** 进度条样式类名。 */
  progressBarClassName: string;
  /** 普通说明文案样式类名。 */
  progressTextClassName: string;
  /** 完成态文案样式类名。 */
  progressCompletedClassName: string;
  /** 下载状态行样式类名。 */
  progressStatusRowClassName: string;
  /** 下载进度文本区域样式类名。 */
  progressStatusTextClassName: string;
  /** 下载右侧操作区域样式类名。 */
  progressStatusRightClassName: string;
  /** 百分比样式类名。 */
  progressPercentClassName: string;
  /** 将值转换为进度条值。 */
  toProgressValue: (current: number, total: number) => number;
  /** 获取下载进度条值。 */
  getArchiveProgressBarValue: () => number;
  /** 获取下载进度文案。 */
  getArchiveProgressText: () => string;
  /** 获取下载进度百分比。 */
  getArchiveProgressPercentText: () => string;
  /** 中止下载。 */
  onAbortClick: () => void;
  /** 关闭下载状态条。 */
  onDismissClick: () => void;
}

/**
 * 上传与下载进度展示组件。
 * @param props 组件属性。
 * @returns 进度区域 UI。
 *
 * 上传进度条：仅在上传进行中或刚完成时显示（完成后 3 秒自动隐藏）
 * ZIP 归档下载进度：使用 ProgressBar 展示当前阶段进度，文字放置在进度条下方。
 */
export const FilesProgress = ({
  uploadProgress,
  downloadProgress,
  progressContainerClassName,
  progressBarClassName,
  progressTextClassName,
  progressCompletedClassName,
  progressStatusRowClassName,
  progressStatusTextClassName,
  progressStatusRightClassName,
  progressPercentClassName,
  toProgressValue,
  getArchiveProgressBarValue,
  getArchiveProgressText,
  getArchiveProgressPercentText,
  onAbortClick,
  onDismissClick,
}: IFilesProgressProps) => {
  return (
    <>
      {(uploadProgress.isUploading || uploadProgress.isCompleted) && (
        <div className={progressContainerClassName}>
          <ProgressBar
            className={progressBarClassName}
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
            <Text className={progressTextClassName}>
              Uploading: {uploadProgress.successfulFiles}/
              {uploadProgress.totalFiles} succeeded
              {uploadProgress.failedFiles > 0
                ? `, ${uploadProgress.failedFiles} failed`
                : ""}
              {uploadProgress.currentFile
                ? ` - Current: ${uploadProgress.currentFile} (${uploadProgress.fileSize})`
                : ""}
            </Text>
          ) : (
            <Text className={progressCompletedClassName}>
              Upload completed: {uploadProgress.successfulFiles}/
              {uploadProgress.totalFiles} succeeded
              {uploadProgress.failedFiles > 0
                ? `, ${uploadProgress.failedFiles} failed`
                : ""}
            </Text>
          )}
        </div>
      )}

      {(downloadProgress.isActive ||
        downloadProgress.isCompleted ||
        downloadProgress.errorMessage ||
        downloadProgress.isAborted) && (
        <div className={progressContainerClassName}>
          {(downloadProgress.isActive || downloadProgress.isCompleted) && (
            <ProgressBar
              className={progressBarClassName}
              shape="rounded"
              thickness="medium"
              value={getArchiveProgressBarValue()}
            />
          )}
          {downloadProgress.isActive || downloadProgress.isCompleted ? (
            <div className={progressStatusRowClassName}>
              <Text
                className={
                  downloadProgress.isCompleted
                    ? progressCompletedClassName
                    : progressTextClassName
                }
                block
                truncate
              >
                {getArchiveProgressText()}
              </Text>
              <div className={progressStatusRightClassName}>
                {downloadProgress.isActive ? (
                  <Link onClick={onAbortClick}>Abort</Link>
                ) : (
                  <Link onClick={onDismissClick}>Dismiss</Link>
                )}
                <Text className={progressPercentClassName}>
                  {getArchiveProgressPercentText()}
                </Text>
              </div>
            </div>
          ) : (
            <Text
              className={progressStatusTextClassName}
              style={{ color: tokens.colorPaletteRedForeground1 }}
            >
              {getArchiveProgressText()}
            </Text>
          )}
        </div>
      )}
    </>
  );
};
