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
import { readDriveId, readItemId } from "../../common/graphReaders";
import { createValidationError } from "../../common/appErrorHelpers";
import { parseItemLinkPermissionChangeSet } from "./itemLinkPermissionRequestParser";
import {
  applyItemLinkPermissionChangeSet,
  fetchMapItemLinkPermissionsFromGraphToResponse,
} from "./itemLinkPermissionService";

/**
 * 读取指定文件项的链接权限列表。
 */
export const listItemLinkPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  // 这里统一要求容器管理权限，避免普通读取能力越权访问链接权限元数据。
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    // driveId 和 itemId 共同决定目标文件，缺少任一参数都无法继续请求 Graph。
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  // 后端代前端执行 OBO 换取 Graph token，保持 Graph 调用留在服务端边界内。
  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await fetchMapItemLinkPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );

  res.send(200, responseBody);
};

/**
 * 应用指定文件项的链接权限变更。
 */
export const applyItemLinkPermissionsToGraph = async (
  req: Request,
  res: Response,
) => {
  // 写操作沿用同一层权限门槛，确保只有允许管理容器的调用方才能修改链接权限。
  const authorizationResult = await requireContainerManageRequest(req);
  const driveId = readDriveId(req);
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    // 变更最终需要落到具体文件项，路由参数不完整时直接返回校验错误更清晰。
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const changeSet = parseItemLinkPermissionChangeSet(req.body);
  if (!changeSet) {
    // 这里要求前端传入完整的变更集骨架，便于服务层按固定批次顺序执行增删授权。
    throw createValidationError(
      "create, deleteLinks, grantRecipients and revokeRecipients arrays are required.",
    );
  }

  // 同一次请求内复用一个 Graph client，保持整批变更使用一致的授权上下文。
  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await applyItemLinkPermissionChangeSet(
    graphClient,
    driveId,
    itemId,
    changeSet,
  );

  res.send(200, responseBody);
};

export type {
  IApplyItemLinkPermissionChangesResponse,
  IItemLinkPermissionsResponseFromApi,
};
