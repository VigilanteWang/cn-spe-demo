import type { Client } from "@microsoft/microsoft-graph-client";
import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionsResponseFromApi,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import {
  isSupportedItemLinkPermissionTarget,
  type IItemLinkPermissionTargetInfo,
} from "../../../common/itemLinkPermissionTargets";
import { sendGraphRequest } from "../../../common/graphError";
import {
  readGraphToRecord,
  readOptionalString,
} from "../../permissionsCore/permissionGraphReaders";
import {
  mapGraphItemLinkPermissions,
  mapItemLinkPermissionTypeToGrantRole,
  newGraphGrantLinkPermissionBody,
  newGraphRevokeLinkPermissionBody,
} from "./itemLinkPermissionGraphAdapters";
import { createItemLinkPermissionError } from "./itemLinkPermissionErrors";

/**
 * 读取指定 item 的 link permissions，并映射成前端可直接消费的响应结构。
 *
 * 这里故意不做“是否为受支持 Office 文件”的前置校验：
 * 1. Graph 数据层面对其它文件和文件夹同样可以返回 link permission。
 * 2. 即使这些 link 在 SharePoint Embedded 里没有实际产品意义，读取结果本身仍然是有效数据。
 * 3. 前端如果 gating 没做好，也不应该因为一次读取而被后端直接拦住。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns 仅包含 link permission 条目的标准响应体。
 */
export const fetchMapItemLinkPermissionsFromGraphToResponse = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<IItemLinkPermissionsResponseFromApi> => {
  try {
    // 读取阶段只关心 Graph 当前返回了哪些 link permission，不在这里做目标文件类型拦截。
    const permissions = await readItemPermissions(graphClient, driveId, itemId);

    return {
      entries: mapGraphItemLinkPermissions(permissions),
    };
  } catch (error: unknown) {
    throw createItemLinkPermissionError(
      "itemLinkPermissionReadFailed",
      "Unable to read item link permissions.",
      { cause: error },
    );
  }
};

/**
 * 按固定顺序应用 link permission 变更，并返回应用后的最新列表。
 *
 * 这里仍然保留“仅受支持 Office 文件可写”的最终校验：
 * 1. 读取可以放行，方便前端看到真实 Graph 数据。
 * 2. 写入会真正改变 sharing 行为，所以仍要在服务端兜底拦截。
 *
 * 当前顺序为：
 * 1. 删除整条 link
 * 2. 创建新 link
 * 3. 对已有 users link 新增 recipients
 * 4. 对已有 users link 撤销 recipients
 * 5. 重新读取最新 link 列表
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @param changeSet 前端提交的 link permission 变更集合。
 * @returns 应用完成后的最新 link permission 列表。
 */
