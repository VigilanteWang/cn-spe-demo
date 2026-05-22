import { sendAuthorizedRequest } from "./apiClient";
import type {
  IContainerPermissionChangeSetFromUI,
  IContainerPermissionEntryForUI,
  IContainerPermissionsResponseFromApi,
} from "../../common/contracts/containerPermissionCommonContracts";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";
import {
  buildPermissionApiError,
  mapPermissionEntriesToTabs,
  PermissionApiError,
} from "./permissionApiShared";

export { PermissionApiError, PermissionApiError as ContainerPermissionApiError };

/**
 * 加载指定容器的当前权限列表。
 */
export const listContainerPermissions = async (
  containerId: string,
): Promise<PermissionEntriesByTab<IContainerPermissionEntryForUI>> => {
  const response = await sendAuthorizedRequest(
    `/api/containerPermissions/${encodeURIComponent(containerId)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await buildPermissionApiError(response, "Container permission request");
  }

  const payload =
    (await response.json()) as IContainerPermissionsResponseFromApi;
  return mapPermissionEntriesToTabs(payload.entries);
};

/**
 * 把当前草稿差异提交给后端，并返回服务端确认后的最新权限列表。
 */
export const applyContainerPermissionChanges = async (
  containerId: string,
  changes: IContainerPermissionChangeSetFromUI,
): Promise<PermissionEntriesByTab<IContainerPermissionEntryForUI>> => {
  const response = await sendAuthorizedRequest(
    `/api/containerPermissions/${encodeURIComponent(containerId)}/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(changes),
    },
  );

  if (!response.ok) {
    throw await buildPermissionApiError(response, "Container permission apply request");
  }

  const payload =
    (await response.json()) as IContainerPermissionsResponseFromApi;
  return mapPermissionEntriesToTabs(payload.entries);
};
