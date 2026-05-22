import { sendAuthorizedRequest } from "./apiClient";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionsResponseFromApi,
} from "../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemPermissionEntriesLoadResult,
} from "../components/permissions/models/itemPermissionModels";
import {
  buildPermissionApiError,
  mapPermissionEntriesToTabs,
  PermissionApiError,
} from "./permissionApiShared";

export { PermissionApiError as ItemPermissionApiError };

/**
 * 加载指定 item 的当前权限列表。
 */
export const listItemPermissions = async (
  driveId: string,
  itemId: string,
): Promise<IItemPermissionEntriesLoadResult> => {
  const response = await sendAuthorizedRequest(
    `/api/itemPermissions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await buildPermissionApiError(response, "Item permission request");
  }

  const payload = (await response.json()) as IItemPermissionsResponseFromApi;
  return {
    entriesByTab: mapPermissionEntriesToTabs(payload.entries),
  };
};

/**
 * 把 item 权限草稿差异提交给后端，并返回服务端确认后的最新权限列表。
 */
export const applyItemPermissionChanges = async (
  driveId: string,
  itemId: string,
  changes: IItemPermissionChangeSetFromUI,
): Promise<IItemPermissionEntriesLoadResult> => {
  const response = await sendAuthorizedRequest(
    `/api/itemPermissions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(changes),
    },
  );

  if (!response.ok) {
    throw await buildPermissionApiError(response, "Item permission apply request");
  }

  const payload = (await response.json()) as IItemPermissionsResponseFromApi;
  return {
    entriesByTab: mapPermissionEntriesToTabs(payload.entries),
  };
};
