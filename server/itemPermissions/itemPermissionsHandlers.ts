import { Request, Response } from "restify";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../auth";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionsResponseFromApi,
} from "../../common/contracts/itemPermissionCommonContracts";
import { sendGraphRequest } from "../../common/graphError";
import {
  mapGraphItemPermissionsToResponse,
  newGraphInvitePermissionBody,
} from "./itemPermissionsGraphAdapters";
import { mapUiItemPermissionRoleToGraph } from "./itemPermissionRoleMapper";
import { parseItemPermissionChangeSet } from "./itemPermissionsRequestParser";
import {
  readGraphToRecord,
  readOptionalString,
} from "../permissionsCore/permissionGraphReaders";
import { createValidationError } from "../common/appErrorHelpers";

/**
 * Step 0 已在当前租户确认 item 显式 invite permission 的 PATCH 稳定可用，
 * 因此当前正式实现直接走 PATCH。
 * 如果未来租户或 Graph 行为发生变化，再切回 replace 即可。
 */
const ITEM_PERMISSION_UPDATE_MODE: "patch" | "replace" = "patch";

/**
 * 读取指定 item 的权限列表，并转换成前端可直接使用的响应结构。
 *
 * 这个处理器对应权限列表读取接口，负责串起鉴权、Graph 访问和响应映射。
 *
 * @param req Restify 请求对象，要求路由参数中包含 `driveId` 和 `itemId`。
 * @param res Restify 响应对象，用于返回权限列表或错误响应。
 * @returns Promise<void>
 */
export const listItemPermissionsFromGraph = async (
  req: Request,
  res: Response,
) => {
  /** 先校验当前请求是否具备管理容器权限，避免未授权访问下游 Graph。 */
  const authorizationResult = await requireContainerManageRequest(req);
  /** 从路由参数中读取目标 drive 标识。 */
  const driveId = readDriveId(req);
  /** 从路由参数中读取目标 item 标识。 */
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const responseBody = await fetchMapItemPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );

  res.send(200, responseBody);
};

/**
 * 将前端提交的 item 权限变更写回到 Microsoft Graph。
 *
 * 这个处理器负责校验请求、解析变更集、执行增删改，再返回最新权限列表。
 *
 * @param req Restify 请求对象，要求包含路由参数和权限变更请求体。
 * @param res Restify 响应对象，用于返回写回后的最新权限状态。
 * @returns Promise<void>
 */
export const applyItemPermissionsToGraph = async (
  req: Request,
  res: Response,
) => {
  /** 权限写操作开始前先完成鉴权。 */
  const authorizationResult = await requireContainerManageRequest(req);
  /** 读取目标 drive 标识。 */
  const driveId = readDriveId(req);
  /** 读取目标 item 标识。 */
  const itemId = readItemId(req);

  if (!driveId || !itemId) {
    throw createValidationError(
      "driveId and itemId route parameters are required.",
    );
  }

  /** 把前端请求体收敛成后端约定的新增、更新、删除三类变更集。 */
  const changeSet = parseItemPermissionChangeSet(req.body);

  if (!changeSet) {
    throw createValidationError(
      "create, update and remove arrays are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);

  await applyItemPermissionChangeSet(graphClient, driveId, itemId, changeSet);

  const responseBody = await fetchMapItemPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );
  res.send(200, responseBody);
};

/**
 * 从 Graph 读取 item 当前权限和父项权限，并映射成统一响应结构。
 *
 * @param graphClient 已带认证能力的 Graph 客户端。
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns 前端可直接消费的权限列表响应。
 */
export const fetchMapItemPermissionsFromGraphToResponse = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<IItemPermissionsResponseFromApi> => {
  const currentPermissions = await readItemPermissions(
    graphClient,
    driveId,
    itemId,
  );
  const parentItemId = await readComparableParentItemId(
    graphClient,
    driveId,
    itemId,
  );
  const parentPermissions = parentItemId
    ? await tryReadParentPermissions(graphClient, driveId, parentItemId)
    : undefined;

  return mapGraphItemPermissionsToResponse({
    currentPermissions,
    parentPermissions,
  });
};

/**
 * 按照新增、更新、删除三个集合，把一批 item 权限变更写入 Graph。
 *
 * @param graphClient 已带认证能力的 Graph 客户端。
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @param changeSet 前端提交并经后端解析后的权限变更集合。
 * @returns Promise<void>
 */
export const applyItemPermissionChangeSet = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  changeSet: IItemPermissionChangeSetFromUI,
): Promise<void> => {
  for (const removeChange of changeSet.remove) {
    await sendGraphRequest(
      () =>
        graphClient
          .api(
            getSingleItemPermissionGraphPath(
              driveId,
              itemId,
              removeChange.permissionId,
            ),
          )
          .version("v1.0")
          .delete(),
      "Unable to remove item permissions.",
      500,
    );
  }

  for (const updateChange of changeSet.update) {
    if (ITEM_PERMISSION_UPDATE_MODE === "patch") {
      const nextRole = mapUiItemPermissionRoleToGraph(updateChange.role);

      await sendGraphRequest(
        () =>
          graphClient
            .api(
              getSingleItemPermissionGraphPath(
                driveId,
                itemId,
                updateChange.permissionId,
              ),
            )
            .version("v1.0")
            .patch({
              roles: [nextRole],
            }),
        "Unable to update item permissions.",
        500,
      );
      continue;
    }

    await sendGraphRequest(
      () =>
        graphClient
          .api(
            getSingleItemPermissionGraphPath(
              driveId,
              itemId,
              updateChange.permissionId,
            ),
          )
          .version("v1.0")
          .delete(),
      "Unable to update item permissions.",
      500,
    );

    const inviteBody = newGraphInvitePermissionBody(updateChange);

    await sendGraphRequest(
      () =>
        graphClient
          .api(getItemInviteGraphPath(driveId, itemId))
          .version("v1.0")
          .post(inviteBody),
      "Unable to update item permissions.",
      500,
    );
  }

  for (const createChange of changeSet.create) {
    const inviteBody = newGraphInvitePermissionBody(createChange);

    await sendGraphRequest(
      () =>
        graphClient
          .api(getItemInviteGraphPath(driveId, itemId))
          .version("v1.0")
          .post(inviteBody),
      "Unable to create item permissions.",
      500,
    );
  }
};

