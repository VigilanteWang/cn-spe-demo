import { IDownloadProgress } from "./filesTypes";

/**
 * 将字节大小格式化为易读文案。
 * @param bytes 字节数。
 * @returns 格式化后的文案。
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const unitBase = 1024;
  const units = ["Bytes", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitBase));

  return `${parseFloat((bytes / Math.pow(unitBase, unitIndex)).toFixed(2))} ${units[unitIndex]}`;
};

/**
 * 将当前值转换为百分比文案。
 * @param current 当前值。
 * @param total 总量。
 * @returns 百分比字符串。
 */
export const formatPercent = (current: number, total: number): string => {
  if (total <= 0) {
    return "0%";
  }

  const value = Math.min(100, Math.max(0, (current / total) * 100));
  return `${value.toFixed(0)}%`;
};

/**
 * 将当前值转换为 ProgressBar 需要的 0-1 值。
 * @param current 当前值。
 * @param total 总量。
 * @returns 0 到 1 之间的进度值。
 */
export const toProgressValue = (current: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, current / total));
};

/**
 * 创建默认下载状态。
 * @param overrides 需要覆盖的字段。
 * @returns 合并后的完整状态。
 */
export const createDownloadProgressState = (
  overrides: Partial<IDownloadProgress> = {},
): IDownloadProgress => ({
  phase: "idle",
  isActive: false,
  backendProgress: null,
  clientProgress: null,
  isCompleted: false,
  errorMessage: "",
  shouldAutoHide: false,
  isAborted: false,
  ...overrides,
});

/**
 * 截断过长文件名，避免布局抖动。
 * @param fileName 原始文件名。
 * @returns 截断后的文件名。
 */
export const truncateProgressFileName = (fileName: string): string => {
  const maxLength = 32;

  if (fileName.length <= maxLength) {
    return fileName;
  }

  return `${fileName.slice(0, maxLength)}...`;
};

/**
 * 计算 ZIP 下载进度条值。
 * @param downloadProgress 当前下载状态。
 * @returns 0 到 1 之间的进度值。
 */
export const getArchiveProgressBarValue = (
  downloadProgress: IDownloadProgress,
): number => {
  if (downloadProgress.phase === "preparing") {
    const processed = downloadProgress.backendProgress?.processedFiles ?? 0;
    const total = downloadProgress.backendProgress?.totalFiles ?? 0;
    return 0.25 * toProgressValue(processed, total);
  }

  if (
    downloadProgress.phase === "downloading" ||
    downloadProgress.phase === "zipping"
  ) {
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
 * 计算 ZIP 下载百分比文案。
 * @param downloadProgress 当前下载状态。
 * @returns 百分比字符串。
 */
export const getArchiveProgressPercentText = (
  downloadProgress: IDownloadProgress,
): string => {
  return `${Math.round(getArchiveProgressBarValue(downloadProgress) * 100)}%`;
};

/**
 * 生成 ZIP 下载状态文案。
 * @param downloadProgress 当前下载状态。
 * @returns 用于 UI 展示的文案。
 */
export const getArchiveProgressText = (
  downloadProgress: IDownloadProgress,
): string => {
  if (downloadProgress.isAborted) {
    return "Download cancelled";
  }

  if (downloadProgress.phase === "preparing") {
    const processed = downloadProgress.backendProgress?.processedFiles ?? 0;
    const total = downloadProgress.backendProgress?.totalFiles ?? 0;
    return `Preparing manifest: ${processed}/${total}`;
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
    return "Download completed";
  }

  if (downloadProgress.errorMessage) {
    return downloadProgress.errorMessage;
  }

  return "Processing archive...";
};
