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
import {
  createGraphClient,
  getGraphToken,
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
import {
  getContainerPermissionsApiErrorResponseStatus,
  mapContainerPermissionsGraphError,
  toContainerPermissionsApiErrorResponseBody,
} from "./containerPermissionsError";
import type { IGraphClient } from "./containerPermissionsInternalContracts";
import { mapUiContainerPermissionRoleToGraph } from "./containerPermissionRoleMapper";
import { parseContainerPermissionChangeSet } from "./containerPermissionsRequestParser";
import {
  readOptionalString,
  readGraphToRecord,
} from "./containerPermissionsReaders";
import { BackendValidationError } from "../common/errors";

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
    throw new BackendValidationError("containerId route parameter is required.");
  }

  try {
    // 通过 OBO 流程获取当前用户上下文下的 Graph token。
    const graphToken = await getGraphToken(authorizationResult.token);
    // 基于本次请求 token 创建 Graph 客户端，避免跨请求串用身份。
    const graphClient = createGraphClient(graphToken) as IGraphClient;
    const entries = await fetchMapContainerPermissionFromGraphToEntries(
      graphClient,
      containerId,
    );

    // 使用对象响应结构，便于后续无破坏性扩展更多字段。
    const responseBody: IContainerPermissionsResponseFromApi = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    // 统一走错误映射，保证前端拿到稳定的错误码与消息结构。
    sendContainerPermissionMappedGraphError(res, error);
  }
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
    throw new BackendValidationError("containerId route parameter is required.");
  }

  // 解析并校验 create/update/remove 三段变更数据。
  const changeSet = parseContainerPermissionChangeSet(req.body);

  if (!changeSet) {
    throw new BackendValidationError(
      "create, update and remove arrays are required.",
    );
  }

  try {
    // 使用请求级 token 构造 Graph 客户端，保证权限边界正确。
    const graphToken = await getGraphToken(authorizationResult.token);
    const graphClient = createGraphClient(graphToken) as IGraphClient;

    await applyContainerPermissionChangeSet(
      graphClient,
      containerId,
      changeSet,
    );

    // 变更完成后重新拉取一次，确保返回的是服务端真实状态，而不是本地猜测状态。
    const entries = await fetchMapContainerPermissionFromGraphToEntries(
      graphClient,
      containerId,
    );
    const responseBody: IContainerPermissionsResponseFromApi = { entries };
    res.send(200, responseBody);
  } catch (error: unknown) {
    // 所有异常统一转换为稳定 API 错误格式。
    sendContainerPermissionMappedGraphError(res, error);
  }
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
  try {
    // 使用 v1.0 权限接口读取容器权限集合。
    const response = await graphClient
      .api(getContainerPermissionsGraphPath(containerId))
      .version("v1.0")
      .get();

    // Graph 返回值是动态结构，这里先转成可安全读取的 record。
    const responseRecord = readGraphToRecord(response);
    const permissionItems = responseRecord.value;

    // 容错处理：若返回值不符合预期，按空列表处理，避免前端崩溃。
    if (!Array.isArray(permissionItems)) {
      return [];
    }

    // 每一项原始 Graph permission 都交给适配层翻译成共同契约 entry。
    return permissionItems.map(mapGraphPermissionToEntryOnUI);
  } catch (error: unknown) {
    // 将原始 Graph/SDK 错误映射成项目内稳定错误类型。
    throw mapContainerPermissionsGraphError(error);
  }
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
  try {
    // 先删再改再建，可减少同一 principal 残留权限导致的冲突与排查复杂度。
    for (const deleteChange of changeSet.remove) {
      await graphClient
        .api(
          getSingleContainerPermissionGraphPath(
            containerId,
            deleteChange.permissionId,
          ),
        )
        .version("v1.0")
        // 删除时显式带上 Prefer，避免误删更高范围继承来的权限。
        .header("Prefer", "onlyRemoveContainerScopedPermission")
        .delete();
    }

    // 更新阶段只改角色，不变更 principal 身份字段。
    for (const updateChange of changeSet.update) {
      await graphClient
        .api(
          getSingleContainerPermissionGraphPath(
            containerId,
            updateChange.permissionId,
          ),
        )
        .version("v1.0")
        .patch({
          // PATCH 时只发送角色变更，保持请求体最小化。
          roles: [mapUiContainerPermissionRoleToGraph(updateChange.role)],
        });
    }

    // 创建阶段使用 Graph 要求的 grantedToV2 载荷结构。
    for (const createChange of changeSet.create) {
      await graphClient
        .api(getContainerPermissionsGraphPath(containerId))
        .version("v1.0")
        .post(newGraphCreatePermissionBody(createChange));
    }
  } catch (error: unknown) {
    throw mapContainerPermissionsGraphError(error);
  }
};

/**
 * 将任意异常映射为统一的容器权限 API 错误响应并发送。
 *
 * @param res Restify 响应对象。
 * @param error 捕获到的未知异常。
 */
const sendContainerPermissionMappedGraphError = (
  res: Response,
  error: unknown,
) => {
  const mappedError = mapContainerPermissionsGraphError(error);
  res.send(
    getContainerPermissionsApiErrorResponseStatus(mappedError),
    toContainerPermissionsApiErrorResponseBody(mappedError),
  );
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