/**
 * 从请求路由参数中读取 driveId。
 *
 * @param req Restify 请求对象。
 * @returns driveId；如果不存在或类型不合法则返回 `undefined`。
 */
const readDriveId = (req: Request): string | undefined => {
  /** 先把 params 正规化成 record，避免直接读取 unknown 结构。 */
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.driveId);
};

/**
 * 从请求路由参数中读取 itemId。
 *
 * @param req Restify 请求对象。
 * @returns itemId；如果不存在或类型不合法则返回 `undefined`。
 */
const readItemId = (req: Request): string | undefined => {
  /** 先把 params 正规化成 record，避免直接读取 unknown 结构。 */
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.itemId);
};

/**
 * 读取指定 item 的原始 Graph 权限数组。
 *
 * @param graphClient 已带认证能力的 Graph 客户端。
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns Graph 返回的权限数组；缺失时保守回退为空数组。
 */
const readItemPermissions = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<unknown[]> => {
  const response = await sendGraphRequest(
    () =>
      graphClient
        .api(getItemPermissionsGraphPath(driveId, itemId))
        .version("v1.0")
        .get(),
    "Unable to read item permissions.",
    500,
  );
  const responseRecord = readGraphToRecord(response);
  const permissionItems = responseRecord.value;
  /** Graph 返回异常结构时保守降级为空数组，避免上层遍历报错。 */
  return Array.isArray(permissionItems) ? permissionItems : [];
};

/**
 * 读取指定 item 可参与继承比对的父项 id。
 *
 * @param graphClient 已带认证能力的 Graph 客户端。
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns 可比较父项 id；顶层 item 或没有父项时返回 `undefined`。
 */
const readComparableParentItemId = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<string | undefined> => {
  const response = await sendGraphRequest(
    () =>
      graphClient
        .api(`${getItemBaseGraphPath(driveId, itemId)}?$select=parentReference`)
        .version("v1.0")
        .get(),
    "Unable to read item parent reference.",
    500,
  );
  const responseRecord = readGraphToRecord(response);
  const parentReference = readGraphToRecord(responseRecord.parentReference);
  const parentPath = readOptionalString(parentReference.path);

  // 顶层 item 的 parent 会指向 drive root / Document Library。
  // 这不是当前模块要拿来做 permissionId 继承对比的“父文件夹 item”，
  // 因此这里显式跳过，避免继续请求一个没有 item-level `/permissions`
  // 语义价值的边界节点。
  if (isDriveRootParentReferencePath(parentPath)) {
    return undefined;
  }

  return readOptionalString(parentReference.id);
};

/**
 * 判断 parentReference.path 是否指向 drive root。
 *
 * Graph 对顶层 item 返回的 parentReference 通常会落在 `.../root:`。
 * 这种父级本质上是容器根边界，不应继续作为“可比较父 item”参与继承判定。
 *
 * @param parentPath Graph 返回的 parentReference.path。
 * @returns 指向 drive root 时返回 `true`。
 */
const isDriveRootParentReferencePath = (
  parentPath: string | undefined,
): boolean => parentPath?.endsWith("/root:") ?? false;

/**
 * 尝试读取父项权限；读取失败时保守降级，不中断当前项权限读取流程。
 *
 * @param graphClient 已带认证能力的 Graph 客户端。
 * @param driveId 父项所属 drive 的标识。
 * @param parentItemId 父项 item 的标识。
 * @returns 父项权限数组；无法读取时返回 `undefined`。
 */
const tryReadParentPermissions = async (
  graphClient: Client,
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

/**
 * 构造读取 item 权限集合的 Graph 路径。
 *
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns `/permissions` 端点路径。
 */
const getItemPermissionsGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/permissions`;

/**
 * 构造 item 基础 Graph 路径。
 *
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns item 资源基础路径。
 */
const getItemBaseGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;

/**
 * 构造单条 item 权限资源的 Graph 路径。
 *
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @param permissionId 目标权限记录的标识。
 * @returns 单条权限资源路径。
 */
const getSingleItemPermissionGraphPath = (
  driveId: string,
  itemId: string,
  permissionId: string,
): string =>
  `${getItemPermissionsGraphPath(driveId, itemId)}/${encodeURIComponent(permissionId)}`;

/**
 * 构造 item invite 写权限使用的 Graph 路径。
 *
 * @param driveId 目标 item 所属 drive 的标识。
 * @param itemId 目标 item 的标识。
 * @returns `/invite` 端点路径。
 */
const getItemInviteGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/invite`;
