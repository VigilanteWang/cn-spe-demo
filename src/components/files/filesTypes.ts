import { DriveItem } from "@microsoft/microsoft-graph-types-beta";
import {
  IArchiveClientProgress,
  IContainer,
} from "../../common/types";
import { IJobProgress } from "../../services/spembedded";

/**
 * Files 入口组件属性。
 */
export interface IFilesProps {
  /** 当前选中的容器信息。 */
  container: IContainer;
}

/**
 * 面包屑节点。
 */
export interface IFilesBreadcrumbItem {
  /** 文件夹 ID，根目录固定为 root。 */
  id: string;
  /** 页面显示名称。 */
  name: string;
}

/**
 * 上传进度状态。
 */
export interface IUploadProgress {
  /** 是否正在上传。 */
  isUploading: boolean;
  /** 当前处理的文件路径。 */
  currentFile: string;
  /** 当前文件序号，从 1 开始。 */
  currentIndex: number;
  /** 成功文件数。 */
  successfulFiles: number;
  /** 失败文件数。 */
  failedFiles: number;
  /** 总文件数。 */
  totalFiles: number;
  /** 当前文件大小文案。 */
  fileSize: string;
  /** 是否显示完成态。 */
  isCompleted: boolean;
}

/**
 * 下载进度状态。
 */
export interface IDownloadProgress {
  /** 当前阶段。 */
  phase: "idle" | "preparing" | "downloading" | "zipping" | "done" | "failed";
  /** 是否处于活动中。 */
  isActive: boolean;
  /** 后端准备阶段进度。 */
  backendProgress: IJobProgress | null;
  /** 前端下载和压缩阶段进度。 */
  clientProgress: IArchiveClientProgress | null;
  /** 是否显示完成态。 */
  isCompleted: boolean;
  /** 错误信息。 */
  errorMessage: string;
  /** 是否应该自动隐藏。当前版本保留字段，不改变原有结构。 */
  shouldAutoHide: boolean;
  /** 是否由用户主动中止。 */
  isAborted: boolean;
}

/**
 * 带相对路径的文件对象。
 */
export interface IFileWithRelativePath extends File {
  /** 文件夹上传时浏览器提供的相对路径。 */
  webkitRelativePath: string;
}

/**
 * 上传前整理后的文件项。
 */
export interface IFilesUploadItem {
  /** 浏览器文件对象。 */
  file: File;
  /** 目标相对路径。 */
  relativePath: string;
}

/**
 * Graph 返回的下载直链扩展字段。
 */
export interface IDriveItemWithDownloadUrl extends DriveItem {
  /** Graph 临时下载地址。 */
  "@microsoft.graph.downloadUrl"?: string;
}

/**
 * 最小化 Graph 客户端接口。
 * 直接导入 @microsoft/microsoft-graph-client 的 Client 类型会与 @microsoft/mgt-element
 * 内部捆绑的同名类型冲突（private 字段声明不同），因此这里用结构化接口描述
 * createFolderIfNotExists 实际需要的操作，既类型安全又无跨包兼容问题。
 */
export interface IGraphApiClient {
  /**
   * 创建请求构造器。
   * @param path Graph API 路径。
   * @returns 最小化请求方法集合。
   */
  api(path: string): {
    /**
     * 发起 GET 请求。
     * @returns DriveItem 列表结果。
     */
    get(): Promise<{ value: DriveItem[] }>;
    /**
     * 发起 POST 请求。
     * @param data 请求体。
     * @returns 新建后的 DriveItem。
     */
    post(data: object): Promise<DriveItem>;
    /**
     * 以流形式上传内容。
     * @param data 文件二进制内容。
     * @returns 上传结果。
     */
    putStream(data: ArrayBuffer): Promise<unknown>;
  };
}
