/**
 * 下载准备模块的公共导出入口。
 *
 * 对外统一暴露任务创建、进度读取和清单读取能力，
 * 避免调用方直接依赖内部拆分后的实现文件。
 */
export {
  getJobManifest,
  getJobProgress,
  startDownloadJob,
} from "./downloadService";

export type {
  ArchiveManifest,
  ArchiveManifestItem,
  JobProgress,
  JobStatus,
} from "./downloadTypes";
