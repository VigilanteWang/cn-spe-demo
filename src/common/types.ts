/**
 * 前端类型定义模块
 *
 * 本模块定义了前端使用的核心数据接口：
 * 1. IDriveItemExtended - 扩展了 Microsoft Graph 的 DriveItem，用于文件列表 UI 展示
 * 2. IContainer - SharePoint Embedded 存储容器的接口定义
 *
 * 这些类型在组件层和服务层之间传递数据时使用，确保类型安全。
 **/

import { DriveItem } from "@microsoft/microsoft-graph-types-beta";

/**
 * 扩展的 DriveItem 接口，用于文件列表 DataGrid 展示
 *
 * 继承自 Microsoft Graph 的 DriveItem 基础类型，新增以下 UI 辅助属性：
 * - isFolder: 判断是否为文件夹（DriveItem.folder 存在即为 true）
 * - modifiedByName: 最后修改者的显示名称（从嵌套的 lastModifiedBy.user.displayName 提取）
 * - iconElement: 文件/文件夹图标的 JSX 元素（FolderRegular 或 DocumentRegular）
 * - downloadUrl: 文件的直接下载链接（来自 @microsoft.graph.downloadUrl 属性）
 *
 * DriveItem 基础属性包括：id, name, size, webUrl, parentReference, folder, file 等
 **/
export interface IDriveItemExtended extends DriveItem {
  isFolder: boolean;
  modifiedByName: string;
  iconElement: JSX.Element;
  downloadUrl?: string;
}

/**
 * SharePoint Embedded 存储容器接口
 *
 * 对应 Microsoft Graph API 返回的 fileStorageContainer 资源。
 * 每个容器类似一个独立的"文件驱动器"，可以存储文件和文件夹。
 *
 * - id: 容器唯一标识符（同时也是 Drive ID，用于 Graph API 文件操作）
 * - displayName: 容器显示名称（用户在 UI 上看到的名字）
 * - containerTypeId: 容器类型 ID（由 Azure 管理员配置，关联到特定的 SPE 应用）
 * - createdDateTime: 创建时间（ISO 8601 格式，如 "2024-01-15T08:30:00Z"）
 **/
export interface IContainer {
  id: string;
  displayName: string;
  containerTypeId: string;
  createdDateTime: string;
}

/**
 * 后端返回的单文件下载清单条目。
 *
 * relativePath 用于在前端 ZIP 中保留原始目录层级。
 */
export interface IArchiveManifestItem {
  itemId: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  downloadUrl: string;
}

/**
 * 后端准备完成后返回的归档清单。
 */
export interface IArchiveManifest {
  jobId: string;
  archiveName: string;
  totalFiles: number;
  totalBytes: number;
  items: IArchiveManifestItem[];
}

/**
 * 前端流式下载和压缩过程的实时进度。
 */
export interface IArchiveClientProgress {
  stage: "downloading" | "zipping" | "done";
  totalFiles: number;
  processedFiles: number;
  totalBytes: number;
  downloadedBytes: number;
  zippedBytes: number;
  currentItem: string;
}

/**
 * 默认 lib.dom.d.ts 中没有 showSaveFilePicker 的类型定义，这里进行扩展声明。
 * File System Access API 不是 JS，为了调用时类型安全
 */
export interface IShowSaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    name?: string;
    createWritable: () => Promise<{
      // 这里使用浏览器 FileSystemWritableFileStream.write 的入参语义，https://whatpr.org/fs/1.html#api-filesystemwritablefilestream
      // 避免将 fflate 输出的 Uint8Array 误约束为 BlobPart 的一种防御性写法，参考 docs\fix&refactor\arraybuffer-type-issue-notes.md
      write: (data: BufferSource | Blob | string) => Promise<void>;
      close: () => Promise<void>;
      abort: () => Promise<void>;
    }>;
  }>;
}

/**
 * 前端归档后保存的文件。
 *
 * 如果 writable 存在，表示已经在用户手势上下文中获取了FileSystemWritableFileStream.write。
 * 如果 writable 为 null，则回退到 Blob 下载模式。
 */
export interface IArchiveSaveTarget {
  filename: string;
  writable: {
    write: (data: BufferSource | Blob | string) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  } | null;
}

/**
 * 归档下载会话。
 *
 * - abort: 立即中止当前下载任务
 * - completion: 下载任务完成 Promise（成功完成或主动中止后结束）
 */
export interface IArchiveDownloadSession {
  abort: () => void;
  completion: Promise<void>;
}
