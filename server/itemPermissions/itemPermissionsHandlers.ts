import { Request, Response } from "restify";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../auth";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionsResponseFromApi,
} from "../../common/contracts/itemPermissionCommonContracts";
import {
  mapGraphItemPermissionsToResponse,
  newGraphInvitePermissionBody,
} from "./itemPermissionsCommonAdapters";
import {
  getItemPermissionsApiErrorResponseStatus,
  mapItemPermissionsGraphError,
  toItemPermissionsApiErrorResponseBody,
} from "./itemPermissionsError";
import type { IPermissionGraphClient } from "../permissionsCore/permissionGraphContracts";
import { mapUiItemPermissionRoleToGraph } from "./itemPermissionRoleMapper";
import { parseItemPermissionChangeSet } from "./itemPermissionsRequestParser";
import {
  readGraphToRecord,
  readOptionalString,
} from "../permissionsCore/permissionGraphReaders";
import { BackendValidationError } from "../common/errors";

/**
 * Step 0 已在当前租户确认 item 显式 invite permission 的 PATCH 稳定可用，
 * 因此当前正式实现直接走 PATCH。
 *
 * 如果未来租户/Graph 行为发生变化，再切回 replace 即可。
 */
const ITEM_PERMISSION_UPDATE_MODE: "patch" | "replace" = "patch";

export const listItemPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw new BackendValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  try {
    const graphToken = await getGraphOBOToken(authorizationResult.token);
    const graphClient = createGraphClient(graphToken) as IPermissionGraphClient;
    const responseBody = await fetchMapItemPermissionsFromGraphToResponse(
      graphClient,
      driveId,
      itemId,
    );
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendItemPermissionMappedGraphError(res, error);
  }
};

export const applyItemPermissionsToGraph = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw new BackendValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const changeSet = parseItemPermissionChangeSet(req.body);

  if (!changeSet) {
    throw new BackendValidationError(
      "create, update and remove arrays are required.",
    );
  }

  try {
    const graphToken = await getGraphOBOToken(authorizationResult.token);
    const graphClient = createGraphClient(graphToken) as IPermissionGraphClient;

    await applyItemPermissionChangeSet(graphClient, driveId, itemId, changeSet);

    const responseBody = await fetchMapItemPermissionsFromGraphToResponse(
      graphClient,
      driveId,
      itemId,
    );
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendItemPermissionMappedGraphError(res, error);
  }
};

export const fetchMapItemPermissionsFromGraphToResponse = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
): Promise<IItemPermissionsResponseFromApi> => {
  try {
    const currentPermissions = await readItemPermissions(graphClient, driveId, itemId);
    const parentItemId = await readParentItemId(graphClient, driveId, itemId);
    const parentPermissions = parentItemId
      ? await tryReadParentPermissions(graphClient, driveId, parentItemId)
      : undefined;

    return mapGraphItemPermissionsToResponse({
      currentPermissions,
      parentPermissions,
    });
  } catch (error: unknown) {
    throw mapItemPermissionsGraphError(error);
  }
};

export const applyItemPermissionChangeSet = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
  changeSet: IItemPermissionChangeSetFromUI,
): Promise<void> => {
  try {
    for (const removeChange of changeSet.remove) {
      await graphClient
        .api(getSingleItemPermissionGraphPath(driveId, itemId, removeChange.permissionId))
        .version("v1.0")
        .delete();
    }

    for (const updateChange of changeSet.update) {
      if (ITEM_PERMISSION_UPDATE_MODE === "patch") {
        await graphClient
          .api(
            getSingleItemPermissionGraphPath(
              driveId,
              itemId,
              updateChange.permissionId,
            ),
          )
          .version("v1.0")
          .patch({
            roles: [mapUiItemPermissionRoleToGraph(updateChange.role)],
          });
        continue;
      }

      await graphClient
        .api(
          getSingleItemPermissionGraphPath(
            driveId,
            itemId,
            updateChange.permissionId,
          ),
        )
        .version("v1.0")
        .delete();
      await graphClient
        .api(getItemInviteGraphPath(driveId, itemId))
        .version("v1.0")
        .post(newGraphInvitePermissionBody(updateChange));
    }

    for (const createChange of changeSet.create) {
      await graphClient
        .api(getItemInviteGraphPath(driveId, itemId))
        .version("v1.0")
        .post(newGraphInvitePermissionBody(createChange));
    }
  } catch (error: unknown) {
    throw mapItemPermissionsGraphError(error);
  }
};

const sendItemPermissionMappedGraphError = (res: Response, error: unknown) => {
  const mappedError = mapItemPermissionsGraphError(error);
  res.send(
    getItemPermissionsApiErrorResponseStatus(mappedError),
    toItemPermissionsApiErrorResponseBody(mappedError),
  );
};

const readDriveId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.driveId);
};

const readItemId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.itemId);
};

const readItemPermissions = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
): Promise<unknown[]> => {
  const response = await graphClient
    .api(getItemPermissionsGraphPath(driveId, itemId))
    .version("v1.0")
    .get();
  const responseRecord = readGraphToRecord(response);
  const permissionItems = responseRecord.value;
  return Array.isArray(permissionItems) ? permissionItems : [];
};

const readParentItemId = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
): Promise<string | undefined> => {
  const response = await graphClient
    .api(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=parentReference`)
    .version("v1.0")
    .get();
  const responseRecord = readGraphToRecord(response);
  const parentReference = readGraphToRecord(responseRecord.parentReference);
  return readOptionalString(parentReference.id);
};

const tryReadParentPermissions = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  parentItemId: string,
): Promise<unknown[] | undefined> => {
  try {
    return await readItemPermissions(graphClient, driveId, parentItemId);
  } catch {
    // 这里故意保守降级：
    // 父项读取失败时，不把当前显式权限误判成 inherited，
    // 让 UI 宁可少禁用，也不要错禁用。
    return undefined;
  }
};

const getItemPermissionsGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/permissions`;

const getSingleItemPermissionGraphPath = (
  driveId: string,
  itemId: string,
  permissionId: string,
): string =>
  `${getItemPermissionsGraphPath(driveId, itemId)}/${encodeURIComponent(permissionId)}`;

const getItemInviteGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/invite`;
