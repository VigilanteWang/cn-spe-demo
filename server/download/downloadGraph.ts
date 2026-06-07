import {
  RedirectHandlerOptions,
  ResponseType,
} from "@microsoft/microsoft-graph-client";
import type { DriveItem } from "@microsoft/microsoft-graph-types";
import { AppError } from "../../common/appError";
import { createGraphClient } from "../auth";
import { sendGraphRequest, toGraphAppError } from "../common/appErrorHelpers";
import { FlatFile, GraphDriveItemWithDownloadUrl } from "./downloadTypes";

type DownloadGraphClient = ReturnType<typeof createGraphClient>;

/**
 * 递归展开用户选择的项目，返回严格失败模式下的扁平文件列表。
 *
 * @param graphClient 已认证的 Graph 客户端。
 * @param driveId 当前容器对应的 Drive ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @returns 展开后的扁平文件数组。
 */
export const flattenDriveItems = async (
  graphClient: DownloadGraphClient,
  driveId: string,
  itemIds: string[],
): Promise<FlatFile[]> => {
  const result: FlatFile[] = [];

  for (const itemId of itemIds) {
    // 任何一个选中项展开失败，都直接中断整次下载准备流程。
    await expandItem(graphClient, driveId, itemId, "", result);
  }

  return result;
};

/**
 * 解析单个文件的可下载地址。
 *
 * @param graphClient 已认证的 Graph 客户端。
 * @param graphToken Graph 访问令牌。
 * @param driveId 当前容器对应的 Drive ID。
 * @param itemId 当前文件 ID。
 * @returns 前端可直接 `fetch` 的下载地址。
 */
export const resolveDownloadUrl = async (
  graphClient: DownloadGraphClient,
  _graphToken: string,
  driveId: string,
  itemId: string,
): Promise<string> => {
  const itemRequest = graphClient.api(`/drives/${driveId}/items/${itemId}`);
  const item = (await sendGraphRequest(
    () => itemRequest.get(),
    `Unable to resolve the download url for item ${itemId}.`,
  )) as GraphDriveItemWithDownloadUrl;

  if (item["@microsoft.graph.downloadUrl"]) {
    return item["@microsoft.graph.downloadUrl"];
  }

  // 这里显式关闭 SDK 默认的 redirect 跟随，保留 302 响应头里的 location。
  const contentRequest = graphClient
    .api(`/drives/${driveId}/items/${itemId}/content`)
    .responseType(ResponseType.RAW)
    .middlewareOptions([new RedirectHandlerOptions(0, () => false)]);
  const response = await sendGraphRequest(
    () => contentRequest.get(),
    `Unable to resolve the download url for item ${itemId}.`,
  );

  const location = response.headers.get("location");
  if (location) {
    return location;
  }

  throw new AppError({
    name: "DownloadUrlNotFoundError",
    message: `Unable to resolve the download url for item ${itemId}.`,
    statusCode: response.status,
    originError: {
      source: "microsoft-graph",
    },
    details: [{ driveId, itemId }],
  });
};

/**
 * 递归展开单个 Drive Item。
 *
 * @param graphClient 已认证的 Graph 客户端。
 * @param driveId 当前容器对应的 Drive ID。
 * @param itemId 当前项目 ID。
 * @param basePath 当前项目在 ZIP 中的父级路径。
 * @param result 扁平文件输出数组。
 */
async function expandItem(
  graphClient: DownloadGraphClient,
  driveId: string,
  itemId: string,
  basePath: string,
  result: FlatFile[],
): Promise<void> {
  const itemRequest = graphClient
    .api(`/drives/${driveId}/items/${itemId}`)
    .select("id,name,folder,file,size");
  const item = (await sendGraphRequest(
    () => itemRequest.get(),
    "Unable to expand the selected items.",
  )) as DriveItem;

  const itemName = item.name ?? "";
  if (item.folder) {
    // 文件夹本身不会直接进入 manifest，而是继续展开它的子项。
    await expandFolder(
      graphClient,
      driveId,
      itemId,
      basePath ? `${basePath}/${itemName}` : itemName,
      result,
    );
    return;
  }

  // 普通文件只保留后续真正需要的最小字段，避免把整份 Graph 响应一路往后传。
  result.push({
    itemId,
    name: itemName,
    relativePath: basePath ? `${basePath}/${itemName}` : itemName,
    size: item.size ?? 0,
    mimeType: item.file?.mimeType ?? "application/octet-stream",
  });
}

/**
 * 枚举文件夹下的所有子项，并处理 Graph 分页结果。
 *
 * @param graphClient 已认证的 Graph 客户端。
 * @param driveId 当前容器对应的 Drive ID。
 * @param folderId 当前文件夹 ID。
 * @param folderPath 当前文件夹在 ZIP 中的路径。
 * @param result 扁平文件输出数组。
 */
async function expandFolder(
  graphClient: DownloadGraphClient,
  driveId: string,
  folderId: string,
  folderPath: string,
  result: FlatFile[],
): Promise<void> {
  let endpoint: string | null = `/drives/${driveId}/items/${folderId}/children`;

  while (endpoint) {
    const pageRequest = graphClient
      .api(endpoint)
      .select("id,name,folder,file,size");
    const page = (await sendGraphRequest(
      () => pageRequest.get(),
      "Unable to expand the selected items.",
    ).catch((error: unknown) => {
      throw toGraphAppError(
        error,
        "Unable to expand the selected items.",
        502,
        {
          details: [{ driveId, folderId }],
        },
      );
    })) as {
      value?: DriveItem[];
      "@odata.nextLink"?: string;
    };

    const children = page.value ?? [];

    for (const child of children) {
      const childId = child.id ?? "";
      const childName = child.name ?? "";

      if (child.folder) {
        // 子文件夹继续递归，并把父级路径拼进去，保证 ZIP 目录结构不丢失。
        await expandFolder(
          graphClient,
          driveId,
          childId,
          `${folderPath}/${childName}`,
          result,
        );
        continue;
      }

      // 子文件则直接落入结果列表，后面统一做大小累计和下载地址解析。
      result.push({
        itemId: childId,
        name: childName,
        relativePath: `${folderPath}/${childName}`,
        size: child.size ?? 0,
        mimeType: child.file?.mimeType ?? "application/octet-stream",
      });
    }

    // Graph 使用 @odata.nextLink 做分页，必须一路取完才能拿到完整文件列表。
    endpoint = page["@odata.nextLink"] ?? null;
  }
}
