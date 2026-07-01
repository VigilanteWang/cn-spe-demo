import {
  RedirectHandlerOptions,
  ResponseType,
} from "@microsoft/microsoft-graph-client";
import type { Client } from "@microsoft/microsoft-graph-client";
import { AppError } from "../../common/appError";
import type {
  IItemVersionDownloadResponseFromApi,
  IItemVersionListResponseFromApi,
  IItemVersionResponseFromApi,
} from "../../common/contracts/itemVersionContracts";
import { sendGraphRequest } from "../../common/graphError";
import { readGraphToRecord, readOptionalString } from "../common/graphReaders";
import {
  mapGraphItemVersionResponse,
  mapGraphItemVersions,
} from "./itemVersionGraphAdapters";

/**
 * 读取指定文件的版本列表，并映射成前端稳定响应。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @returns 版本列表响应，保持 Graph 原始顺序。
 */
export const listItemVersions = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<IItemVersionListResponseFromApi> => {
  const versions = await readItemVersions(graphClient, driveId, itemId);
  return mapGraphItemVersions(versions);
};

/**
 * 读取单条版本元数据。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @param versionId 目标版本 ID。
 * @returns 单条版本详情响应。
 */
export const getItemVersion = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<IItemVersionResponseFromApi> => {
  const version = await readSingleItemVersion(
    graphClient,
    driveId,
    itemId,
    versionId,
  );

  return mapGraphItemVersionResponse(version);
};

/**
 * 读取当前版本元数据。
 *
 * 这里直接调用 Graph 的 `versions/current`，
 * 避免为了判定“当前版本”额外拉整份版本列表。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @returns 当前版本详情响应。
 */
export const getCurrentItemVersion = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<IItemVersionResponseFromApi> => {
  const version = await sendGraphRequest(
    () =>
      graphClient
        .api(getCurrentItemVersionGraphPath(driveId, itemId))
        .version("v1.0")
        .get(),
    "Unable to read the current item version.",
    500,
  );

  return mapGraphItemVersionResponse(version);
};

/**
 * 解析指定版本的下载直链。
 *
 * 优先使用版本元数据里的 `@microsoft.graph.downloadUrl`；
 * 缺失时再退回 `content` 端点，并显式读取 302 的 `Location`。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @param versionId 目标版本 ID。
 * @returns 仅包含下载直链的响应体。
 */
export const getItemVersionDownload = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<IItemVersionDownloadResponseFromApi> => {
  const version = await readSingleItemVersion(
    graphClient,
    driveId,
    itemId,
    versionId,
  );
  const versionRecord = readGraphToRecord(version);
  const directDownloadUrl = readOptionalString(
    versionRecord["@microsoft.graph.downloadUrl"],
  );

  // 某些版本详情会直接带可下载地址，命中时可以立刻返回，避免额外请求 content 端点。
  if (directDownloadUrl) {
    return {
      downloadUrl: directDownloadUrl,
    };
  }

  // 如果详情里没有直链，就显式关闭自动重定向，改为自己读取 302 响应头里的 Location。
  const contentResponse = await sendGraphRequest(
    () =>
      graphClient
        .api(getItemVersionContentGraphPath(driveId, itemId, versionId))
        .responseType(ResponseType.RAW)
        .middlewareOptions([new RedirectHandlerOptions(0, () => false)])
        .get(),
    `Unable to resolve the download url for version ${versionId}.`,
    500,
  );
  // 下载地址微软文档称放在 Location 里
  const downloadUrl = contentResponse.headers.get("location");
  if (downloadUrl) {
    return {
      downloadUrl,
    };
  }

  throw new AppError({
    name: "DownloadUrlNotFoundError",
    message: `Unable to resolve the download url for version ${versionId}.`,
    statusCode: contentResponse.status,
    originError: {
      source: "microsoft-graph",
    },
    details: [{ driveId, itemId, versionId }],
  });
};

