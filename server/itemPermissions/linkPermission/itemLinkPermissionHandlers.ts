import { Request, Response } from "restify";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../../auth";
import type {
  IApplyItemLinkPermissionChangesResponse,
  IItemLinkPermissionsResponseFromApi,
} from "../../../common/contracts/itemPermissionCommonContracts";
import type { IPermissionGraphClient } from "../../permissionsCore/permissionGraphContracts";
import {
  readGraphToRecord,
  readOptionalString,
} from "../../permissionsCore/permissionGraphReaders";
import { createValidationError } from "../../common/appErrorHelpers";
import { parseItemLinkPermissionChangeSet } from "./itemLinkPermissionRequestParser";
import {
  applyItemLinkPermissionChangeSet,
  fetchMapItemLinkPermissionsFromGraphToResponse,
} from "./itemLinkPermissionService";

/**
 * 读取 item link permissions 列表。
 */
export const listItemLinkPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken) as IPermissionGraphClient;
  const responseBody = await fetchMapItemLinkPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );

  res.send(200, responseBody);
};

/**
 * 应用 item link permissions 变更。
 */
export const applyItemLinkPermissionsToGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const changeSet = parseItemLinkPermissionChangeSet(req.body);
  if (!changeSet) {
    throw createValidationError(
      "create, deleteLinks, grantRecipients and revokeRecipients arrays are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken) as IPermissionGraphClient;
  const responseBody = await applyItemLinkPermissionChangeSet(
    graphClient,
    driveId,
    itemId,
    changeSet,
  );

  res.send(200, responseBody);
};

const readDriveId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.driveId);
};

const readItemId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.itemId);
};

export type {
  IApplyItemLinkPermissionChangesResponse,
  IItemLinkPermissionsResponseFromApi,
};
