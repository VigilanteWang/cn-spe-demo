/**
 * 这个文件是容器权限后端模块的主流程编排层。
 *
 * 它主要负责把一次请求串成完整链路：
 * 1. 鉴权
 * 2. 读取并校验路由参数 / 请求体
 * 3. 创建请求级 Graph client
 * 4. 调用读取或写入逻辑
 * 5. 把结果或错误转换成稳定 API 响应
 *
 * 可以把它理解成“控制器层”：
 * 它负责组织流程，但尽量不直接承载 Graph 结构转换或字段解析细节。
 */
import { Request, Response } from "restify";
import { sendGraphRequest } from "../../common/graphError";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../auth";
import type {
  IContainerPermissionChangeSetFromUI,
  IContainerPermissionsResponseFromApi,
} from "../../common/contracts/containerPermissionCommonContracts";
import {
  newGraphCreatePermissionBody,
  mapGraphPermissionToEntryOnUI,
} from "./containerPermissionsCommonAdapters";
import type { IGraphClient } from "./containerPermissionsInternalContracts";
import { mapUiContainerPermissionRoleToGraph } from "./containerPermissionRoleMapper";
import { parseContainerPermissionChangeSet } from "./containerPermissionsRequestParser";
import {
  readOptionalString,
  readGraphToRecord,
} from "./containerPermissionsReaders";
import { createValidationError } from "../common/appErrorHelpers";

/**
 * 读取指定容器的权限列表，并映射成前端可直接消费的 entries 响应。
 *
 * @param req Restify 请求对象，包含鉴权头与路由参数。
 * @param res Restify 响应对象，用于返回标准化结果。
 * @returns Promise<void>
 */
export const listContainerPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  // 先做鉴权与 scope 校验，避免无权限请求继续访问 Graph。
  const authorizationResult = await requireContainerManageRequest(req);

  // 从路由参数读取容器 ID，作为后续 Graph 路径的关键输入。
  const containerId = readContainerId(req);

  if (!containerId) {
    throw createValidationError("containerId route parameter is required.");
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken) as IGraphClient;
  const entries = await fetchMapContainerPermissionFromGraphToEntries(
    graphClient,
    containerId,
  );

  const responseBody: IContainerPermissionsResponseFromApi = { entries };
  res.send(200, responseBody);
};

/**
 * 应用前端提交的权限变更（新增/更新/删除），并返回服务端最新权限快照。
 *
 * @param req Restify 请求对象，包含容器 ID 与变更载荷。
 * @param res Restify 响应对象，用于返回更新后的 entries。
 * @returns Promise<void>
 */
export const applyContainerPermissionsToGraph = async (
  req: Request,
  res: Response,
) => {
  // 与读取接口保持一致，先进行统一鉴权。
  const authorizationResult = await requireContainerManageRequest(req);

  // 先读取容器 ID，缺失时直接返回 400，避免无效 Graph 请求。
  const containerId = readContainerId(req);

  if (!containerId) {
    throw createValidationError("containerId route parameter is required.");
  }

  // 解析并校验 create/update/remove 三段变更数据。
  const changeSet = parseContainerPermissionChangeSet(req.body);

  if (!changeSet) {
    throw createValidationError(
      "create, update and remove arrays are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken) as IGraphClient;

  await applyContainerPermissionChangeSet(graphClient, containerId, changeSet);

  const entries = await fetchMapContainerPermissionFromGraphToEntries(
    graphClient,
    containerId,
  );
  const responseBody: IContainerPermissionsResponseFromApi = { entries };
  res.send(200, responseBody);
};

/**
 * 调用 Graph 读取容器权限列表，并映射为前端契约类型。
 *
 * @param graphClient 已初始化的 Graph 客户端。
 * @param containerId 容器 ID。
 * @returns 映射后的权限条目数组。
 */
export const fetchMapContainerPermissionFromGraphToEntries = async (
  graphClient: IGraphClient,
  containerId: string,
) => {
  const response = await sendGraphRequest(
    () =>
      graphClient
        .api(getContainerPermissionsGraphPath(containerId))
        .version("v1.0")
        .get(),
    "Unable to read container permissions.",
    500,
  );

  const responseRecord = readGraphToRecord(response);
  const permissionItems = responseRecord.value;

  if (!Array.isArray(permissionItems)) {
    return [];
  }

  return permissionItems.map(mapGraphPermissionToEntryOnUI);
};

/**
 * 顺序执行权限变更：先删、再改、后建。
 *
 * @param graphClient 已初始化的 Graph 客户端。
 * @param containerId 容器 ID。
 * @param changeSet 前端提交的权限变更集合。
 * @returns Promise<void>
 */
export const applyContainerPermissionChangeSet = async (
  graphClient: IGraphClient,
  containerId: string,
  changeSet: IContainerPermissionChangeSetFromUI,
): Promise<void> => {
  for (const deleteChange of changeSet.remove) {
    await sendGraphRequest(
      () =>
        graphClient
          .api(
            getSingleContainerPermissionGraphPath(
              containerId,
              deleteChange.permissionId,
            ),
          )
          .version("v1.0")
          .header("Prefer", "onlyRemoveContainerScopedPermission")
          .delete(),
      "Unable to remove container permissions.",
      500,
    );
  }

  for (const updateChange of changeSet.update) {
    const nextRole = mapUiContainerPermissionRoleToGraph(updateChange.role);

    await sendGraphRequest(
      () =>
        graphClient
          .api(
            getSingleContainerPermissionGraphPath(
              containerId,
              updateChange.permissionId,
            ),
          )
          .version("v1.0")
          .patch({
            roles: [nextRole],
          }),
      "Unable to update container permissions.",
      500,
    );
  }

  for (const createChange of changeSet.create) {
    const createBody = newGraphCreatePermissionBody(createChange);

    await sendGraphRequest(
      () =>
        graphClient
          .api(getContainerPermissionsGraphPath(containerId))
          .version("v1.0")
          .post(createBody),
      "Unable to create container permissions.",
      500,
    );
  }
};

/**
 * 从请求参数中读取容器 ID。
 *
 * @param req Restify 请求对象。
 * @returns 容器 ID；若不存在则返回 undefined。
 */
const readContainerId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.containerId);
};

/**
 * 构造容器权限集合 Graph URL path。
 *
 * @param containerId 容器 ID。
 * @returns 容器权限集合 API 路径。
 */
const getContainerPermissionsGraphPath = (containerId: string): string =>
  `/storage/fileStorage/containers/${encodeURIComponent(containerId)}/permissions`;

/**
 * 构造单条容器权限 Graph URL path。
 *
 * @param containerId 容器 ID。
 * @param permissionId 权限记录 ID。
 * @returns 单条权限 API 路径。
 */
const getSingleContainerPermissionGraphPath = (
  containerId: string,
  permissionId: string,
): string =>
  `${getContainerPermissionsGraphPath(containerId)}/${encodeURIComponent(permissionId)}`;
