/**
 * 单条文件版本的前端展示模型。
 *
 * 这里只保留 Versions Dialog 真正需要的最小字段，
 */
export interface IItemVersionEntryForUI {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedByDisplayName: string;
  size: number;
  isCurrent: boolean;
}

/**
 * 文件版本列表接口响应。
 */
export interface IItemVersionListResponseFromApi {
  entries: IItemVersionEntryForUI[];
}

/**
 * 单条文件版本元数据接口响应。
 */
export interface IItemVersionResponseFromApi {
  entry: IItemVersionEntryForUI;
}

/**
 * 文件版本下载接口响应。
 *
 * 后端不代理二进制内容，只把前端真正需要的下载直链返回出去。
 */
export interface IItemVersionDownloadResponseFromApi {
  downloadUrl: string;
}