/**
 * 恢复指定历史版本为当前版本。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @param versionId 目标版本 ID。
 */
export const restoreItemVersion = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<void> => {
  await sendGraphRequest(
    () =>
      graphClient
        .api(getItemVersionRestoreGraphPath(driveId, itemId, versionId))
        .version("v1.0")
        .post(null),
    "Unable to restore the item version.",
    500,
  );
};

/**
 * 删除指定单条历史版本。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @param versionId 目标版本 ID。
 */
export const deleteItemVersion = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<void> => {
  await sendGraphRequest(
    () =>
      graphClient
        .api(getSingleItemVersionGraphPath(driveId, itemId, versionId))
        .version("v1.0")
        .delete(),
    "Unable to delete the item version.",
    500,
  );
};

/**
 * 删除当前文件的所有历史版本，但跳过当前最新版本。
 *
 * Graph 列表默认按最新到最旧返回，
 * 所以这里只需要跳过第一项，再顺序删除剩余版本即可。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 */
export const deleteItemHistoryVersions = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<void> => {
  const versions = await readItemVersions(graphClient, driveId, itemId);

  // 第一项是当前保留版本，只删除后续历史版本。
  for (const version of versions.slice(1)) {
    const versionId = readOptionalString(readGraphToRecord(version).id);

    // 个别脏数据可能没有可用 id，这种版本无法安全删除，直接跳过。
    if (!versionId) {
      continue;
    }

    await deleteItemVersion(graphClient, driveId, itemId, versionId);
  }
};

/**
 * 读取指定文件的原始 Graph 版本数组。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @returns Graph 返回的版本数组；缺失时回退为空数组。
 */
const readItemVersions = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<unknown[]> => {
  const response = await sendGraphRequest(
    () =>
      graphClient
        .api(getItemVersionsGraphPath(driveId, itemId))
        .version("v1.0")
        .get(),
    "Unable to read item versions.",
    500,
  );
  const responseRecord = readGraphToRecord(response);
  // Graph 列表接口的有效数据放在 value 中；异常结构时统一降级为空数组。
  return Array.isArray(responseRecord.value) ? responseRecord.value : [];
};

/**
 * 读取指定单条版本的原始 Graph 元数据。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标文件所属的 drive ID。
 * @param itemId 目标文件的 item ID。
 * @param versionId 目标版本 ID。
 * @returns Graph 返回的单条版本对象。
 */
const readSingleItemVersion = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<unknown> =>
  sendGraphRequest(
    () =>
      graphClient
        .api(getSingleItemVersionGraphPath(driveId, itemId, versionId))
        .version("v1.0")
        .get(),
    "Unable to read the item version.",
    500,
  );

/**
 * 构造 item versions 列表的 Graph 路径。
 */
const getItemVersionsGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/versions`;

/**
 * 构造单条 item version 的 Graph 路径。
 */
const getSingleItemVersionGraphPath = (
  driveId: string,
  itemId: string,
  versionId: string,
): string =>
  `${getItemVersionsGraphPath(driveId, itemId)}/${encodeURIComponent(versionId)}`;

/**
 * 构造当前版本的 Graph 路径。
 */
const getCurrentItemVersionGraphPath = (
  driveId: string,
  itemId: string,
): string => `${getItemVersionsGraphPath(driveId, itemId)}/current`;

/**
 * 构造版本内容下载的 Graph 路径。
 */
const getItemVersionContentGraphPath = (
  driveId: string,
  itemId: string,
  versionId: string,
): string =>
  `${getSingleItemVersionGraphPath(driveId, itemId, versionId)}/content`;

/**
 * 构造版本恢复的 Graph 路径。
 */
const getItemVersionRestoreGraphPath = (
  driveId: string,
  itemId: string,
  versionId: string,
): string =>
  `${getSingleItemVersionGraphPath(driveId, itemId, versionId)}/restoreVersion`;

/**
 * 构造单个 item 的基础 Graph 路径。
 */
const getItemBaseGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
