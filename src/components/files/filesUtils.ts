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
  // 用对数先定位当前字节数最适合落在哪个单位区间，避免手写多层 if/else。
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitBase));

  // 先按对应单位缩放，再保留两位小数；最后用 parseFloat 去掉像 1.00 这样的多余尾零。
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

  // 先算原始百分比，再夹到 0-100 之间，避免异常输入把 UI 撑出合法范围。
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

  // Fluent UI 的 ProgressBar 需要 0-1 之间的值，这里顺手做边界收敛。
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
  error: null,
  shouldAutoHide: false,
  isAborted: false,
  // 让调用方只传“这一轮和默认值不同的字段”，其余状态统一回退到标准初始值。
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
    // 后端准备阶段只占整条进度的一小段，给前端下载/压缩阶段预留主要视觉空间。
    return 0.25 * toProgressValue(processed, total);
  }

  if (
    downloadProgress.phase === "downloading" ||
    downloadProgress.phase === "zipping"
  ) {
    const downloaded = downloadProgress.clientProgress?.downloadedBytes ?? 0;
    const total = downloadProgress.clientProgress?.totalBytes ?? 0;
    // 下载/压缩从 25% 继续往后推进，避免阶段切换时进度条突然回跳到 0。
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
  // 文案百分比与进度条复用同一套计算逻辑，避免两个显示来源彼此漂移。
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
      // 当前文件名可能很长，这里复用截断逻辑，避免状态条被长路径撑坏布局。
      return `Downloading and zipping: ${truncateProgressFileName(currentItem)}`;
    }

    return "Downloading and zipping";
  }

  if (downloadProgress.phase === "done" || downloadProgress.isCompleted) {
    return "Download completed";
  }

  if (downloadProgress.error) {
    // 错误展示继续保持 name: message 形式，和仓库其他错误 UI 保持一致。
    return downloadProgress.error.message
      ? `${downloadProgress.error.name}: ${downloadProgress.error.message}`
      : "Archive job failed.";
  }

  return "Processing archive...";
};
