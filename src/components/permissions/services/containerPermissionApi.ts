import SpEmbedded from "../../../services/spembedded";
import {
  IContainerPermissionEntry,
  PermissionEntriesByTab,
} from "../models/permissionModels";
import { IContainerPermissionChangeSet } from "./containerPermissionDiff";

type PermissionApiErrorCode =
  | "invalidRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "throttled"
  | "serviceUnavailable"
  | "graphFailure";

interface IContainerPermissionsResponse {
  entries: IContainerPermissionEntry[];
}

interface IContainerPermissionErrorResponse {
  code?: PermissionApiErrorCode;
  message?: string;
  retryAfterSeconds?: number;
  requestId?: string;
  statusCode?: number;
}

/**
 * 容器权限后端 API 失败时抛出的稳定错误类型。
 */
export class ContainerPermissionApiError extends Error {
  readonly code: PermissionApiErrorCode;

  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  readonly statusCode?: number;

  constructor(
    code: PermissionApiErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(message);
    this.name = "ContainerPermissionApiError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
    this.statusCode = options?.statusCode;
  }
}

const spe = new SpEmbedded();

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

  const payload = (await response.json()) as IContainerPermissionsResponse;
  return mapEntriesToTabs(payload.entries);
};

/**
 * 发送带后端 API Bearer Token 的请求。
 */
const sendAuthorizedRequest = async (
  path: string,
  init: RequestInit,
): Promise<Response> => {
  const token = await spe.getApiAccessToken();

  if (!token) {
    throw new ContainerPermissionApiError(
      "unauthorized",
      "You are not signed in, so container permissions are unavailable.",
      {
        statusCode: 401,
      },
    );
  }

  const response = await fetch(`${readApiServerUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.ok) {
    return response;
  }

  throw await buildPermissionApiError(response);
};

/**
 * 延迟读取 API 服务地址，避免仅仅 import 权限模块时就要求测试环境注入完整配置。
 */
const readApiServerUrl = (): string => {
  const apiServerUrl = import.meta.env.VITE_API_SERVER_URL as string | undefined;

  if (!apiServerUrl) {
    throw new Error("[config] Missing required env var: VITE_API_SERVER_URL");
  }

  return apiServerUrl;
};

/**
 * 把后端返回的权限数组重新按 people/groups 分组。
 */
const mapEntriesToTabs = (
  entries: IContainerPermissionEntry[],
): PermissionEntriesByTab => {
  const nextEntries = createEmptyPermissionEntries();

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
    payload?.message ?? `Container permission request failed: ${response.status}`;

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

/**
 * 创建一份空的权限分组结果。
 *
 * 这里保留在 API 映射层本地，避免仅为了一个很小的通用对象工厂
 * 再额外引入独立文件。
 */
const createEmptyPermissionEntries = (): PermissionEntriesByTab => ({
  people: [],
  groups: [],
});
