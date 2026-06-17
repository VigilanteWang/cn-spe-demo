import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionsResponseFromApi,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import { sendGraphRequest } from "../../../common/graphError";
import type { IPermissionGraphClient } from "../../permissionsCore/permissionGraphContracts";
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

const SUPPORTED_OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-word.document.macroEnabled.12",
  "application/vnd.ms-word.template.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-excel.template.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  "application/vnd.ms-powerpoint.template.macroEnabled.12",
  "application/vnd.ms-powerpoint.slideshow.macroEnabled.12",
]);

const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".dotx",
  ".docm",
  ".dotm",
  ".xls",
  ".xlsx",
  ".xltx",
  ".xlsm",
  ".xltm",
  ".ppt",
  ".pptx",
  ".potx",
  ".ppsx",
  ".pptm",
  ".potm",
  ".ppsm",
]);

interface IItemLinkPermissionTargetInfo {
  name?: string;
  mimeType?: string;
  isFolder: boolean;
}

/**
 * 读取并映射 item links 列表。
 */
export const fetchMapItemLinkPermissionsFromGraphToResponse = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
): Promise<IItemLinkPermissionsResponseFromApi> => {
  try {
    await ensureSupportedItemLinkPermissionTarget(graphClient, driveId, itemId);
    const permissions = await readItemPermissions(graphClient, driveId, itemId);

    return {
      entries: mapGraphItemLinkPermissions(permissions),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "itemLinkPermissionUnsupportedTarget"
    ) {
      throw error;
    }

    throw createItemLinkPermissionError(
      "itemLinkPermissionReadFailed",
      "Unable to read item link permissions.",
      { cause: error },
    );
  }
};

/**
 * 应用 link permission 变更，并返回最新列表。
 */
export const applyItemLinkPermissionChangeSet = async (
  graphClient: IPermissionGraphClient,
  driveId: string,
  itemId: string,
  changeSet: IApplyItemLinkPermissionChangesRequest,
): Promise<IItemLinkPermissionsResponseFromApi> => {
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
    } catch (error) {
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

        await grantRecipientsForLink(
          graphClient,
          shareId,
          createChange.type,
          createChange.recipients,
        );
      }
    } catch (error) {
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
    } catch (error) {
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
            .version("beta")
            .post(newGraphRevokeLinkPermissionBody(revokeChange)),
        "Unable to revoke recipients from item link permission.",
        500,
      );
    } catch (error) {
      throw createItemLinkPermissionError(
        "itemLinkPermissionRevokeFailed",
        "Unable to revoke recipients from item link permission.",
        { cause: error },
      );
    }
  }

  return fetchMapItemLinkPermissionsFromGraphToResponse(
    graphClient,
    driveId,
    itemId,
  );
};

/**
 * 供测试与后续 UI 轻量复用的目标文件判断。
 */
export const isSupportedItemLinkPermissionTarget = (
  target: IItemLinkPermissionTargetInfo,
): boolean => {
  if (target.isFolder) {
    return false;
  }

  if (target.mimeType && SUPPORTED_OFFICE_MIME_TYPES.has(target.mimeType)) {
    return true;
  }

  const normalizedName = target.name?.toLowerCase();

  if (!normalizedName) {
    return false;
  }

  const lastDotIndex = normalizedName.lastIndexOf(".");
  const extension =
    lastDotIndex >= 0 ? normalizedName.slice(lastDotIndex) : undefined;

  return extension ? SUPPORTED_OFFICE_EXTENSIONS.has(extension) : false;
};

const ensureSupportedItemLinkPermissionTarget = async (
  graphClient: IPermissionGraphClient,
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

const grantRecipientsForLink = async (
  graphClient: IPermissionGraphClient,
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

const readItemLinkPermissionTarget = async (
  graphClient: IPermissionGraphClient,
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
    isFolder: Object.keys(folderRecord).length > 0,
  };
};

const readItemPermissions = async (
  graphClient: IPermissionGraphClient,
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

const getItemPermissionsGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/permissions`;

const getItemBaseGraphPath = (driveId: string, itemId: string): string =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;

const getItemCreateLinkGraphPath = (driveId: string, itemId: string): string =>
  `${getItemBaseGraphPath(driveId, itemId)}/createLink`;

const getSingleItemPermissionGraphPath = (
  driveId: string,
  itemId: string,
  permissionId: string,
): string =>
  `${getItemPermissionsGraphPath(driveId, itemId)}/${encodeURIComponent(permissionId)}`;

const getSharePermissionGrantPath = (shareId: string): string =>
  `/shares/${encodeURIComponent(shareId)}/permission/grant`;

const getSharePermissionRevokePath = (shareId: string): string =>
  `/shares/${encodeURIComponent(shareId)}/permission/revokeGrants`;
