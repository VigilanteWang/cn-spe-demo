import type { DriveItem } from "@microsoft/microsoft-graph-types";

/**
 * 下载准备任务的状态。
 *
 * 这里描述的是“后端准备下载清单”的进度，不是浏览器真正下载 ZIP 的状态。
 */
export type JobStatus = "queued" | "preparing" | "ready" | "failed";

/**
 * 前端可见的任务进度信息。
 *
 * 这些字段会被轮询接口返回给前端，用来驱动进度条和状态文案。
 */
export interface JobProgress {
  /** 当前任务状态。 */
  status: JobStatus;

  /** 已处理完成的文件数。 */
  processedFiles: number;

  /** 预计需要处理的总文件数。 */
  totalFiles: number;

  /** 当前正在处理的文件或路径。 */
  currentItem: string;

  /** 已准备完成下载地址的总字节数。 */
  preparedBytes: number;

  /** 本次任务的总字节数。 */
  totalBytes: number;

  /**
   * 任务失败时记录的错误列表。
   *
   * 当前实现采用严格失败模式，通常只保留第一个阻断任务继续执行的错误。
   */
  errors: string[];
}

/**
 * 单个文件的下载清单项。
 *
 * 前端会根据这些信息逐个下载文件，再在浏览器侧打包 ZIP。
 */
export interface ArchiveManifestItem {
  /** Graph Item ID。 */
  itemId: string;

  /** 原始文件名。 */
  name: string;

  /** 文件在 ZIP 内部的相对路径。 */
  relativePath: string;

  /** 文件大小，单位为字节。 */
  size: number;

  /** 文件 MIME 类型。 */
  mimeType: string;

  /** 前端可直接 `fetch` 的下载地址。 */
  downloadUrl: string;
}

/**
 * 提供给前端用于真正下载和归档的清单。
 */
export interface ArchiveManifest {
  /** 当前任务 ID。 */
  jobId: string;

  /** 建议输出的 ZIP 文件名。 */
  archiveName: string;

  /** 归档内的总文件数。 */
  totalFiles: number;

  /** 归档内的总字节数。 */
  totalBytes: number;

  /** 前端逐项下载所需的清单项。 */
  items: ArchiveManifestItem[];
}

/**
 * 后端内部完整任务对象。
 *
 * 它在 `JobProgress` 的基础上额外保存任务所有者、生成时间、manifest 等内部字段。
 */
export interface Job extends JobProgress {
  /** 准备完成后生成的下载清单。 */
  manifest?: ArchiveManifest;

  /** 任务创建时间戳。 */
  createdAt: number;

  /**
   * 任务进入终态的时间戳。
   *
   * 用于定时清理过期任务，避免内存中的任务记录无限增长。
   */
  completedAt?: number;

  /**
   * 任务创建者的用户 oid。
   *
   * 后续读取进度和 manifest 时会用它做所有权校验。
   */
  ownerOid: string;
}

/**
 * 目录递归展开后的最小文件结构。
 *
 * 这个结构只保留后续计算大小、生成路径和解析下载地址所需的信息。
 */
export interface FlatFile {
  /** Graph Item ID。 */
  itemId: string;

  /** 原始文件名。 */
  name: string;

  /** 文件在 ZIP 中的相对路径。 */
  relativePath: string;

  /** 文件大小，单位为字节。 */
  size: number;

  /** 文件 MIME 类型。 */
  mimeType: string;
}

/**
 * 带有 Graph 直接下载地址字段的 DriveItem。
 */
export interface GraphDriveItemWithDownloadUrl extends DriveItem {
  /** Graph 返回的临时下载直链。 */
  "@microsoft.graph.downloadUrl"?: string;
}