export const applyItemLinkPermissionChangeSet = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
  changeSet: IApplyItemLinkPermissionChangesRequest,
): Promise<IItemLinkPermissionsResponseFromApi> => {
  // 只有真正写入 Graph 前才做产品边界校验，避免把“读取当前状态”和“是否允许写入”混为一谈。
  await ensureSupportedItemLinkPermissionTarget(graphClient, driveId, itemId);

  for (const deleteChange of changeSet.deleteLinks) {
    try {
      await sendGraphRequest(
        () =>
          graphClient
            .api(
              getSingleItemPermissionGraphPath(
                driveId,
                itemId,
                deleteChange.permissionId,
              ),
            )
            .version("v1.0")
            .delete(),
        "Unable to delete item link permission.",
        500,
      );
    } catch (error: unknown) {
      throw createItemLinkPermissionError(
        "itemLinkPermissionDeleteFailed",
        "Unable to delete item link permission.",
        { cause: error },
      );
    }
  }

  for (const createChange of changeSet.create) {
    try {
      const createResponse = await sendGraphRequest(
        () =>
          graphClient
            .api(getItemCreateLinkGraphPath(driveId, itemId))
            .version("v1.0")
            .post({
              scope: createChange.scope,
              type: createChange.type,
            }),
        "Unable to create item link permission.",
        500,
      );

      // 只有 users scope 才需要继续补一段 grant，把具体主体授予到刚创建的 link 上。
      if (createChange.scope === "users" && createChange.recipients?.length) {
        const createResponseRecord = readGraphToRecord(createResponse);
        const shareId = readOptionalString(createResponseRecord.shareId);

        if (!shareId) {
          throw createItemLinkPermissionError(
            "itemLinkPermissionCreateFailed",
            "The created users link did not return a shareId.",
            { statusCode: 502, cause: createResponse },
          );
        }

        // grant 直接复用 createLink 返回的 shareId，避免再从 webUrl 反向编码。
        await grantRecipientsForLink(
          graphClient,
          shareId,
          createChange.type,
          createChange.recipients,
        );
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "itemLinkPermissionCreateFailed"
      ) {
        throw error;
      }

      throw createItemLinkPermissionError(
        "itemLinkPermissionCreateFailed",
        "Unable to create item link permission.",
        { cause: error },
      );
    }
  }

  for (const grantChange of changeSet.grantRecipients) {
    try {
      await grantRecipientsForLink(
        graphClient,
        grantChange.shareId,
        grantChange.type,
        grantChange.recipients,
      );
    } catch (error: unknown) {
      throw createItemLinkPermissionError(
        "itemLinkPermissionGrantFailed",
        "Unable to grant recipients to item link permission.",
        { cause: error },
      );
    }
  }

  for (const revokeChange of changeSet.revokeRecipients) {
    try {
      await sendGraphRequest(
        () =>
          graphClient
            .api(getSharePermissionRevokePath(revokeChange.shareId))
            // 当前项目只在这一个调用点最小范围使用 beta，避免把整体 Graph 版本策略带偏。
            .version("beta")
            .post(newGraphRevokeLinkPermissionBody(revokeChange)),
        "Unable to revoke recipients from item link permission.",
        500,
      );
    } catch (error: unknown) {
      throw createItemLinkPermissionError(
        "itemLinkPermissionRevokeFailed",
        "Unable to revoke recipients from item link permission.",
        { cause: error },
      );
    }
  }

  // 变更落地后统一回读最新快照，让前端直接以服务端确认结果为准。
  return fetchMapItemLinkPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );
};

/**
 * 读取目标 item 的最小元数据，并在服务端执行“是否允许写入 link”校验。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @throws 当目标不是受支持的 Office 文件时抛出稳定的业务错误。
 */
const ensureSupportedItemLinkPermissionTarget = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
) => {
  const target = await readItemLinkPermissionTarget(
    graphClient,
    driveId,
    itemId,
  );

  if (!isSupportedItemLinkPermissionTarget(target)) {
    throw createItemLinkPermissionError(
      "itemLinkPermissionUnsupportedTarget",
      "Item link share is only supported for supported Office files in SharePoint Embedded.",
      { statusCode: 409, cause: target },
    );
  }
};

/**
 * 对指定 link 执行 `permission/grant`，把 recipients 授予到该 link 上。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param shareId createLink 或读取结果返回的稳定 shareId。
 * @param type link 自身的权限类型，用于推导 grant 角色。
 * @param recipients 需要授予到 link 上的主体列表。
 */
const grantRecipientsForLink = async (
  graphClient: Client,
  shareId: string,
  type: ItemLinkPermissionType,
  recipients: NonNullable<
    IApplyItemLinkPermissionChangesRequest["create"][number]["recipients"]
  >,
) => {
  const grantBody = newGraphGrantLinkPermissionBody({
    type,
    recipients,
  });

  const expectedRole = mapItemLinkPermissionTypeToGrantRole(type);
  // 这里额外做一次自检，避免适配层和 service 层角色映射失败后把错误请求发给 Graph。
  if (grantBody.roles[0] !== expectedRole) {
    throw createItemLinkPermissionError(
      "itemLinkPermissionGrantRoleMismatch",
      "The computed grant role does not match the link permission type.",
      { statusCode: 400, cause: { type, roles: grantBody.roles } },
    );
  }

  await sendGraphRequest(
    () =>
      graphClient
        .api(getSharePermissionGrantPath(shareId))
        .version("v1.0")
        .post(grantBody),
    "Unable to grant recipients to item link permission.",
    500,
  );
};

