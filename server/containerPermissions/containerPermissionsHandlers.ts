import { Request, Response } from "restify";
import {
  authorizeContainerManageRequest,
  createGraphClient,
  getGraphToken,
} from "../auth";
import type {
  IContainerPermissionChangeSet,
  IContainerPermissionsResponse,
} from "../../common/contracts/containerPermissionCommonContracts";
import { createGraphCreatePermissionBody, mapGraphPermissionToEntry } from "./containerPermissionsCommonAdapters";
import {
  getContainerPermissionsErrorStatus,
  mapContainerPermissionsGraphError,
  toContainerPermissionsApiErrorBody,
} from "./containerPermissionsError";
import type { IGraphClient } from "./containerPermissionsInternalContracts";
import { mapUiContainerPermissionRoleToGraph } from "./containerPermissionRoleMapper";
import { parseContainerPermissionChangeSet } from "./containerPermissionsRequestParser";
import { readOptionalString, readRecord } from "./containerPermissionsReaders";

/**
 * 读取指定容器的真实权限列表，并映射成前端 access list 视图模型。
 */
export const listContainerPermissions = async (req: Request, res: Response) => {
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  const containerId = readContainerId(req);

  if (!containerId) {
    res.send(400, {
      code: "invalidRequest",
      message: "containerId route parameter is required.",
      statusCode: 400,
    });
    return;
  }

  try {
    const graphToken = await getGraphToken(authorizationResult.token);
    const graphClient = createGraphClient(
      graphToken,
    ) as unknown as IGraphClient;
    const entries = await fetchContainerPermissionEntries(
      graphClient,
      containerId,
    );

    const responseBody: IContainerPermissionsResponse = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendMappedContainerPermissionError(res, error);
  }
};

/**
 * 顺序执行新增、更新、删除权限，再返回服务端最新权限列表。
 */
export const applyContainerPermissions = async (
  req: Request,
  res: Response,
) => {
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  const containerId = readContainerId(req);

  if (!containerId) {
    res.send(400, {
      code: "invalidRequest",
      message: "containerId route parameter is required.",
      statusCode: 400,
    });
    return;
  }

  const changeSet = parseContainerPermissionChangeSet(req.body);

  if (!changeSet) {
    res.send(400, {
      code: "invalidRequest",
      message: "create, update and remove arrays are required.",
      statusCode: 400,
    });
    return;
  }

  try {
    const graphToken = await getGraphToken(authorizationResult.token);
    const graphClient = createGraphClient(
      graphToken,
    ) as unknown as IGraphClient;

    await applyContainerPermissionChangeSet(
      graphClient,
      containerId,
      changeSet,
    );

    const entries = await fetchContainerPermissionEntries(
      graphClient,
      containerId,
    );
    const responseBody: IContainerPermissionsResponse = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    sendMappedContainerPermissionError(res, error);
  }
};

/**
 * 真实读取 Graph 容器权限列表。
 */
export const fetchContainerPermissionEntries = async (
  graphClient: IGraphClient,
  containerId: string,
) => {
  try {
    const response = await graphClient
      .api(getContainerPermissionsPath(containerId))
      .version("v1.0")
      .get();

    const responseRecord = readRecord(response);
    const permissionItems = responseRecord.value;

    if (!Array.isArray(permissionItems)) {
      return [];
    }

    return permissionItems.map(mapGraphPermissionToEntry);
  } catch (error: unknown) {
    throw mapContainerPermissionsGraphError(error);
  }
};

/**
 * 顺序执行权限变更。
 */
export const applyContainerPermissionChangeSet = async (
  graphClient: IGraphClient,
  containerId: string,
  changeSet: IContainerPermissionChangeSet,
): Promise<void> => {
  try {
    // 先删再改再建，可以减少同一 principal 旧权限残留导致的冲突与定位复杂度。
    for (const deleteChange of changeSet.remove) {
      await graphClient
        .api(
          getSingleContainerPermissionPath(
            containerId,
            deleteChange.permissionId,
          ),
        )
        .version("v1.0")
        .header("Prefer", "onlyRemoveContainerScopedPermission")
        .delete();
    }

    // 更新阶段只改角色，不触碰 principal 身份字段。
    for (const updateChange of changeSet.update) {
      await graphClient
        .api(
          getSingleContainerPermissionPath(
            containerId,
            updateChange.permissionId,
          ),
        )
        .version("v1.0")
        .patch({
          roles: [mapUiContainerPermissionRoleToGraph(updateChange.role)],
        });
    }

    // 创建阶段使用 Graph 专门要求的 grantedToV2 载荷形状。
    for (const createChange of changeSet.create) {
      await graphClient
        .api(getContainerPermissionsPath(containerId))
        .version("v1.0")
        .post(createGraphCreatePermissionBody(createChange));
    }
  } catch (error: unknown) {
    throw mapContainerPermissionsGraphError(error);
  }
};

const sendMappedContainerPermissionError = (res: Response, error: unknown) => {
  const mappedError = mapContainerPermissionsGraphError(error);
  res.send(
    getContainerPermissionsErrorStatus(mappedError),
    toContainerPermissionsApiErrorBody(mappedError),
  );
};

const readContainerId = (req: Request): string | undefined => {
  const paramsRecord = readRecord(req.params);
  return readOptionalString(paramsRecord.containerId);
};

const getContainerPermissionsPath = (containerId: string): string =>
  `/storage/fileStorage/containers/${encodeURIComponent(containerId)}/permissions`;

const getSingleContainerPermissionPath = (
  containerId: string,
  permissionId: string,
): string =>
  `${getContainerPermissionsPath(containerId)}/${encodeURIComponent(permissionId)}`;
