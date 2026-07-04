import type { Request, Response } from "restify";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerAccessAsUserRequest,
} from "../auth";
import { createValidationError } from "../common/appErrorHelpers";
import type {
  IItemVersionDownloadResponseFromApi,
  IItemVersionListResponseFromApi,
  IItemVersionResponseFromApi,
} from "../../common/contracts/itemVersionContracts";
import {
  readDriveId,
  readGraphToRecord,
  readItemId,
  readOptionalString,
} from "../common/graphReaders";
import {
  getCurrentItemVersion,
  deleteItemHistoryVersions,
  deleteItemVersion,
  getItemVersion,
  getItemVersionDownload,
  listItemVersions,
  restoreItemVersion,
} from "./itemVersionService";

/**
 * 读取指定文件的版本历史列表。
 */
export const listItemVersionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await listItemVersions(graphClient, driveId, itemId);

  res.send(200, responseBody);
};

/**
 * 读取指定单条版本元数据。
 */
export const getItemVersionFromGraph = async (req: Request, res: Response) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);
  const versionId = readVersionId(req);

  if (!driveId || !itemId || !versionId) {
    throw createValidationError(
      "driveId, itemId and versionId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await getItemVersion(
    graphClient,
    driveId,
    itemId,
    versionId,
  );

  res.send(200, responseBody);
};

/**
 * 读取当前版本元数据。
 */
export const getCurrentItemVersionFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await getCurrentItemVersion(
    graphClient,
    driveId,
    itemId,
  );

  res.send(200, responseBody);
};

/**
 * 读取指定版本的下载直链。
 */
export const getItemVersionDownloadFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);
  const versionId = readVersionId(req);

  if (!driveId || !itemId || !versionId) {
    throw createValidationError(
      "driveId, itemId and versionId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await getItemVersionDownload(
    graphClient,
    driveId,
    itemId,
    versionId,
  );

  res.send(200, responseBody);
};

/**
 * 恢复指定历史版本为当前版本。
 */
export const restoreItemVersionFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);
  const versionId = readVersionId(req);

  if (!driveId || !itemId || !versionId) {
    throw createValidationError(
      "driveId, itemId and versionId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  await restoreItemVersion(graphClient, driveId, itemId, versionId);

  res.send(204);
};

/**
 * 删除指定单条历史版本。
 */
export const deleteItemVersionFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);
  const versionId = readVersionId(req);

  if (!driveId || !itemId || !versionId) {
    throw createValidationError(
      "driveId, itemId and versionId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  await deleteItemVersion(graphClient, driveId, itemId, versionId);

  res.send(204);
};

/**
 * 删除指定文件的所有历史版本，但保留当前版本。
 */
export const deleteItemHistoryVersionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerAccessAsUserRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  await deleteItemHistoryVersions(graphClient, driveId, itemId);

  res.send(204);
};

const readVersionId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.versionId);
};

export type {
  IItemVersionDownloadResponseFromApi,
  IItemVersionListResponseFromApi,
  IItemVersionResponseFromApi,
};
