import type { DriveItem } from "@microsoft/microsoft-graph-types";

/**
 * 下载准备任务的状态机。
 */
export type JobStatus = "queued" | "preparing" | "ready" | "failed";

/**
 * 前端可见的任务进度信息。
 */
export interface JobProgress {
  /** 当前任务状态。 */
  status: JobStatus;
  /** 已完成准备的文件数。 */
  processedFiles: number;
  /** 预计需要处理的总文件数。 */
  totalFiles: number;
  /** 当前正在处理的文件或文件夹路径。 */
  currentItem: string;
  /** 已完成下载地址准备的字节数。 */
  preparedBytes: number;
  /** 本次任务总字节数。 */
  totalBytes: number;
  /**
   * 严格失败模式下记录致命错误，通常只保留首个阻断任务继续执行的原因。
   */
  errors: string[];
}

/**
 * 单个文件的下载清单条目。
 */
export interface ArchiveManifestItem {
  /** Graph Item ID。 */
  itemId: string;
  /** 原始文件名。 */
  name: string;
  /** 在 ZIP 包中的相对路径。 */
  relativePath: string;
  /** 文件大小（字节）。 */
  size: number;
  /** 文件 MIME 类型。 */
  mimeType: string;
  /** 前端可直接 fetch 的下载地址。 */
  downloadUrl: string;
}

/**
 * 提供给前端用于流式下载和归档的清单。
 */
export interface ArchiveManifest {
  /** 任务 ID。 */
  jobId: string;
  /** 建议输出 ZIP 名称。 */
  archiveName: string;
  /** 归档内文件总数。 */
  totalFiles: number;
  /** 归档内总字节数。 */
  totalBytes: number;
  /** 前端逐项下载所需的清单。 */
  items: ArchiveManifestItem[];
}

/**
 * 内部任务对象。
 */
export interface Job extends JobProgress {
  /** 任务准备完成后生成的下载清单。 */
  manifest?: ArchiveManifest;
  /** 任务创建时间。 */
  createdAt: number;
  /**
   * 任务进入终态（ready 或 failed）的时间戳。
   * 清理定时器使用此字段计算 TTL，确保任务完成后有完整保留窗口。
   */
  completedAt?: number;
  /**
   * 启动本任务的用户 oid，用于后续读取进度和清单时做所有权校验。
   */
  ownerOid: string;
}

/**
 * 递归展开后的最小文件结构。
 */
export interface FlatFile {
  /** Graph Item ID。 */
  itemId: string;
  /** 原始文件名。 */
  name: string;
  /** 供 ZIP 使用的相对路径。 */
  relativePath: string;
  /** 文件大小（字节）。 */
  size: number;
  /** 文件 MIME 类型。 */
  mimeType: string;
}

/**
 * 补充 Graph 下载直链字段。
 */
export interface GraphDriveItemWithDownloadUrl extends DriveItem {
  /** Graph 直接返回的临时下载直链。 */
  "@microsoft.graph.downloadUrl"?: string;
}