/**
 * 读取服务端判定目标文件类型所需的最小 item 元数据。
 *
 * 这里只选 `name,file,folder` 三个字段，避免为了一个类型判断把整条 DriveItem 都取回来。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns 供 `isSupportedItemLinkPermissionTarget(...)` 使用的最小元数据快照。
 */
const readItemLinkPermissionTarget = async (
  graphClient: Client,
  driveId: string,
  itemId: string,
): Promise<IItemLinkPermissionTargetInfo> => {
  const response = await sendGraphRequest(
    () =>
      graphClient
        .api(
          `${getItemBaseGraphPath(driveId, itemId)}?$select=name,file,folder`,
        )
        .version("v1.0")
        .get(),
    "Unable to read item metadata for link permissions.",
    500,
  );
  const responseRecord = readGraphToRecord(response);
  const fileRecord = readGraphToRecord(responseRecord.file);
  const folderRecord = readGraphToRecord(responseRecord.folder);

  return {
    name: readOptionalString(responseRecord.name),
    mimeType: readOptionalString(fileRecord.mimeType),
    // Graph 中 `folder` facet 只要存在内容，就表示当前 item 实际上是文件夹。
    isFolder: Object.keys(folderRecord).length > 0,
  };
};

/**
 * 读取指定 item 当前的原始 Graph permission 列表。
 *
 * 这里不提前筛选 link permission，保持 service 层先拿到完整 Graph 返回，
 * 再交给 adapter 做 link 专用映射和过滤。
 *
 * @param graphClient 当前请求复用的 Graph client。
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns Graph 返回的原始 permission 数组；缺失时回退为空数组。
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
    "Unable to read item link permissions.",
    500,
  );
  const responseRecord = readGraphToRecord(response);
  return Array.isArray(responseRecord.value) ? responseRecord.value : [];
};

/**
 * 拼接 item permissions 列表的 Graph 路径。
 *
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns `/drives/{driveId}/items/{itemId}/permissions` 路径。
 */
const getItemPermissionsGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/permissions`;

/**
 * 拼接单个 item 的基础 Graph 路径。
 *
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns `/drives/{driveId}/items/{itemId}` 路径。
 */
const getItemBaseGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;

/**
 * 拼接 createLink 的 Graph 路径。
 *
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @returns `/drives/{driveId}/items/{itemId}/createLink` 路径。
 */
const getItemCreateLinkGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/createLink`;

/**
 * 拼接单条 item permission 的 Graph 路径。
 *
 * @param driveId 目标 item 所属的 drive ID。
 * @param itemId 目标 item 的 Graph item ID。
 * @param permissionId 目标 permission 的 Graph ID。
 * @returns `/drives/{driveId}/items/{itemId}/permissions/{permissionId}` 路径。
 */
const getSingleItemPermissionGraphPath = (
  driveId: string,
  itemId: string,
  permissionId: string,
): string =>
  `${getItemPermissionsGraphPath(driveId, itemId)}/${encodeURIComponent(permissionId)}`;

/**
 * 拼接 `permission/grant` 的 share 路径。
 *
 * @param shareId link 对应的稳定 shareId。
 * @returns `/shares/{shareId}/permission/grant` 路径。
 */
const getSharePermissionGrantPath = (shareId: string): string =>
  `/shares/${encodeURIComponent(shareId)}/permission/grant`;

/**
 * 拼接 `permission/revokeGrants` 的 share 路径。
 *
 * @param shareId link 对应的稳定 shareId。
 * @returns `/shares/{shareId}/permission/revokeGrants` 路径。
 */
const getSharePermissionRevokePath = (shareId: string): string =>
  `/shares/${encodeURIComponent(shareId)}/permission/revokeGrants`;

export { isSupportedItemLinkPermissionTarget };
