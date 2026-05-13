import { sendAuthorizedRequest } from "./apiClient";
import { FrontendApiError } from "../common/errors.ts";
import {
  IContainerPermissionEntry,
  PermissionEntriesByTab,
} from "../components/permissions/models/permissionModels";
import { IContainerPermissionChangeSet } from "../components/permissions/services/containerPermissionDiff";

interface IContainerPermissionsResponse {
  entries: IContainerPermissionEntry[];
}

interface IContainerPermissionErrorResponse {
  code?: string;
  message?: string;
  retryAfterSeconds?: number;
  requestId?: string;
  statusCode?: number;
}

/**
 * 容器权限后端 API 失败时抛出的稳定错误类型。
 */
export class ContainerPermissionApiError extends FrontendApiError {
  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(code, message, {
      name: "ContainerPermissionApiError",
      statusCode: options?.statusCode,
    });
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
  }
}

/**
 * 加载指定容器的当前权限列表。
 */
export const listContainerPermissions = async (
  containerId: string,
): Promise<PermissionEntriesByTab> => {
  const response = await sendAuthorizedRequest(
    `/api/containerPermissions/${encodeURIComponent(containerId)}`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await buildPermissionApiError(response);
  }

  const payload = (await response.json()) as IContainerPermissionsResponse;
  return mapEntriesToTabs(payload.entries);
};

/**
 * 把当前草稿差异提交给后端，并返回服务端确认后的最新权限列表。
 */
export const applyContainerPermissionChanges = async (
  containerId: string,
  changes: IContainerPermissionChangeSet,
): Promise<PermissionEntriesByTab> => {
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
    throw await buildPermissionApiError(response);
  }

  const payload = (await response.json()) as IContainerPermissionsResponse;
  return mapEntriesToTabs(payload.entries);
};

/**
 * 把后端返回的权限数组重新按 people/groups 分组。
 */
const mapEntriesToTabs = (
  entries: IContainerPermissionEntry[],
): PermissionEntriesByTab => {
  const nextEntries: PermissionEntriesByTab = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};

/**
 * 解析后端权限 API 的错误响应。
 */
const buildPermissionApiError = async (
  response: Response,
): Promise<ContainerPermissionApiError> => {
  const payload = await tryReadErrorPayload(response);
  const code = payload?.code ?? "graphFailure";
  const message =
    payload?.message ??
    `Container permission request failed: ${response.status}`;

  return new ContainerPermissionApiError(code, message, {
    retryAfterSeconds: payload?.retryAfterSeconds,
    requestId: payload?.requestId,
    statusCode: payload?.statusCode ?? response.status,
  });
};

/**
 * 尝试把错误响应解析成 JSON。
 */
const tryReadErrorPayload = async (
  response: Response,
): Promise<IContainerPermissionErrorResponse | null> => {
  try {
    return (await response.json()) as IContainerPermissionErrorResponse;
  } catch {
    return null;
  }
};
