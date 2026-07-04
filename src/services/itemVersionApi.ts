import { sendAuthorizedRequest } from "./apiClient";
import type {
  IItemVersionDownloadResponseFromApi,
  IItemVersionListResponseFromApi,
  IItemVersionResponseFromApi,
} from "../../common/contracts/itemVersionContracts";
import { mapApiErrorResponseToAppError } from "../common/apiErrorMapper";

/**
 * 读取指定文件的版本历史列表。
 *
 * 这里仅负责请求和响应还原，不在前端重排顺序或推断当前版本。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @returns 后端返回的版本历史列表。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const listItemVersions = async (driveId: string, itemId: string) => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version list request",
    });
  }

  const payload = (await response.json()) as IItemVersionListResponseFromApi;
  return payload.entries;
};

/**
 * 读取指定文件的当前版本元数据。
 *
 * 当前版本判定以后端 `/current` 路由返回结果为准，
 * 前端不依赖列表第一项或本地推断。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @returns 当前版本元数据。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const getCurrentItemVersion = async (
  driveId: string,
  itemId: string,
) => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/current`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version current request",
    });
  }

  const payload = (await response.json()) as IItemVersionResponseFromApi;
  return payload.entry;
};

/**
 * 读取指定版本的下载直链。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @param versionId 目标版本标识。
 * @returns 后端返回的下载直链。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const getItemVersionDownload = async (
  driveId: string,
  itemId: string,
  versionId: string,
) => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/${encodeURIComponent(versionId)}/download`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version download request",
    });
  }

  const payload =
    (await response.json()) as IItemVersionDownloadResponseFromApi;
  return payload.downloadUrl;
};

/**
 * 恢复指定历史版本为当前版本。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @param versionId 目标版本标识。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const restoreItemVersion = async (
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<void> => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/${encodeURIComponent(versionId)}/restore`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version restore request",
    });
  }
};

/**
 * 删除指定单条历史版本。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @param versionId 目标版本标识。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const deleteItemVersion = async (
  driveId: string,
  itemId: string,
  versionId: string,
): Promise<void> => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/${encodeURIComponent(versionId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version delete request",
    });
  }
};

/**
 * 删除指定文件除当前版本外的所有历史版本。
 *
 * @param driveId 当前文件所属 drive 的标识。
 * @param itemId 当前文件的标识。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const deleteItemHistoryVersions = async (
  driveId: string,
  itemId: string,
): Promise<void> => {
  const response = await sendAuthorizedRequest(
    `/api/itemVersions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/history`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item version delete history request",
    });
  }
};
